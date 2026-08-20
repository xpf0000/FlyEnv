import { app } from 'electron'
import { isArmArch, mkdirp } from './index'
import { join } from 'path'
import { arch } from 'os'
import { isLinux, isMacOS, isWindows } from '@shared/utils'
import { isAppHelperError, isAppHelperUnavailableError } from '@shared/WindowsHelperState'
import { SetupNginxConfig } from './NginxConf'
import {
  createBaseDirectories,
  type DirectoryPermissionFailureReason,
  type DirectoryPermissionRecoveryResult
} from './ServerDirectory'
import Helper from '../../fork/Helper'

let onServerDirectoryPermissionDenied:
  ((reason: DirectoryPermissionFailureReason) => void) | undefined
const dataDirectoryRecoveryByRoot = new Map<string, Promise<DirectoryPermissionRecoveryResult>>()

export const setServerDirectoryPermissionDeniedHandler = (
  handler?: (reason: DirectoryPermissionFailureReason) => void
) => {
  onServerDirectoryPermissionDenied = handler
}

/**
 * 创建基础目录
 */
const recoverFlyEnvDataDirectory = (
  dataDirectory: string
): Promise<DirectoryPermissionRecoveryResult> => {
  const pending = dataDirectoryRecoveryByRoot.get(dataDirectory)
  if (pending) {
    return pending
  }

  const recovery = Helper.send<boolean>('tools', 'ensureFlyEnvDataDirectory', dataDirectory)
    .then((recovered) => (recovered === true ? 'recovered' : 'failed'))
    .catch((error) => {
      console.warn('[ServerPath] Helper data-directory recovery failed', {
        dataDirectoryLength: dataDirectory.length,
        errorCode: isAppHelperError(error) ? error.code : undefined,
        error: error instanceof Error ? error.message : String(error)
      })
      if (isAppHelperError(error, 'helper_binary_missing')) {
        return 'helper-binary-missing'
      }
      if (isAppHelperError(error, 'helper_signature_invalid')) {
        return 'failed'
      }
      if (isAppHelperUnavailableError(error)) {
        return 'helper-unavailable'
      }
      return 'failed'
    })
    .finally(() => {
      if (dataDirectoryRecoveryByRoot.get(dataDirectory) === recovery) {
        dataDirectoryRecoveryByRoot.delete(dataDirectory)
      }
    })
  dataDirectoryRecoveryByRoot.set(dataDirectory, recovery)
  return recovery
}

const ensureBaseDirectories = (dataDirectory: string) => {
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
    global.Server.Neo4jDir,
    global.Server.Cache
  ]

  return createBaseDirectories(dirs, {
    createDirectory: mkdirp,
    isWindows,
    recoverPermissionDenied: () => recoverFlyEnvDataDirectory(dataDirectory),
    onPermissionDenied: (reason) => onServerDirectoryPermissionDenied?.(reason)
  })
}

/**
 * 创建服务器目录
 */
export const MakeServerDir = async (dataDirectory: string): Promise<boolean> => {
  const created = await ensureBaseDirectories(dataDirectory)
  if (!isWindows()) {
    SetupNginxConfig()
  }
  return created
}

/**
 * 设置全局路径
 */
export const SetupGlobalPaths = (runpath: string): Promise<boolean> => {
  global.Server.UserHome = app.getPath('home')
  global.Server.UserDocuments = app.getPath('documents')
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
  global.Server.ClickHouseDir = join(runpath, 'server/clickhouse')
  global.Server.Neo4jDir = join(runpath, 'server/neo4j')
  global.Server.Cache = join(runpath, 'server/cache')
  global.Server.Static = __static
  global.Server.Arch = arch() === 'x64' ? 'x86_64' : 'arm64'
  global.Server.isMacOS = isMacOS()
  global.Server.isLinux = isLinux()
  global.Server.isWindows = isWindows()
  global.Server.DataDirectoryReady = false
  return MakeServerDir(runpath)
}
