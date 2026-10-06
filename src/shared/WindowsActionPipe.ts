import {
  runPerformanceDiagnostic,
  performanceDiagnosticNow,
  performanceDiagnosticElapsed,
  performanceDiagnosticText,
  buildPerformanceScriptTiming,
  buildPerformanceNativeStageWriters,
  buildPerformanceNativeLaunchTiming
} from './PerformanceDiagnostics'
import { spawn } from 'node:child_process'
import type { Socket } from 'node:net'
import { windowsPowerShellEnv, resolveWindowsPowerShellPath } from './WindowsSystemPaths'
import { AppHelperError } from './WindowsHelperState'
import type { WindowsLaunchDiagnostic } from './WindowsRunAs'
import {
  buildWindowsActionStagePrelude,
  parseWindowsActionStageLine,
  type WindowsActionStageEvent
} from './WindowsActionStage'
import {
  acceptOperationTimingLine,
  hasOperationTiming,
  markOperationStage
} from './OperationTiming'

const quote = (value: string) => `'${value.replace(/'/g, "''")}'`

/**
 * 固定短引导只从匿名 stdin 读取 broker 代码。完整 C#/PowerShell 脚本可超过 Windows
 * 32767 字符命令行上限，不能继续把整个 broker 放进 EncodedCommand；无需临时文件。
 * 第一行是 UTF-8 代码的 base64，第二行由 broker 读取业务 JSON；后续 stdin 保持父存活监视。
 * 三个阶段共享一个显式 StreamReader。Console.InputEncoding 的 setter 会重新创建
 * Console.In，丢弃原读取器预读的后续 JSON 前缀，即使两次设置的编码相同也不能使用。
 * 使用独立严格 UTF-8 读取器避免控制台编码/代码页变化影响运输；模块加载进度不进诊断。
 * .NET Framework 的 StandardInput writer 可能先写 UTF-8 BOM，仅在代码帧开头移除它；
 * 不启用 UTF-16/其他编码自动探测，也不修改业务 JSON 或用于 digest 的脚本内容。
 */
export const windowsActionBrokerBootstrap = `$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue';
${buildWindowsActionStagePrelude()}
Write-FlyEnvActionStage 'broker.bootstrap'
$script:FlyEnvBrokerInput=[IO.StreamReader]::new([Console]::OpenStandardInput(), [Text.UTF8Encoding]::new($false, $true), $false, 4096, $true)
$source=$script:FlyEnvBrokerInput.ReadLine()
Write-FlyEnvActionStage 'broker.source-read'
if ($null -eq $source) { exit 1 }
$decoded=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($source.TrimStart([char]0xFEFF)))
Write-FlyEnvActionStage 'broker.source-decoded'
& ([ScriptBlock]::Create($decoded))`

/**
 * 独立一次性管道 broker，不使用常驻 Helper。Node net 无法公开设置 Windows
 * PipeSecurity/核对原生对端，因此由继承原用户令牌的系统 PowerShell 托管 native pipe。
 * 业务脚本只经匿名 stdin 输入；broker 代码、管道名与 nonce 可以公开，不是权限凭据。
 */
const nativePipeSource = String.raw`
using System;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Diagnostics;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Security.AccessControl;
using Microsoft.Win32.SafeHandles;
// Only launch diagnostics are returned here. Business results still require native pipe authentication.
public sealed class FlyEnvActionLaunch {
  public string phase = "launch";
  public bool childStarted;
  public int? nativeErrorCode;
  public string exceptionType;
  public bool pipeConnectFailed;
  public string message;
  public int code = 1;
}
public static class FlyEnvActionPipe {
  ${buildPerformanceNativeStageWriters()}
  // Run Process.Start/WaitForExit outside the PowerShell runspace so it can serve the pipe
  // while consent is pending and while the client is waiting for its private action payload.
  // Reusing the already started broker removes a second ordinary PowerShell startup.
  // LongRunning gives blocking consent/exit waits a dedicated background thread; small
  // enterprise VMs must not wait for the thread pool to grow behind the stdin watcher.
  public static System.Threading.Tasks.Task<FlyEnvActionLaunch> Launch(string executable, string arguments, bool elevated, bool timing) {
    return System.Threading.Tasks.Task.Factory.StartNew(delegate {
      var result = new FlyEnvActionLaunch(); Process process = null;
      Stopwatch launchClock = ${performanceDiagnosticText('Stopwatch.StartNew()', 'null')};
      try {
        var info = new ProcessStartInfo(executable, arguments);
        info.UseShellExecute = elevated;
        info.CreateNoWindow = true;
        info.WindowStyle = ProcessWindowStyle.Hidden;
        if (elevated) info.Verb = "runas";
        else {
          // An ordinary child must not inherit broker stdin or write into its authenticated
          // result/launch protocol. Its own stdout/stderr are drained and never trusted.
          info.RedirectStandardInput = true;
          info.RedirectStandardOutput = true;
          info.RedirectStandardError = true;
        }
        ${buildPerformanceNativeLaunchTiming('start')}
        try {
          WriteStage("launcher.start-request", launchClock);
          process = Process.Start(info);
          // Record the potentially started state immediately, before any diagnostic/handle check.
          result.childStarted = true; result.phase = "wait";
          WriteStage("launcher.start-returned", launchClock);
        }
        finally {
          ${buildPerformanceNativeLaunchTiming('end')}
        }
        // Start may succeed without returning a usable handle; that is potentially executed.
        if (process == null) throw new InvalidOperationException("Windows did not return an action process handle");
        if (!elevated) {
          process.StandardInput.Close();
          // CopyToAsync discards chunks without accumulating attacker-controlled output lines.
          process.StandardOutput.BaseStream.CopyToAsync(Stream.Null);
          process.StandardError.BaseStream.CopyToAsync(Stream.Null);
        }
        process.WaitForExit(); result.code = process.ExitCode;
        WriteStage("launcher.child-exited", launchClock);
        if (result.code == 73) {
          result.nativeErrorCode = 73; result.pipeConnectFailed = true;
          result.message = "The action process could not connect to the FlyEnv result pipe";
        }
      } catch (Exception error) {
        while (error.InnerException != null) error = error.InnerException;
        var native = error as Win32Exception;
        if (native != null) result.nativeErrorCode = native.NativeErrorCode;
        result.exceptionType = error.GetType().FullName; result.message = error.Message;
      } finally { if (process != null) process.Dispose(); }
      return result;
    }, System.Threading.Tasks.TaskCreationOptions.LongRunning);
  }
  // The anonymous stdin handle belongs to Node. Its EOF means the actual parent died or closed.
  // Exit closes the native pipe even if Node was terminated before its grace-period timer ran.
  // Continue using the bootstrap's exact reader: it may already buffer bytes past the JSON frame.
  // Opening Console.In here would create a competing consumer and could hide a buffered EOF/data.
  public static void WatchParent(TextReader input) {
    System.Threading.Tasks.Task.Factory.StartNew(delegate {
      try { while (input.ReadLine()!=null) {} } catch {} finally { Environment.Exit(0); }
    }, System.Threading.Tasks.TaskCreationOptions.LongRunning);
  }
  [StructLayout(LayoutKind.Sequential)] struct SA { public int size; public IntPtr descriptor; public int inherit; }
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern SafePipeHandle CreateNamedPipe(string name, uint mode, uint type, uint instances, uint output, uint input, uint timeout, ref SA sa);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetNamedPipeClientProcessId(SafePipeHandle pipe, out uint pid);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool ProcessIdToSessionId(uint pid, out uint session);
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool QueryFullProcessImageName(IntPtr process, int flags, StringBuilder path, ref int size);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool GetTokenInformation(IntPtr token, int kind, out int value, int size, out int returned);

  // Original SID gets read/write without FILE_CREATE_PIPE_INSTANCE; BA/SYSTEM are trusted administrators.
  // FIRST_PIPE_INSTANCE refuses a squatted name, and REJECT_REMOTE_CLIENTS limits this pipe to this device.
  public static NamedPipeServerStream Create(string name, string sid) {
    var acl = new RawSecurityDescriptor("D:P(A;;0x12019b;;;" + sid + ")(A;;GA;;;BA)(A;;GA;;;SY)");
    var bytes = new byte[acl.BinaryLength]; acl.GetBinaryForm(bytes, 0);
    IntPtr descriptor = Marshal.AllocHGlobal(bytes.Length);
    try {
      Marshal.Copy(bytes, 0, descriptor, bytes.Length);
      var sa = new SA { size=Marshal.SizeOf(typeof(SA)), descriptor=descriptor, inherit=0 };
      var handle = CreateNamedPipe("\\\\.\\pipe\\" + name, 0x40080003, 8, 1, 65536, 65536, 0, ref sa);
      if (handle.IsInvalid) { int error=Marshal.GetLastWin32Error(); handle.Dispose(); throw new Win32Exception(error); }
      try { return new NamedPipeServerStream(PipeDirection.InOut, true, false, handle); }
      catch { handle.Dispose(); throw; }
    } finally { Marshal.FreeHGlobal(descriptor); }
  }

  // Read a bounded UTF-8 frame before impersonating: Windows uses the token associated with the last read.
  // A peer that stalls is disconnected after a bounded interval; it cannot hold the channel indefinitely.
  public static string ReadLine(NamedPipeServerStream pipe, int maxBytes, int timeout) {
    using (var data = new MemoryStream()) {
      var bytes = new byte[4096]; var deadline=DateTime.UtcNow.AddMilliseconds(timeout);
      while (true) {
        if (DateTime.UtcNow>=deadline) throw new TimeoutException("Pipe peer timed out");
        int left=(int)Math.Max(1, (deadline-DateTime.UtcNow).TotalMilliseconds);
        var pending=pipe.ReadAsync(bytes, 0, bytes.Length);
        if (!pending.Wait(left)) throw new TimeoutException("Pipe peer timed out");
        int count=pending.Result;
        if (count==0) throw new EndOfStreamException();
        int end=Array.IndexOf(bytes, (byte)10, 0, count); int length=end<0 ? count : end;
        if (data.Length+length>maxBytes) throw new InvalidDataException("Pipe result exceeds its limit");
        data.Write(bytes, 0, length);
        if (end>=0) return new UTF8Encoding(false, true).GetString(data.ToArray()).TrimEnd((char)13);
      }
    }
  }

  // Compare actual native PID, session and image; never trust fields claimed in a JSON response.
  // The identification token must be elevated for privileged actions, including alternate-account UAC.
  public static bool Authenticate(NamedPipeServerStream pipe, string sid, bool elevated, string executable) {
    uint pid, session, ownSession;
    if (!GetNamedPipeClientProcessId(pipe.SafePipeHandle, out pid) ||
        !ProcessIdToSessionId(pid, out session) || !ProcessIdToSessionId((uint)Process.GetCurrentProcess().Id, out ownSession) || session!=ownSession) return false;
    IntPtr process=OpenProcess(0x1000, false, pid);
    if (process==IntPtr.Zero) return false;
    try {
      var path=new StringBuilder(32768); int size=path.Capacity;
      if (!QueryFullProcessImageName(process, 0, path, ref size) || !String.Equals(path.ToString(), executable, StringComparison.OrdinalIgnoreCase)) return false;
    } finally { CloseHandle(process); }
    bool accepted=false;
    pipe.RunAsClient(delegate {
      using (var identity=WindowsIdentity.GetCurrent(true)) {
        if (identity==null) return;
        if (!elevated) { accepted=identity.User.Value==sid; return; }
        int value, returned;
        accepted=GetTokenInformation(identity.Token, 20, out value, 4, out returned) && value!=0 &&
          new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator);
      }
    });
    return accepted;
  }
}
`

/**
 * 客户端只授予 Identification：服务端可读 SID/权限，不能借管理员身份执行动作，
 * 跨账户查询也不要求普通用户拥有 SeImpersonatePrivilege。有限读写权避免 GENERIC_WRITE
 * 包含 FILE_CREATE_PIPE_INSTANCE，原用户不能创建同名的额外管道实例。
 */
export const buildWindowsPipeClient = (pipeName: string) =>
  `$pipe = New-Object IO.Pipes.NamedPipeClientStream('.', ${quote(pipeName)}, [IO.Pipes.PipeAccessRights]::ReadWrite, [IO.Pipes.PipeOptions]::None, [Security.Principal.TokenImpersonationLevel]::Identification, [IO.HandleInheritability]::None)`

export type WindowsActionPipe = {
  resultReady: Promise<void>
  /** broker 的直接子进程退出信息只定位启动问题，不能代替认证后的业务结果。 */
  launchReady: Promise<{ code: number; diagnostic: WindowsLaunchDiagnostic }>
  close(): void
  retain(): void
}

/**
 * Ready 后才允许启动客户端；编译、ACL、创建失败发生在业务执行之前。
 * 成功结果仍由调用方校验 nonce/字段/首份终态；broker 只提供 OS 身份边界与帧大小限制。
 */
type WindowsActionPipeOptions = {
  pipeName: string
  nonce: string
  elevated: boolean
  maxBytes: number
  payload?: { script: string }
  /** 生产由 broker 启动固定引导；测试替换 launcher 时不启用这一分支。 */
  launch?: { argumentsText: string }
  onResult: (result: unknown) => void
  /** 固定阶段观察器；错误隔离在运输层，不能影响 READY、认证或动作终态。 */
  onStage?: (event: WindowsActionStageEvent) => void
}

/** 导出固定脚本生成器，供无系统写入的语法/安全边界回归检查使用。 */
export const buildWindowsActionPipeBroker = (
  options: WindowsActionPipeOptions,
  reportTiming = hasOperationTiming()
) => `
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
try {
  Write-FlyEnvActionStage 'broker.compile-start'
  ${buildPerformanceScriptTiming('broker.compile', 'start', reportTiming)}
  Add-Type -TypeDefinition ${quote(nativePipeSource)}
  Write-FlyEnvActionStage 'broker.compile-end'
  ${buildPerformanceScriptTiming('broker.compile', 'end', reportTiming)}
  # The bootstrap may have prefetched part of this JSON while reading the code frame.
  # Reuse its reader; do not change Console.InputEncoding or reopen standard input here.
  # Parse failures must not echo a fragment of private file content into the public diagnostic.
  try {
    Write-FlyEnvActionStage 'broker.input-read-start'
    $inputLine=$script:FlyEnvBrokerInput.ReadLine()
    Write-FlyEnvActionStage 'broker.input-read-end'
    $inputData=$inputLine | ConvertFrom-Json
    Write-FlyEnvActionStage 'broker.input-parse-end'
  }
  catch { throw 'Invalid Windows action input frame' }
  ${options.launch ? '' : '[FlyEnvActionPipe]::WatchParent($script:FlyEnvBrokerInput)'}
  $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
  $sid=$identity.User.Value
  $requireElevated=${options.elevated ? '$true' : '$false'} -or ([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  $executable=[Diagnostics.Process]::GetCurrentProcess().MainModule.FileName
  $pipe=[FlyEnvActionPipe]::Create(${quote(options.pipeName)}, $sid)
  Write-FlyEnvActionStage 'broker.pipe-created'
  try {
    [Console]::WriteLine('READY')
    Write-FlyEnvActionStage 'broker.ready'
    ${
      options.launch
        ? `
    # READY must be accepted by the live Node parent before a potentially mutating client starts.
    # Otherwise the 30s startup timeout can race with READY and misreport an already started write.
    if ($script:FlyEnvBrokerInput.ReadLine() -cne 'LAUNCH') { throw 'Windows action parent did not authorize launch' }
    Write-FlyEnvActionStage 'broker.launch-authorized'
    # Only now give the same reader to the EOF watcher; it must not steal the launch acknowledgement.
    [FlyEnvActionPipe]::WatchParent($script:FlyEnvBrokerInput)
    # Launch arguments contain only the fixed pipe bootstrap. Private action data stays on stdin/pipe.
    $launchTask=[FlyEnvActionPipe]::Launch($executable, [string]$inputData.launchArguments, ${options.elevated ? '$true' : '$false'}, ${performanceDiagnosticText('$true', '$false', reportTiming)})
    $script:launchReported=$false
    function Report-ActionLaunch {
      if (-not $script:launchReported -and $launchTask.IsCompleted) {
        $status=$launchTask.Result
        [Console]::WriteLine((@{ launch=@{ code=$status.code; diagnostic=@{ phase=$status.phase; childStarted=$status.childStarted; nativeErrorCode=$status.nativeErrorCode; exceptionType=$status.exceptionType; pipeConnectFailed=$status.pipeConnectFailed; message=$status.message } } } | ConvertTo-Json -Depth 4 -Compress))
        $script:launchReported=$true
      }
    }
    `
        : ''
    }
    while ($true) {
      ${
        options.launch
          ? `
      # Poll asynchronously: a launch failure/cancellation must reach Node even if no client connects.
      # An exited client without a result still leaves the pipe available for the late-result policy.
      $connection=$pipe.WaitForConnectionAsync()
      while (-not $connection.Wait(50)) { Report-ActionLaunch }
      Report-ActionLaunch
      `
          : '$pipe.WaitForConnection()'
      }
      try {
        Write-FlyEnvActionStage 'broker.client-connected'
        $nonce=[FlyEnvActionPipe]::ReadLine($pipe, 256, 10000)
        if ($nonce -cne ${quote(options.nonce)} -or -not [FlyEnvActionPipe]::Authenticate($pipe, $sid, $requireElevated, $executable)) { continue }
        Write-FlyEnvActionStage 'broker.client-authenticated'
        $writer=New-Object IO.StreamWriter($pipe, (New-Object Text.UTF8Encoding($false)), 4096, $true)
        try {
          $writer.AutoFlush=$true
          if ($null -ne $inputData.payload) { $writer.WriteLine(($inputData.payload | ConvertTo-Json -Depth 16 -Compress)) }
          else { $writer.WriteLine('READY') }
          Write-FlyEnvActionStage 'broker.payload-sent'
          $line=[FlyEnvActionPipe]::ReadLine($pipe, ${options.maxBytes}, 900000)
          Write-FlyEnvActionStage 'broker.result-received'
          [Console]::WriteLine((@{ result=$line } | ConvertTo-Json -Compress))
          ${options.launch ? 'while (-not $launchTask.Wait(50)) { }; Report-ActionLaunch' : ''}
          break
        } finally { $writer.Dispose() }
      } catch { }
      finally { if ($pipe.IsConnected) { $pipe.Disconnect() } }
    }
  } finally { $pipe.Dispose(); $identity.Dispose() }
} catch { Write-FlyEnvActionStage 'broker.failed'; [Console]::Error.WriteLine($_.Exception.Message); exit 1 }
`

export const createWindowsActionPipe = async (
  options: WindowsActionPipeOptions
): Promise<WindowsActionPipe> => {
  const script = buildWindowsActionPipeBroker(options)
  const transportStarted = performanceDiagnosticNow()
  const observe = (event: WindowsActionStageEvent) => {
    try {
      options.onStage?.(event)
    } catch {
      /* 诊断不能干扰原协议。 */
    }
  }
  // spawn 请求与 PowerShell 首条引导之间的差值包含 OS 启动/策略扫描/运行时初始化；
  // 此处只给真实边界，不能把这段时间全部归因于安全软件或脚本编译。
  const nodeStage = (stage: string, childPid?: number) =>
    runPerformanceDiagnostic(() => {
      observe({
        stage,
        at: new Date().toISOString(),
        elapsedMs: performanceDiagnosticElapsed(transportStarted) ?? 0,
        pid: process.pid,
        childPid
      })
    })
  nodeStage('node.spawn-request')
  const child = spawn(
    // broker 与业务子进程均使用系统完整路径；无 PATH 时也不能误启动同名程序。
    resolveWindowsPowerShellPath(),
    [
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      Buffer.from(windowsActionBrokerBootstrap, 'utf16le').toString('base64')
    ],
    { windowsHide: true, env: windowsPowerShellEnv(), stdio: ['pipe', 'pipe', 'pipe'] }
  )
  child.once('spawn', () => nodeStage('node.spawned', child.pid))
  // close 在两路流结束后出现，比 exit 更适合观察最终诊断输送的时间。
  child.once('close', () => nodeStage('node.child-closed', child.pid))
  let finish!: () => void
  const resultReady = new Promise<void>((resolve) => {
    finish = resolve
  })
  let finishLaunch!: (value: { code: number; diagnostic: WindowsLaunchDiagnostic }) => void
  let launchCompleted = false
  const launchReady = new Promise<{ code: number; diagnostic: WindowsLaunchDiagnostic }>(
    (resolve) => {
      finishLaunch = (value) => {
        if (launchCompleted) return
        launchCompleted = true
        resolve(value)
      }
    }
  )
  let ready = false
  let startupFailed = false
  let completed = false
  let output = ''
  let diagnostic = ''
  // 编译诊断可能分块到达；独立缓冲，不混入失败消息/业务结果。最大诊断帧有界。
  let timingDiagnostic = ''
  let transportClosed = false
  const close = () => {
    // 诊断不要把调用方主动关闭已完成通道的 exit 误报为启动/业务失败。
    transportClosed = true
    child.stdin.destroy()
    child.stdout.destroy()
    child.stderr.destroy()
    child.kill()
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const rejectStartup = (error: unknown) => {
        // 锁定启动失败状态；定时器先到时，迟到 READY 不能再发送 LAUNCH 或覆盖失败。
        startupFailed = true
        reject(error)
      }
      const timer = setTimeout(() => {
        rejectStartup(
          new AppHelperError(
            'elevation_pipe_connect_failed',
            'Windows action pipe did not become ready'
          )
        )
      }, 30_000)
      const fail = (error: unknown) => {
        // 正常 broker exit 也经过原 fail 收尾；已有终态/启动回包时不能记为失败。
        if (!transportClosed && (!ready || (!completed && !launchCompleted)))
          nodeStage('node.transport-failed', child.pid)
        clearTimeout(timer)
        if (!ready)
          rejectStartup(
            new AppHelperError('elevation_pipe_connect_failed', diagnostic || String(error))
          )
        else if (options.launch)
          // broker 中途退出不是“未执行”的证明；交给调用方沿未知状态路径处理。
          finishLaunch({ code: 1, diagnostic: {} })
      }
      child.on('error', fail)
      child.on('exit', (code) => fail(`Windows action pipe exited (${code})`))
      child.stdin.on('error', fail)
      child.stderr.on('error', fail)
      child.stdout.on('error', fail)
      child.stderr.setEncoding('utf8')
      child.stderr.on('data', (chunk: string) => {
        // 始终解析阶段；原计时报告仍只在测试观察器开启时生效。完整行独立缓冲，
        // 不把固定协议混入失败消息，也不因中文/UTF-8 跨 chunk 而损坏时间字段。
        timingDiagnostic = (timingDiagnostic + chunk).slice(-8000)
        let boundary: number
        while ((boundary = timingDiagnostic.indexOf('\n')) >= 0) {
          const line = timingDiagnostic.slice(0, boundary).trimEnd()
          timingDiagnostic = timingDiagnostic.slice(boundary + 1)
          const event = parseWindowsActionStageLine(line)
          if (event) observe(event)
          else if (!acceptOperationTimingLine(line))
            diagnostic = (diagnostic + line + '\n').slice(-2000)
        }
        // 错误流可能没有末尾换行，原启动错误仍应保留；固定阶段在完整行前不解释。
        if (timingDiagnostic && !timingDiagnostic.startsWith('FLYENV_'))
          diagnostic = (diagnostic + timingDiagnostic).slice(-2000)
      })
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => {
        output += chunk
        // The broker wraps a bounded JSON string; escaped UTF-8 can expand to six times its raw size.
        if (Buffer.byteLength(output) > options.maxBytes * 6 + 1024) {
          fail('Pipe result exceeds its limit')
          close()
          return
        }
        let boundary: number
        while ((boundary = output.indexOf('\n')) >= 0) {
          const line = output.slice(0, boundary).trimEnd()
          output = output.slice(boundary + 1)
          if (!ready && !startupFailed && line === 'READY') {
            ready = true
            nodeStage('node.ready-accepted', child.pid)
            if (options.launch)
              markOperationStage(options.elevated ? 'uac.broker-launch' : 'ordinary.broker-launch')
            clearTimeout(timer)
            resolve()
            // 仅接受 READY 的存活父进程可以确认启动。先固定就绪 Promise，再处理
            // stdin 写失败，避免错误后的悬空等待；无法确认送达时按未知状态处理。
            if (options.launch) {
              try {
                child.stdin.write('LAUNCH\n')
                nodeStage('node.launch-sent', child.pid)
              } catch (error) {
                fail(error)
              }
            }
            continue
          }
          if (!ready) continue
          try {
            const message = JSON.parse(line)
            if (
              options.launch &&
              message.launch &&
              typeof message.launch === 'object' &&
              Number.isInteger(message.launch.code) &&
              message.launch.diagnostic &&
              typeof message.launch.diagnostic === 'object' &&
              !Array.isArray(message.launch.diagnostic)
            ) {
              finishLaunch(message.launch)
              continue
            }
            // 业务终态和子进程退出属于两条独立生命周期；结果常先于退出诊断到达。
            // 只冻结业务结果，不能因 completed 丢弃随后用于结束等待的 launch 帧。
            if (completed) continue
            if (
              typeof message.result !== 'string' ||
              Buffer.byteLength(message.result) > options.maxBytes
            )
              continue
            options.onResult(JSON.parse(message.result))
            completed = true
            nodeStage('node.result-accepted', child.pid)
            finish()
          } catch {
            /* A malformed result never proves success. */
          }
        }
      })
      // No payload or private action data is exposed in either process's command line.
      // Keep stdin open as a parent-liveness handle; WatchParent exits the broker on EOF.
      child.stdin.write(
        Buffer.from(script, 'utf8').toString('base64') +
          '\n' +
          JSON.stringify({
            payload: options.payload ?? null,
            launchArguments: options.launch?.argumentsText
          }) +
          '\n'
      )
    })
  } catch (error) {
    close()
    throw error
  }
  return {
    resultReady,
    launchReady,
    close,
    retain: () => {
      // Late-result resources must not keep Electron/fork alive after the operation timed out.
      child.unref()
      for (const stream of [child.stdin, child.stdout, child.stderr]) (stream as Socket).unref?.()
    }
  }
}
