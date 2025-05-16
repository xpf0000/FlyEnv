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
  isAppleSilicon?: boolean
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
  ApacheDir?: string
  Lang?: string
  Local?: string
  MacPorts?: string
  ForceStart?: boolean
  UserHome?: string
  Licenses?: string
  LangCustomer?: any
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
