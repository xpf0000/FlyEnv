import { appendFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { timePerformanceOperation, writePerformanceLog } from '@shared/PerformanceDiagnostics'

/**
 * 轻量入口仅引用内置模块和无依赖的公共诊断方法，不在第一条日志前加载 utils/业务树。
 * 本地回调仅适配既有文件追加；格式、时间、开关、写入容错全部交给统一入口。
 * 不增加 READY/ACK，不改变 worker 分派或 runtime 的初始化协议。
 */
const bootstrapWriter = (category: string, message: string) =>
  appendFile(join(tmpdir(), 'flyenv-debug.log'), `${category}: ${message}\n`, 'utf8')
const traceBootstrap = (
  stage: string,
  data: Record<string, unknown> | (() => Record<string, unknown>) = {},
  failure = false
) =>
  writePerformanceLog(
    bootstrapWriter,
    '[ServiceStop][boundary]',
    () => ({
      ...(typeof data === 'function' ? data() : data),
      sourcePid: process.pid,
      workerPid: process.pid,
      stage
    }),
    failure
  )

void traceBootstrap('fork.bootstrap-begin', { uptimeMs: Math.round(process.uptime() * 1000) })
// 计时包装只观察这一次动态导入，开关关闭时仍执行导入；splitting 保留异步边界。
void timePerformanceOperation(
  'fork.runtime-import',
  () => import('./runtime'),
  (event) => {
    if (event.kind === 'start') void traceBootstrap('fork.runtime-import-begin')
    else if (event.kind === 'end' && event.status === 'ok')
      void traceBootstrap('fork.runtime-import-completed', { durationMs: event.durationMs })
  }
).catch(async (error: unknown) => {
  // runtime 没有成功安装 dispatcher，错误必须保留；非零退出由 ForkItem 结算待处理请求。
  await traceBootstrap('fork.runtime-import-failed', () => ({ error: String(error) }), true)
  process.exit(1)
})
