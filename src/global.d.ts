import 'pinia'

export interface ServerType {
  BrewCellar?: string
  Password?: string
  Proxy?: { [key: string]: string }
  isAppleSilicon?: boolean
  BrewHome?: string
  Static?: string
  Cache?: string
  RedisDir?: string
  PhpDir?: string
  NginxDir?: string
  MysqlDir?: string
  MemcachedDir?: string
  BaseDir?: string
  ApacheDir?: string
}

declare global {
  // eslint-disable-next-line no-var
  var Server: ServerType
}
export {}
