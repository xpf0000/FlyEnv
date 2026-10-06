import { performanceDiagnosticNow, performanceDiagnosticElapsed } from './PerformanceDiagnostics'
import { spawn } from 'node:child_process'
import { resolveWindowsSystemExecutable } from './WindowsSystemPaths'
import { bindServiceStopLogger } from './ServiceStopDiagnostics'

import { appDebugLog } from './utils'

/** 发布包不记录刷新耗时，但系统工具启动失败仍留故障信息；日志永不影响 hosts。 */
const logDnsFailure = (error: unknown) => {
  try {
    void appDebugLog('[WindowsDnsRefresh][error]', String(error)).catch(() => {})
  } catch {
    // 路径解析/序列化/写盘失败都不能否定已完成的 hosts 写入。
  }
}

/**
 * 尽力启动 Windows DNS 缓存刷新：true 仅表示进程已启动，不代表刷新已完成；
 * false 表示启动失败且已记录。DNS 是 hosts 写入后的附加动作，不能把刷新失败
 * 向外抛出并否定已经成功的文件写入，也不自动重试或改走权限认证。
 * hosts 写入/退出无需读取刷新结果：直接启动系统 ipconfig.exe，省去 PowerShell、
 * broker 编译和返回管道的开销，也不触发 UAC/Helper。路径从实际 SystemRoot 解析，
 * 不查 PATH；使用参数数组与 shell:false，中文、空格路径不会成为 shell 命令文本。
 */
export const launchWindowsDnsRefresh = async (): Promise<boolean> => {
  const started = performanceDiagnosticNow()
  // EventEmitter 的回调可能脱离 ALS 上下文，注册前绑定当前站点/退出的诊断归属。
  const log = bindServiceStopLogger()
  let launched = false
  try {
    const executable = resolveWindowsSystemExecutable('ipconfig.exe')
    void log('dns.refresh-spawn-request', { executable, waitingForExit: false })
    await new Promise<void>((resolve, reject) => {
      const child = spawn(executable, ['/flushdns'], {
        windowsHide: true,
        shell: false,
        detached: true,
        stdio: 'ignore'
      })
      child.once('spawn', () => {
        launched = true
        // 无管道/IPC 引用，且解除 ChildProcess 引用；FlyEnv 不等待 DNS 刷新结束，
        // 退出后该工具仍可继续运行。不能在 exit/close 上 resolve，否则仍然阻塞退出。
        child.unref()
        void log('dns.refresh-spawned', {
          pid: child.pid,
          durationMs: performanceDiagnosticElapsed(started),
          waitingForExit: false
        })
        resolve()
      })
      child.on('error', (error) => {
        // 启动失败进入本方法的 catch 记录并返回 false；启动后错误仅记录，
        // 两种情况都不能向 hosts 调用者传播失败或重放刷新。
        if (!launched) reject(error)
        else {
          logDnsFailure(error)
          void log('dns.refresh-background-error', { pid: child.pid, error: String(error) })
        }
      })
    })
    return true
  } catch (error) {
    // 包含系统工具不存在、路径无效、同步 spawn 异常以及 spawn 前的策略拒绝。
    // 错误仅进入诊断，不等待磁盘写入；不把 DNS 启动失败当成 hosts 写入失败。
    logDnsFailure(error)
    void log('dns.refresh-spawn-failed', {
      error: String(error),
      durationMs: performanceDiagnosticElapsed(started)
    })
    return false
  }
}
