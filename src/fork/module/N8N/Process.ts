import { realpathSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import type { SoftInstalled } from '@shared/app'
import type { PItem } from '@shared/Process'
import { isReadableServiceStopRoot } from '@shared/ProcessSnapshot'

/**
 * npm 的 n8n.cmd 启动 Node 后，进程命令只保留 JS 入口。env/node 联接路径与
 * 安装列表中的真实路径可能不同，发现阶段按入口的真实路径确认归属。
 * 缓存仅属于本次发现，不随 env/node 下一次切换继续使用。
 */
export const windowsN8nRootMatcher = (version: SoftInstalled) => {
  const paths = new Map<string, string>()
  const canonical = (path: string) => {
    const key = resolve(path).replace(/\\/g, '/').toLowerCase()
    const cached = paths.get(key)
    if (cached !== undefined) return cached
    let actual = key
    try {
      actual = realpathSync(path).replace(/\\/g, '/').toLowerCase()
    } catch {
      // 已删除的安装仍可能在运行；仅保留原完整路径比较，不扩大归属范围。
    }
    paths.set(key, actual)
    return actual
  }
  const expected = canonical(join(dirname(version.bin), 'node_modules/n8n/bin/n8n'))
  return (process: PItem): boolean => {
    if (!isReadableServiceStopRoot(process, true)) return false
    if (basename(process.EXECUTABLE!.replace(/\\/g, '/')).toLowerCase() !== 'node.exe') return false
    const command = /^(?:"([^"]+)"|(\S+))\s+(?:"([^"]+)"|(\S+))(?:\s|$)/.exec(
      process.COMMAND.trim()
    )
    if (!command) return false
    const executable = command[1] ?? command[2]
    if (basename(executable.replace(/\\/g, '/')).toLowerCase() !== 'node.exe') return false
    const script = command[3] ?? command[4]
    // 只比较 n8n 的实际入口，不把其他 npm 工具、runner、命令片段或相似前缀当作根。
    if (!/[\\/]n8n[\\/]bin[\\/]n8n$/i.test(script)) return false
    const args = process.COMMAND.trim().slice(command[0].length).trim()
    if (args && !/^(?:start|"start")(?:\s|$)/i.test(args)) return false
    return canonical(script) === expected
  }
}
