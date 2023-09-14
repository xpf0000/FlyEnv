import 'pinia'
import Launcher from './main/Launcher'

export interface ServerType {
  BrewCellar?: string
  Password?: string
  Proxy?: { [key: string]: string }
  isAppleSilicon?: boolean
  BrewHome?: string
  Static?: string
  Cache?: string
  RedisDir?: string
  MongoDBDir?: string
  PhpDir?: string
  NginxDir?: string
  MysqlDir?: string
  MariaDBDir?: string
  MemcachedDir?: string
  BaseDir?: string
  ApacheDir?: string
  Lang?: string
  MacPorts?: string
}

declare global {
  // eslint-disable-next-line no-var
  var Server: ServerType
  // eslint-disable-next-line no-var
  var application: any
  // eslint-disable-next-line no-var
  var __static: string
  // eslint-disable-next-line no-var
  var launcher: Launcher
}
export {}
