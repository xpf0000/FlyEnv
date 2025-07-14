import 'pinia'
import Launcher from './main/Launcher'

export interface ServerType {
  AppDir?: string
  Arch?: string
  BrewCellar?: string
  BrewHome?: string
  BrewBin?: string
  BrewError?: string
  Password?: string
  Proxy?: { [key: string]: string }
  isArmArch?: boolean
  Static?: string
  Cache?: string
  RedisDir?: string
  MongoDBDir?: string
  FTPDir?: string
  PhpDir?: string
  NginxDir?: string
  MysqlDir?: string
  PostgreSqlDir?: string
  MariaDBDir?: string
  MemcachedDir?: string
  BaseDir?: string
  ApacheDir: string
  Lang?: string
  Local?: string
  MacPorts?: string
  ForceStart?: boolean
  UserHome?: string
  Licenses?: string
  LangCustomer?: any
  isMacOS?: boolean
  isLinux?: boolean
  isWindows?: boolean
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

  interface Window {
    FlyEnvNodeAPI: {
      ipcSendToMain: (...args: any[]) => void
      ipcReceiveFromMain: (callback: (event: any, ...args: any[]) => void) => void
      showFilePath: (file: File) => string
    }
  }
}
export {}
