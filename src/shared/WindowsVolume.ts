import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { win32 } from 'node:path'
import { encodePowerShellCommand } from './PowerShellCommand'
import { windowsPowerShellEnv, resolveWindowsPowerShellPath } from './WindowsSystemPaths'
import { markOperationStage, timeOperation } from './OperationTiming'

const execAsync = promisify(execFile)
type VolumeFormats = Record<string, string>
type VolumeQuery = (drives: string[]) => Promise<VolumeFormats>

/**
 * 只读取指定本地盘的文件系统格式。DriveInfo 调用 Windows 卷信息 API，不加载
 * Get-Volume 的 Storage/CIM 提供程序，也不枚举设备；多个盘在同一个进程里查询。
 * 调用方只传入校验后的单字母，避免路径内容进入 PowerShell 代码。
 */
export const buildWindowsVolumeQuery = (drives: string[]) => {
  if (!drives.length || drives.some((drive) => !/^[A-Z]$/u.test(drive)))
    throw new Error('Windows volume queries require local drive letters')
  return `$ErrorActionPreference='Stop'; $formats=@{}; foreach ($drive in @(${drives.map((drive) => `'${drive}'`).join(',')})) { try { $volume=[IO.DriveInfo]::new($drive + ':\\'); if ($volume.IsReady) { $formats[$drive]=$volume.DriveFormat } } catch { } }; ConvertTo-Json -InputObject $formats -Compress`
}

const queryVolumeFormats: VolumeQuery = async (drives) => {
  const { stdout } = await timeOperation('path.volume-powershell', () =>
    execAsync(
      resolveWindowsPowerShellPath(),
      [
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        encodePowerShellCommand(buildWindowsVolumeQuery(drives))
      ],
      { windowsHide: true, timeout: 10_000, maxBuffer: 4096, env: windowsPowerShellEnv() }
    )
  )
  // 此查询使用固定系统程序和独立环境，不需要先刷新全部用户/系统环境变量。
  const result: unknown = JSON.parse(stdout)
  if (!result || typeof result !== 'object' || Array.isArray(result))
    throw new Error('Invalid Windows volume information')
  return result as VolumeFormats
}

/**
 * 按盘符合并批量/并发查询；只缓存明确读到的格式，失败、未就绪和网络路径返回 false。
 * 30 秒后重新探测，避免可移动盘换盘后沿用旧格式。false 使 PATH 使用真实安装目录，
 * 不将探测失败误当成 NTFS，更不会为了创建 junction 请求管理员权限。
 * query 注入仅用于不写系统的回归测试，生产使用上面的固定系统 PowerShell。
 */
export const createWindowsNTFSProbe = (query: VolumeQuery = queryVolumeFormats) => {
  const cache = new Map<string, { ntfs: boolean; expires: number }>()
  const pending = new Map<string, Promise<boolean>>()
  return async (paths: string[]): Promise<boolean[]> => {
    const drives = paths.map((path) => {
      const root = win32.parse(path).root
      return /^[a-z]:[\\/]$/iu.test(root) ? root[0].toUpperCase() : undefined
    })
    const missing = [
      ...new Set(
        drives.filter(
          (drive): drive is string =>
            !!drive && !pending.has(drive) && (cache.get(drive)?.expires ?? 0) <= Date.now()
        )
      )
    ]
    if (missing.length) {
      // 先为每个盘保存同一批请求的 Promise，下一次调用不会重复启动 PowerShell。
      const request = Promise.resolve()
        .then(() => query(missing))
        .catch(() => ({}) as VolumeFormats)
      for (const drive of missing) {
        const result = request
          .then((formats) => {
            const format = Object.prototype.hasOwnProperty.call(formats, drive)
              ? formats[drive]
              : undefined
            if (typeof format !== 'string' || !format.trim()) return false
            const ntfs = format.toUpperCase() === 'NTFS'
            cache.set(drive, { ntfs, expires: Date.now() + 30_000 })
            return ntfs
          })
          .finally(() => pending.delete(drive))
        pending.set(drive, result)
      }
    }
    return await Promise.all(
      drives.map((drive) => {
        if (!drive) return false
        const running = pending.get(drive)
        if (running) return running
        markOperationStage('path.volume-cache-hit')
        return cache.get(drive)?.ntfs ?? false
      })
    )
  }
}

export const probeWindowsNTFS = createWindowsNTFSProbe()
