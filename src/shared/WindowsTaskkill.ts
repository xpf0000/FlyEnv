import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolveWindowsSystemExecutable } from './WindowsSystemPaths'
import { bindServiceStopLogger } from './ServiceStopDiagnostics'
import { timeOperation } from './OperationTiming'

const execFileAsync = promisify(execFile)

/**
 * 普通权限快速路径：Node 直接启动一次系统 taskkill，全部 PID 按调用方顺序传入。
 * 不使用 shell、PATH、/T 或逐 PID 外部命令；中文系统输出仅用于诊断。
 * 归属/树排序由服务首次列表决定；taskkill 只接受数字 PID，执行与快照间仍有 PID
 * 复用窗口。停止本账户服务不走 UAC/Helper，不因命令失败重新查询或重放停止。
 */
export const runWindowsTaskkill = async (pids: string[]): Promise<void> => {
  const logServiceStop = bindServiceStopLogger()
  const executable = resolveWindowsSystemExecutable('taskkill.exe')
  const args = ['/F', ...pids.flatMap((pid) => ['/PID', pid])]
  // Windows CreateProcess 命令行有长度上限。不能为凑“一次请求”自动切成多条命令，
  // 也不能把超长启动失败当成权限问题；保留明确失败让调用方记录。
  if (executable.length + args.join(' ').length + 4 >= 32_767) {
    throw Object.assign(new Error('Windows stop command exceeds the command-line limit'), {
      code: 'E2BIG'
    })
  }
  await logServiceStop('kill.command-request', { executable, arguments: args, orderedPids: pids })
  try {
    const result = await timeOperation('process-stop.taskkill', () => {
      const pending = execFileAsync(executable, args, {
        windowsHide: true,
        timeout: 10_000,
        maxBuffer: 1024 * 1024,
        encoding: 'buffer'
      })
      pending.child.once('spawn', () => {
        void logServiceStop('kill.command-spawned', { commandPid: pending.child.pid })
      })
      return pending
    })
    await logServiceStop('kill.command-result', {
      exitCode: 0,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
      stdoutBase64: result.stdout.toString('base64'),
      stderrBase64: result.stderr.toString('base64')
    })
  } catch (error) {
    const failure = error as {
      code?: number | string
      stdout?: Buffer
      stderr?: Buffer
      killed?: boolean
      signal?: string
    }
    await logServiceStop('kill.command-result', {
      exitCode: failure.code,
      error: String(error),
      killed: failure.killed,
      signal: failure.signal,
      stdoutBase64: failure.stdout?.toString('base64'),
      stderrBase64: failure.stderr?.toString('base64')
    })
    // 启动失败/命令超时直接失败；仅 taskkill 明确非零退出才检查是否全部已退出。
    // 此处检查不再执行 kill，也不触发权限选择、PowerShell、UAC 或 Helper。
    if (typeof failure.code !== 'number' || failure.killed || failure.signal) throw error
    // 一次 taskkill 的部分目标可能已经自然退出，导致整体非零；零信号检查不启动
    // PowerShell，只在每个 PID 均明确 ESRCH 时作为幂等成功。EPERM 不等同于缺席。
    // process.kill(pid, 0) 只探测当下数字 PID 是否存在，不发送终止信号；这是
    // 命令非零后的状态判断，不是执行前 PID 校验。它无法绑定原创建身份，因此
    // PID 已复用时保守保留失败，不根据当前同号进程重新 kill 或假报成功。
    const allMissing = pids.every((pid) => {
      try {
        process.kill(Number(pid), 0)
        return false
      } catch (probeError) {
        return (probeError as NodeJS.ErrnoException).code === 'ESRCH'
      }
    })
    if (allMissing) {
      await logServiceStop('kill.command-targets-already-missing', { orderedPids: pids })
      return
    }
    throw error
  }
}
