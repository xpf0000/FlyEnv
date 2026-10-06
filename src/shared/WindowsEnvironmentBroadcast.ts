import {
  runPerformanceDiagnostic,
  performanceDiagnosticNow,
  performanceDiagnosticElapsed,
  writePerformanceLog,
  bindPerformanceLogger
} from './PerformanceDiagnostics'
import { spawn } from 'node:child_process'
import { encodePowerShellCommand } from './PowerShellCommand'
import { resolveWindowsPowerShellPath } from './WindowsSystemPaths'
import { appDebugLog } from './utils'
import { currentWindowsPathRequestKey } from './WindowsPathDiagnostics'

type BroadcastContext = {
  log: (stage: string, details?: Record<string, unknown>) => void
}

// 只捕获本次通知的日志关联信息，不保存请求状态、不参与业务完成条件。
// requestKey 来自已有 PATH 诊断；没有该诊断的独立 API 仍正常安排通知。
const makeContext = (): BroadcastContext => {
  const logger = bindPerformanceLogger(appDebugLog, '[WindowsPath][broadcast-launch]', {
    requestKey: currentWindowsPathRequestKey(),
    sourcePid: process.pid
  })
  return {
    log: (stage, details = {}) => {
      void logger(stage, details, /error|failed/.test(stage))
    }
  }
}

/**
 * 固定通知脚本不包含注册表写入或业务环境值；普通用户即可通知本会话的桌面窗口。
 * 同步 native API 仅在独立通知进程中等待，保证 Environment 字符串指针存活。
 * EncodedCommand 使用 UTF-16LE；脚本只执行通知，不访问日志文件或携带请求信息。
 * 启动/退出诊断由 fork 外层记录，避免通知子进程为细分日志额外计时和序列化 JSON。
 */
export const buildWindowsEnvironmentBroadcastScript = (): string => {
  return `$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
  Add-Type -Namespace FlyEnvFallback -Name NativeMethods -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("user32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode, SetLastError = true)]
public static extern System.IntPtr SendMessageTimeout(System.IntPtr hWnd, uint Msg, System.UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out System.UIntPtr lpdwResult);
'@
  $notifyResult = [System.UIntPtr]::Zero
  [FlyEnvFallback.NativeMethods]::SendMessageTimeout(
    [System.IntPtr]0xffff, 0x001A, [System.UIntPtr]::Zero,
    'Environment', 0x0002, 5000, [ref]$notifyResult
  ) | Out-Null
} catch {
  # 通知是已结算业务的附加动作，失败静默结束，不回传错误或重放环境写入。
}`
}

/** 后台准备不参与写入 Promise；不读取/修改注册表，不调用 UAC/Helper 或 EnvSync。 */
const launchBroadcast = async (request: BroadcastContext): Promise<void> => {
  try {
    request.log('prepare-start')
    // 身份工具仅在真的需要后台通知时加载，不增加所有冷 worker 的入口依赖。
    const { windowsPowerShellEnv } = await import('./WindowsSystemPaths')
    const executable = resolveWindowsPowerShellPath()
    const encoded = encodePowerShellCommand(buildWindowsEnvironmentBroadcastScript())
    request.log('prepare-end')
    request.log('spawn-request', { waitingForSpawn: false, waitingForExit: false })
    const started = performanceDiagnosticNow()
    const child = spawn(executable, ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
      windowsHide: true,
      shell: false,
      stdio: 'ignore',
      env: windowsPowerShellEnv()
    })
    // stdio ignore 不建立业务管道；不再需要父 PowerShell 的 stdin Close/Dispose。
    // 仅观察 spawn/exit，不创建等待 Promise。保留默认引用与非 detached 模式，
    // 自然事件循环可存活到子进程结束；业务结果已结算，不等待通知。
    child.on('error', (error: NodeJS.ErrnoException) => {
      request.log('background-error', { pid: child.pid, errorCode: error.code })
    })
    // 正式包不安装纯观察用的 spawn/exit 回调；error 监听始终保留，防止未处理异常。
    runPerformanceDiagnostic(() => {
      child.once('spawn', () => {
        request.log('spawned', {
          pid: child.pid,
          durationMs: performanceDiagnosticElapsed(started)
        })
      })
      child.once('exit', (code, signal) => {
        request.log('exited', { pid: child.pid, code, signal })
      })
      request.log('spawn-call-returned', {
        pid: child.pid,
        durationMs: performanceDiagnosticElapsed(started)
      })
    })
  } catch (error) {
    // 包括路径定位/编码/同步 spawn 失败；不打印命令参数中的完整脚本，也不重试写入。
    request.log('launch-failed', { errorCode: (error as NodeJS.ErrnoException)?.code })
  }
}

/**
 * 实际环境业务在 resolve/reject 之后调用；仅已明确写入的变更才通知。
 * 下一轮再准备进程，使既有业务终态微任务先执行，不依赖 BaseManager 或新 IPC。
 * 返回 void，不等待启动/广播；移除 detached/unref 不会把进程等待加入业务 Promise。
 * Node spawn 本身仍可能占用所在 worker，但不再打断该业务自身的刷新步骤。
 */
export const notifyWindowsEnvironmentChanged = (): void => {
  if (process.platform !== 'win32') return
  try {
    const request = makeContext()
    request.log('scheduled', { trigger: 'environment-operation-settled' })
    // 短调度与子进程均保留默认引用；所有后台拒绝都有接收者，
    // 不回到写入失败回调，不等待通知结束，也不为通知失败再次写入或提权。
    setImmediate(() => {
      void launchBroadcast(request).catch(() => request.log('background-failed'))
    })
  } catch {
    // 真实调度错误保留，统一日志入口仍保证不产生未处理异常。
    void writePerformanceLog(
      appDebugLog,
      '[WindowsPath][broadcast-launch]',
      {
        stage: 'schedule-failed',
        sourcePid: process.pid
      },
      true
    )
  }
}
