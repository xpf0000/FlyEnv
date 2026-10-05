import { win32 } from 'node:path'
import { isWindows } from '@shared/utils'

/**
 * PHP/PHP-FPM 的并发策略属于 PHP 模块。main 只把 UI 或 MCP 已选中的版本快照
 * 交给此纯函数：同一安装 bin 的 start/stop 共用键，不同版本各自排队。
 * 不能按当前 PID 建启动键，启动前没有 PID；也不能只按版本号合并不同安装目录。
 * 缺少安装身份返回 undefined：启动保留模块屏障，停止沿用通用 PID/未知目标规则。
 */
export const phpServiceLifecycleScope = (target: unknown): string | undefined => {
  if (!target || typeof target !== 'object') return undefined
  const bin = (target as { bin?: unknown }).bin
  if (typeof bin !== 'string' || !bin.trim()) return undefined
  return `bin:${isWindows() ? win32.normalize(bin.trim()).toLowerCase() : bin.trim()}`
}
