import type { ClusterMode, EngineRef, CreateRequest, Platform, InstanceSpec } from '../shared'
export interface Draft {
  id: string
  uuid: string
  name: string
  mode: ClusterMode
  count: number
  startPort: number
  rootDir: string
  dataDirs?: Readonly<Record<string, string>>
  password: string
  engine: EngineRef
}
export const defaultDataRoot = (baseDir: string): string =>
  `${baseDir.replace(/\\/g, '/').replace(/\/$/, '')}/mysql-cluster/data`

export function createDraftRequest(draft: Draft, platform: Platform): CreateRequest {
  const count =
    draft.mode === 'standalone' ? 1 : draft.mode === 'replication' ? draft.count + 1 : draft.count
  const instances = Array.from({ length: Math.max(1, Math.min(32, count)) }, (_, n) => {
    const id = `${draft.id}_${n + 1}`
    return {
      id,
      name: count === 1 ? draft.name : `${draft.name}-${n + 1}`,
      engine: { ...draft.engine },
      port: draft.startPort + n,
      socket:
        platform === 'Windows'
          ? `FlyEnvMC_${draft.id}_${n + 1}`
          : `/tmp/flyenv-mc-${draft.id.slice(0, 12)}-${n + 1}.sock`,
      dataDir:
        draft.dataDirs?.[id] ??
        `${draft.rootDir.replace(/\\/g, '/').replace(/\/$/, '')}/${draft.id}/node-${n + 1}`,
      serverId:
        Number.parseInt(draft.id.replace(/[^a-f0-9]/gi, '').slice(0, 6) || '1', 16) * 32 + n + 1,
      groupId: draft.id,
      groupPort: draft.mode === 'group-replication' ? draft.startPort + 100 + n : undefined
    }
  })
  return {
    cluster: {
      id: draft.id,
      name: draft.name,
      mode: draft.mode,
      memberIds: instances.map((i) => i.id),
      groupUuid: draft.uuid
    },
    instances,
    credentials: Object.fromEntries(
      instances.map((i) => [i.id, { user: 'root', password: draft.password }])
    )
  }
}

export function suggestStartPort(
  instances: readonly Pick<InstanceSpec, 'port' | 'groupPort'>[],
  mode: ClusterMode,
  count: number
): number | undefined {
  const members = mode === 'standalone' ? 1 : mode === 'replication' ? count + 1 : count
  if (!Number.isInteger(members) || members < 1 || members > 32) return undefined
  const used = new Set<number>()
  let highestSql = 0
  for (const instance of instances) {
    for (const port of [instance.port, instance.groupPort])
      if (port && Number.isInteger(port) && port > 0 && port <= 65535) used.add(port)
    if (Number.isInteger(instance.port) && instance.port > 0 && instance.port <= 65535)
      highestSql = Math.max(highestSql, instance.port)
  }
  const limit = 65535 - members + 1 - (mode === 'group-replication' ? 100 : 0)
  const find = (from: number, to: number) => {
    for (let start = from; start <= to; start++) {
      let available = true
      for (let n = 0; n < members; n++)
        if (used.has(start + n) || (mode === 'group-replication' && used.has(start + 100 + n))) {
          available = false
          break
        }
      if (available) return start
    }
    return undefined
  }
  const preferred = Math.max(13306, highestSql + 1)
  return (
    find(preferred, limit) ??
    find(13306, Math.min(preferred - 1, limit)) ??
    find(1, Math.min(13305, limit))
  )
}
