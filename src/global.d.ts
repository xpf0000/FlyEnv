import 'pinia'
import Launcher from './main/Launcher'
import type { WindowsElevationMethod } from './shared/WindowsHelperState'

export interface ServerType {
  AppDir?: string
  Arch?: string
  BrewCellar?: string
  BrewHome?: string
  BrewBin?: string
  BrewError?: string
  PodmanBin?: string
  PodmanError?: string
  Password?: string
  Proxy?: { [key: string]: string }
  isArmArch?: boolean
  Static?: string
  Cache?: string
  DataDirectoryReady?: boolean
  RedisDir?: string
  MongoDBDir?: string
  FTPDir?: string
  PhpDir?: string
  NginxDir?: string
  MysqlDir?: string
  PostgreSqlDir?: string
  ClickHouseDir?: string
  Neo4jDir?: string
  MariaDBDir?: string
  MemcachedDir?: string
  BaseDir?: string
  ApacheDir: string
  Lang?: string
  Local?: string
  MacPorts?: string
  SdkmanHome?: string
  ForceStart?: boolean
  WindowsElevationMethod?: WindowsElevationMethod
  /** 只有显式选择才产生；默认 helper 不代表用户同意常驻安装。 */
  WindowsElevationChoiceVersion?: number
  /** 本次 main 会话的权限广播序号，用于过滤 renderer/fork 的旧快照。 */
  WindowsPrivilegeRevision?: number
  /** 单条 fork 命令的交互意图快照；异步执行时需复制到 AsyncLocalStorage。 */
  WindowsPrivilegeInteractive?: boolean
  /** 主进程有效令牌的界面状态；真正执行时仍检查当前执行进程令牌。 */
  WindowsProcessElevated?: boolean
  UserHome?: string
  UserDocuments?: string
  /** main 从实际 Windows 系统目录生成并广播，renderer 不自行猜测 C: 盘。 */
  WindowsHostsFile?: string
  Licenses?: string
  UserUUID?: string
  LangCustomer?: any
  isMacOS?: boolean
  isLinux?: boolean
  isWindows?: boolean
  APPVersion?: string
  DebugForkActions?: Array<{
    command: string
    module: string
    action?: string
    key: string
    startedAt: number
  }>
}

declare global {
  // @ts-ignore
  var Server: ServerType
  // @ts-ignore
  var application: any
  // @ts-ignore
  var __static: string
  // @ts-ignore
  var launcher: Launcher
  // @ts-ignore
  var bundleEnv: {
    arch: string
    target: string
  }

  interface Window {
    openDir: (dir: string) => void
    openUrl: (url: string) => void
    queryLocalFonts: () => any
    FlyEnvNodeAPI: {
      ipcSendToMain: (...args: any[]) => void
      ipcReceiveFromMain: (callback: (event: any, ...args: any[]) => void) => void
      showFilePath: (file: File) => string
      getSystemFonts: () => Promise<string[]>
    }
  }
}
export {}
