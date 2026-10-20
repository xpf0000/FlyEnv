import type { InstanceSpec, ClusterMode, Platform } from '../shared'
import type { InstancePaths } from './paths'
import { replicationCapabilities } from '../policy'

export const iniValue = (value: string): string => {
  if (/[\r\n\0]/.test(value)) throw new Error('Invalid configuration value')
  return '"' + value.replace(/\\/g, '/').replace(/"/g, '\\"') + '"'
}
export function renderConfig(spec: InstanceSpec, mode: ClusterMode, paths: Pick<InstancePaths, 'config' | 'pid' | 'error' | 'slow'>, platform: Platform): string {
  const modern = replicationCapabilities(spec.engine.version).modernReplicaVariables
  const lines = [
    '[mysqld]', `basedir=${iniValue(spec.engine.path)}`, `datadir=${iniValue(spec.dataDir)}`,
    'bind-address=127.0.0.1', `port=${spec.port}`, `socket=${iniValue(spec.socket)}`,
    `pid-file=${iniValue(paths.pid)}`, `log-error=${iniValue(paths.error)}`,
    'slow-query-log=ON', `slow-query-log-file=${iniValue(paths.slow)}`, 'loose-mysqlx=0',
    `server-id=${spec.serverId}`, 'skip-name-resolve=ON',
    ...(platform === 'Windows' ? ['enable-named-pipe=ON'] : [])
  ]
  if (mode !== 'standalone') lines.push('gtid-mode=ON', 'enforce-gtid-consistency=ON',
    `log-bin=${iniValue(spec.dataDir + '/binlog')}`, 'binlog-format=ROW', 'sql-require-primary-key=ON',
    `${modern ? 'log-replica-updates' : 'log-slave-updates'}=ON`, `${modern ? 'skip-replica-start' : 'skip-slave-start'}=ON`,
    `${modern ? 'replica-preserve-commit-order' : 'slave-preserve-commit-order'}=ON`)
  if (mode === 'group-replication') lines.push(
    `plugin-load-add=group_replication.${platform === 'Windows' ? 'dll' : 'so'}`,
    'group-replication-start-on-boot=OFF', 'group-replication-single-primary-mode=ON',
    'group-replication-bootstrap-group=OFF', `group-replication-local-address=127.0.0.1:${spec.groupPort}`,
    'group-replication-ip-allowlist=127.0.0.1', 'group-replication-exit-state-action=READ_ONLY')
  return lines.join('\n') + '\n'
}
export function validateConfigEdit(spec: InstanceSpec, text: string, original?: string): void {
  const protectedKeys = /^(?:loose-)?(?:basedir|datadir|port|socket|pid-file|bind-address|server-id|log-error|slow-query-log-file|mysqlx.*|plugin-load.*|group-replication.*|gtid.*|enforce-gtid.*|log-bin.*|binlog.*|relay-log.*|replica.*|slave.*|skip-replica.*|skip-slave.*|read-only|super-read-only|init-file|skip-grant-tables)$/
  const parse = (source: string) => {
    const keys = new Map<string, string>(); let section = ''
    for (const line of source.split(/\r?\n/)) {
      const s = line.trim()
      if (!s || /^[#;]/.test(s)) continue
      if (/^!/.test(s)) throw new Error('Managed configuration cannot include external files')
      if (s.startsWith('[')) { section = s.toLowerCase(); continue }
      if (section !== '[mysqld]') throw new Error('Only [mysqld] options can be edited')
      const at = s.indexOf('='); const key = (at < 0 ? s : s.slice(0, at)).trim().toLowerCase().replace(/_/g, '-')
      if (keys.has(key)) throw new Error('Duplicate configuration option')
      keys.set(key, at < 0 ? '' : s.slice(at + 1).trim())
    }
    return keys
  }
  const values = parse(text)
  if (original) {
    const before = parse(original)
    for (const key of new Set([...values.keys(), ...before.keys()])) {
      if (protectedKeys.test(key) && values.get(key) !== before.get(key)) throw new Error(`Managed option: ${key}`)
    }
  } else if (values.get('port') !== String(spec.port) || values.get('socket') !== iniValue(spec.socket) || values.get('datadir') !== iniValue(spec.dataDir)) throw new Error('Managed instance identity cannot change')
}
