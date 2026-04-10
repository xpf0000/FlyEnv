import { app } from 'electron'
import { isArmArch, mkdirp } from './index'
import { join } from 'path'
import { arch } from 'os'
import { isLinux, isMacOS, isWindows } from '@shared/utils'
import { SetupNginxConfig } from './NginxConf'

/**
 * 创建基础目录
 */
const createBaseDirectories = () => {
  const dirs = [
    global.Server.BaseDir,
    global.Server.AppDir,
    global.Server.NginxDir,
    global.Server.PhpDir,
    global.Server.MysqlDir,
    global.Server.MariaDBDir,
    global.Server.ApacheDir,
    global.Server.MemcachedDir,
    global.Server.RedisDir,
    global.Server.MongoDBDir,
    global.Server.Cache
  ].filter(Boolean)

  dirs.forEach((dir) => {
    if (dir) {
      mkdirp(dir).then().catch()
    }
  })
}

/**
 * 创建服务器目录
 */
export const MakeServerDir = () => {
  createBaseDirectories()
  if (!isWindows()) {
    SetupNginxConfig()
  }
}

/**
 * 设置全局路径
 */
export const SetupGlobalPaths = (runpath: string) => {
  global.Server.UserHome = app.getPath('home')
  global.Server.isArmArch = isArmArch()
  global.Server.BaseDir = join(runpath, 'server')
  global.Server.AppDir = join(runpath, 'app')
  global.Server.NginxDir = join(runpath, 'server/nginx')
  global.Server.PhpDir = join(runpath, 'server/php')
  global.Server.MysqlDir = join(runpath, 'server/mysql')
  global.Server.MariaDBDir = join(runpath, 'server/mariadb')
  global.Server.ApacheDir = join(runpath, 'server/apache')
  global.Server.MemcachedDir = join(runpath, 'server/memcached')
  global.Server.RedisDir = join(runpath, 'server/redis')
  global.Server.MongoDBDir = join(runpath, 'server/mongodb')
  global.Server.FTPDir = join(runpath, 'server/ftp')
  global.Server.PostgreSqlDir = join(runpath, 'server/postgresql')
  global.Server.Cache = join(runpath, 'server/cache')
  global.Server.Static = __static
  global.Server.Arch = arch() === 'x64' ? 'x86_64' : 'arm64'
  global.Server.isMacOS = isMacOS()
  global.Server.isLinux = isLinux()
  global.Server.isWindows = isWindows()
  MakeServerDir()
}
