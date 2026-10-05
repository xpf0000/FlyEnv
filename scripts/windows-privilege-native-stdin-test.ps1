param(
  [string]$FixturePath = (Join-Path $PSScriptRoot '../tmp/windows-privilege-timing/stdin-native-fixture.json'),
  [switch]$ReadinessOnly
)

# 只启动普通权限客户端，执行器业务只有内存返回值，无 hosts/PATH 写入，也无 RunAs。
# 在正常 PowerShell 中运行完整生产短引导、C# 管道、客户端认证和 SHA-256 引导，
# 用于弥补 Node 替身及 AST 检查无法验证原生运输/启动时序的范围。
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$fixture = Get-Content -LiteralPath $FixturePath -Encoding UTF8 -Raw | ConvertFrom-Json
if (-not [IO.File]::Exists($fixture.executable)) { throw 'Missing checked system PowerShell executable' }
# 受限令牌的额外 SID 访问检查可能拒绝 native pipe；记录布尔状态帮助区分代理沙箱。
# 不输出 SID，不为测试放宽生产管道 DACL，也不尝试取消令牌限制。
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class FlyEnvNativeStdinTokenState { [DllImport("advapi32.dll")] public static extern bool IsTokenRestricted(IntPtr token); }'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
try { Write-Output "Current test token restricted: $([FlyEnvNativeStdinTokenState]::IsTokenRestricted($identity.Token))" }
finally { $identity.Dispose() }
$utf8 = [Text.UTF8Encoding]::new($false, $true)
$info = [Diagnostics.ProcessStartInfo]::new()
$info.FileName = $fixture.executable
$info.Arguments = '-NoProfile -NonInteractive -EncodedCommand ' +
  [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($fixture.loader))
$info.UseShellExecute = $false
$info.CreateNoWindow = $true
$info.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
$info.RedirectStandardInput = $true
$info.RedirectStandardOutput = $true
$info.RedirectStandardError = $true
$info.StandardOutputEncoding = $utf8
$info.StandardErrorEncoding = $utf8
# 与生产保持内置模块范围，避免当前用户配置的 PSModulePath 改变测试执行器。
$info.EnvironmentVariables['PSModulePath'] = Join-Path (Split-Path -Parent $fixture.executable) 'Modules'
$process = $null
try {
  $process = [Diagnostics.Process]::Start($info)
  if ($null -eq $process) { throw 'No ordinary broker process handle returned' }
  # 读取输出并发进行，避免缓冲区写满阻塞；fixture 的业务输出只是一条短字符串。
  $outputTask = $null
  $errorTask = $process.StandardError.ReadToEndAsync()
  $brokerCode = $fixture.broker
  if ($ReadinessOnly) { $brokerCode = $fixture.unlaunchedBroker }
  $frame = [Convert]::ToBase64String($utf8.GetBytes($brokerCode)) + "`n" +
    (@{ payload=$fixture.payload; launchArguments=$fixture.launchArguments } | ConvertTo-Json -Depth 16 -Compress) + "`n"
  $bytes = $utf8.GetBytes($frame)
  # .NET Framework 没有 StandardInputEncoding；直接写 BaseStream，避免 OEM 代码页损坏中文。
  $process.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
  $process.StandardInput.BaseStream.Flush()
  $readyTask = $process.StandardOutput.ReadLineAsync()
  if (-not $readyTask.Wait(5000) -or $readyTask.Result -cne 'READY') {
    throw 'Production broker did not become READY'
  }
  if ($ReadinessOnly) {
    # 使用完整生产 broker（不启动客户端），覆盖大 JSON、原生管道创建及新 reader 的 EOF。
    # 受限 token 无法通过生产 DACL 连接时，仍可验证本轮修复的 READY 前运输和父退出回收。
    $process.StandardInput.Close()
    if (-not $process.WaitForExit(5000) -or $process.ExitCode -ne 0) {
      throw 'Production shared-reader parent EOF did not stop the broker'
    }
    Write-Output "Production native broker READY/parent EOF passed; no client started; PowerShell $($PSVersionTable.PSVersion)"
    return
  }
  # 和生产 Node 一样，接受 READY 后才允许启动客户端；输入监视线程此后接管 reader。
  $acknowledgement = $utf8.GetBytes("LAUNCH`n")
  $process.StandardInput.BaseStream.Write($acknowledgement, 0, $acknowledgement.Length)
  $process.StandardInput.BaseStream.Flush()
  $outputTask = $process.StandardOutput.ReadToEndAsync()
  # 保持 stdin 开启，模拟真实 Node 父进程。动作终态会让 broker 自然结束。
  if (-not $process.WaitForExit(15000)) { throw 'Ordinary native broker did not finish within 15 seconds' }
  if (-not $outputTask.Wait(1000) -or -not $errorTask.Wait(1000)) { throw 'Native broker output did not finish' }
  $output = "READY`n" + $outputTask.Result
  $diagnostic = $errorTask.Result
  if ($process.ExitCode -ne 0) { throw "Native broker failed: $diagnostic" }
  $ready = $false
  $result = $null
  $launch = $null
  foreach ($line in ($output -split "`n")) {
    $line = $line.TrimEnd("`r")
    if ($line -ceq 'READY') { $ready = $true; continue }
    if (-not $line) { continue }
    $message = $line | ConvertFrom-Json
    if ($message.result) { $result = $message.result | ConvertFrom-Json }
    if ($message.launch) { $launch = $message.launch }
  }
  if (-not $ready -or $null -eq $result -or $null -eq $launch -or
      $result.nonce -cne $fixture.nonce -or $result.ok -ne $true -or
      $result.data -cne $fixture.expected -or $launch.code -ne 0 -or
      $launch.diagnostic.childStarted -ne $true) {
    throw "Ordinary native broker did not return expected authenticated result: $output $diagnostic"
  }
  Write-Output "Production ordinary native stdin/pipe/launch passed; Unicode and large payload verified; PowerShell $($PSVersionTable.PSVersion)"
} catch {
  # 启动早期失败可能先关闭 stdin；保留实际子进程诊断，不能只看到外层 broken pipe。
  if ($process -and -not $process.HasExited) {
    $process.StandardInput.Close()
    if (-not $process.WaitForExit(1000)) { $process.Kill() }
  }
  if ($outputTask -and $outputTask.Wait(1000)) { [Console]::Error.WriteLine($outputTask.Result) }
  if ($errorTask -and $errorTask.Wait(1000)) { [Console]::Error.WriteLine($errorTask.Result) }
  throw
} finally {
  if ($null -ne $process) {
    # 只回收本测试创建的确切 broker；绝不按名称停止 FlyEnv/其他用户的进程。
    try { $process.StandardInput.Close() } catch {}
    if (-not $process.HasExited) { $process.Kill() }
    $process.Dispose()
  }
}
