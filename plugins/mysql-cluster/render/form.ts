import type { ClusterMode, EngineRef, CreateRequest, Platform } from '../shared'
export interface Draft {
  id: string
  uuid: string
  name: string
  mode: ClusterMode
  count: number
  startPort: number
  rootDir: string
  password: string
  engine: EngineRef
}
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
      dataDir: `${draft.rootDir.replace(/\\/g, '/').replace(/\/$/, '')}/${draft.id}/node-${n + 1}`,
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
