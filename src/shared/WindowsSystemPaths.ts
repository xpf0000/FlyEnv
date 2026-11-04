import path from 'node:path'
import { statSync } from 'node:fs'

/**
 * Windows 环境键不区分大小写；不能只读 SystemRoot 而漏掉 SYSTEMROOT/windir。
 * 这里读取 FlyEnv 启动时继承的环境，不读取用户注册表同步出来的 PATH/ComSpec。
 */
const inheritedEnv = (name: string): string | undefined =>
  Object.entries(process.env).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1]

/**
 * 系统目录只允许本机盘符完整路径。拒绝盘符相对、根相对、UNC、设备命名空间、
 * ADS 和尾部点/空格，避免校验路径与 Windows 实际打开路径有不同含义。
 * 格式校验并不证明文件签名或目录 ACL；启动环境仍属于应用信任边界。
 */
const normalizeSystemRoot = (value: string): string => {
  const segments = value.slice(3).split(/[\\/]/u).filter(Boolean)
  if (
    !/^[a-z]:[\\/]/iu.test(value) ||
    /[\x00-\x1f\x7f<>"|?*:]/u.test(value.slice(2)) ||
    segments.length === 0 ||
    segments.some((part) => part === '.' || part === '..' || /[. ]$/u.test(part))
  ) {
    throw Object.assign(new Error('Windows system directory must be a full local drive path'), {
      code: 'EINVAL'
    })
  }
  return path.win32.normalize(value)
}

/**
 * 优先使用系统提供的实际安装目录，支持 Windows 安装在 D: 等非默认盘。
 * 仅在两个系统目录键均缺失时使用 SystemDrive\\Windows，最后才兼容 C:\\Windows。
 * 已提供但格式无效的值直接失败，不能静默改用另一个目录执行权限程序。
 */
export const windowsSystemRoot = (systemRoot?: string): string => {
  const configured = systemRoot ?? inheritedEnv('SystemRoot') ?? inheritedEnv('windir')
  if (configured !== undefined) return normalizeSystemRoot(configured)
  const drive = inheritedEnv('SystemDrive') ?? 'C:'
  if (!/^[a-z]:$/iu.test(drive)) {
    throw Object.assign(new Error('Windows system drive is invalid'), { code: 'EINVAL' })
  }
  return normalizeSystemRoot(`${drive}\\Windows`)
}

export const windowsSystemDirectory = () => path.win32.join(windowsSystemRoot(), 'System32')

/** 纯路径构造保留给脚本计划；真正启动前必须使用下面的 resolve 函数。 */
export const windowsPowerShellPath = (systemRoot?: string): string =>
  path.win32.join(
    windowsSystemRoot(systemRoot),
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe'
  )

/**
 * 所有系统 PowerShell 调用共用最小环境准备，不依赖 Helper 账户或安装状态。
 * 保留当前环境（包括中文 PATH），只固定 PSModulePath 到系统自带 Modules，
 * 避免自动导入用户模块覆盖系统命令；本函数不刷新环境缓存或启动外部进程。
 */
export const windowsPowerShellEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  PSModulePath: path.win32.join(path.win32.dirname(windowsPowerShellPath()), 'Modules')
})

/**
 * 不进行 PATH 搜索，也不将“目录存在”误判为可执行文件存在。
 * 缺失/不可访问保留 stat 的原生错误；策略禁止执行则由 execFile/spawn 报错。
 * 检查与启动不是原子事务，因此调用点仍需保留原有启动失败处理。
 */
const requireExecutableFile = (executable: string): string => {
  if (!statSync(executable).isFile()) {
    throw Object.assign(new Error(`Windows executable is not a file: ${executable}`), {
      code: 'EINVAL',
      path: executable
    })
  }
  return executable
}

export const resolveWindowsPowerShellPath = () => requireExecutableFile(windowsPowerShellPath())

/** 固定系统工具只接受文件名，不能通过工具名把路径跳出 System32。 */
export const resolveWindowsSystemExecutable = (name: string): string => {
  if (!/^[a-z0-9-]+\.exe$/iu.test(name)) {
    throw Object.assign(new Error('Windows system executable name is invalid'), { code: 'EINVAL' })
  }
  return requireExecutableFile(path.win32.join(windowsSystemDirectory(), name))
}
