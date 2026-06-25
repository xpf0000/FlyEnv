/**
 * MCP 服务配置/日志文件路径解析。
 *
 * FlyEnv 各服务模块没有统一的 getConfig/getLogs fork 方法——配置/日志是文件，
 * 渲染层是直接 fs.readFile(path) 读的，路径在各模块代码里按 global.Server.{X}Dir 拼。
 * 这里在 main 进程复刻这套路径约定（global.Server.*Dir 在 main 可用），供 read_config /
 * read_log 用。已核对各模块源码（Nginx/Apache/Mysql/Mariadb/Redis/Mongodb/Postgresql/Memcached）。
 *
 * 注意：部分服务的配置/日志是“按版本”的（redis-{v}.conf、mongodb-{v}.conf、
 * postgresql{topV}/postgresql.conf），故 resolver 接收可选 version。
 */
import { join } from 'node:path'

/** version 形如 8.3.22 → 取主版本 'redis-8.3' 用的两段；pg 用拼接的 topVersion '83' */
function twoSeg(version?: string): string {
  return (version?.split('.')?.slice(0, 2)?.join('.')) ?? ''
}
function topVersion(version?: string): string {
  return (version?.split('.')?.slice(0, 2)?.join('')) ?? ''
}

const S = () => (global as any).Server as Record<string, string | undefined>

/** 返回某模块的配置文件路径（绝对路径），无法确定时返回 null */
export function resolveConfigPath(flag: string, version?: string): string | null {
  const s = S()
  switch (flag) {
    case 'nginx':
      return s.NginxDir ? join(s.NginxDir, 'common/conf/nginx.conf') : null
    case 'apache':
      return s.ApacheDir ? join(s.ApacheDir, 'common/conf/httpd.conf') : null
    case 'mysql':
      return s.MysqlDir ? join(s.MysqlDir, 'my.cnf') : null
    case 'mariadb':
      return s.MariaDBDir ? join(s.MariaDBDir, 'my.cnf') : null
    case 'redis':
      return s.RedisDir && version ? join(s.RedisDir, `redis-${twoSeg(version)}.conf`) : null
    case 'mongodb':
      return s.MongoDBDir && version ? join(s.MongoDBDir, `mongodb-${twoSeg(version)}.conf`) : null
    case 'postgresql':
      return s.PostgreSqlDir && version
        ? join(s.PostgreSqlDir, `postgresql${topVersion(version)}`, 'postgresql.conf')
        : null
    default:
      return null
  }
}

/** 返回某模块的日志文件路径（绝对路径），无法确定时返回 null */
export function resolveLogPath(flag: string): string | null {
  const s = S()
  switch (flag) {
    case 'nginx':
      return s.NginxDir ? join(s.NginxDir, 'common/logs/error.log') : null
    case 'apache':
      return s.ApacheDir ? join(s.ApacheDir, 'common/logs/error_log') : null
    case 'mysql':
      return s.MysqlDir ? join(s.MysqlDir, 'error.log') : null
    case 'mariadb':
      return s.MariaDBDir ? join(s.MariaDBDir, 'error.log') : null
    default:
      return null
  }
}
