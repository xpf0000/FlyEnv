import type { ClusterMode, EngineRef, CreateRequest, Platform, InstanceSpec } from '../shared'
export interface Draft {
  id: string
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
  `${baseDir.replace(/\\/g, '/').replace(/\/$/, '')}/mariadb-cluster/data`

export function createDraftRequest(draft: Draft, platform: Platform): CreateRequest {
  const count = draft.mode === 'standalone' ? 1 : draft.count + 1
  const instances = Array.from({ length: Math.max(1, Math.min(32, count)) }, (_, n) => {
    const id = `${draft.id}_${n + 1}`
    return {
      id,
      name: count === 1 ? draft.name : `${draft.name}-${n + 1}`,
      engine: { ...draft.engine },
      port: draft.startPort + n,
      socket:
        platform === 'Windows'
          ? `FlyEnvMDBC_${draft.id}_${n + 1}`
          : `/tmp/flyenv-mdbc-${draft.id.slice(0, 12)}-${n + 1}.sock`,
      dataDir:
        draft.dataDirs?.[id] ??
        `${draft.rootDir.replace(/\\/g, '/').replace(/\/$/, '')}/${draft.id}/node-${n + 1}`,
      serverId:
        Number.parseInt(draft.id.replace(/[^a-f0-9]/gi, '').slice(0, 6) || '1', 16) * 32 + n + 1
    }
  })
  return {
    cluster: {
      id: draft.id,
      name: draft.name,
      mode: draft.mode,
      memberIds: instances.map((i) => i.id)
    },
    instances,
    credentials: Object.fromEntries(
      instances.map((i) => [i.id, { user: 'root', password: draft.password }])
    )
  }
}

export function suggestStartPort(
  instances: readonly Pick<InstanceSpec, 'port'>[],
  mode: ClusterMode,
  count: number
): number | undefined {
  const members = mode === 'standalone' ? 1 : count + 1
  if (!Number.isInteger(members) || members < 1 || members > 32) return undefined
  const used = new Set<number>()
  let highestSql = 0
  for (const instance of instances) {
    if (Number.isInteger(instance.port) && instance.port > 0 && instance.port <= 65535) {
      used.add(instance.port)
      highestSql = Math.max(highestSql, instance.port)
    }
  }
  const limit = 65535 - members + 1
  const find = (from: number, to: number) => {
    for (let start = from; start <= to; start++) {
      let available = true
      for (let n = 0; n < members; n++)
        if (used.has(start + n)) {
          available = false
          break
        }
      if (available) return start
    }
    return undefined
  }
  const preferred = Math.max(13307, highestSql + 1)
  return (
    find(preferred, limit) ??
    find(13307, Math.min(preferred - 1, limit)) ??
    find(1, Math.min(13307 - 1, limit))
  )
}
