import type { CreateRequest, Platform, SavedCatalog } from './shared'

export function normalizedPath(value: string, platform: Platform): string {
  const parts: string[] = []
  for (const part of value.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  const result = parts.join('/')
  return platform === 'Windows' ? result.toLowerCase() : result
}
export function replicationCapabilities(version: string) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version)
  const major = Number(match?.[1]),
    minor = Number(match?.[2]),
    patch = Number(match?.[3])
  return {
    supported:
      !!match &&
      !/maria/i.test(version) &&
      (major > 8 || (major === 8 && (minor > 0 || patch >= 13))),
    groupSupported:
      !!match &&
      !/maria/i.test(version) &&
      (major > 8 || (major === 8 && (minor > 0 || patch >= 27))),
    sourceSyntax: major > 8 || (major === 8 && (minor > 0 || patch >= 23)),
    modernReplicaVariables: major > 8 || (major === 8 && (minor > 0 || patch >= 26))
  }
}
export function validateCreateRequest(request: CreateRequest, platform: Platform): true {
  if (!request?.cluster || !Array.isArray(request.instances) || !request.instances.length)
    throw new Error('Invalid members')
  const { cluster, instances } = request
  const validId = (value: string) =>
    typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value)
  if (!validId(cluster.id) || !cluster.name?.trim()) throw new Error('Invalid cluster ID or name')
  if (!['standalone', 'replication', 'group-replication'].includes(cluster.mode))
    throw new Error('Invalid mode')
  if (cluster.mode === 'standalone' && instances.length !== 1)
    throw new Error('Standalone needs one node')
  if (cluster.mode === 'replication' && instances.length < 2)
    throw new Error('Replication needs two member nodes')
  if (cluster.mode === 'group-replication' && ![3, 5, 7, 9].includes(instances.length))
    throw new Error('GR needs 3, 5, 7 or 9 nodes')
  const ids = new Set(instances.map((i) => i.id))
  if (ids.size !== instances.length || instances.some((i) => !validId(i.id)))
    throw new Error('Invalid or duplicate instance ID')
  if (
    !Array.isArray(cluster.memberIds) ||
    cluster.memberIds.length !== ids.size ||
    new Set(cluster.memberIds).size !== ids.size ||
    cluster.memberIds.some((id) => !ids.has(id))
  )
    throw new Error('Invalid members')
  const ports = new Set<number>(),
    sockets = new Set<string>(),
    servers = new Set<number>(),
    dirs: string[] = []
  const port = (p: number) => {
    if (!Number.isInteger(p) || p < 1 || p > 65535 || ports.has(p))
      throw new Error(`Invalid or duplicate port: ${p}`)
    ports.add(p)
  }
  for (const item of instances) {
    if (
      !item.name?.trim() ||
      !item.engine?.path ||
      !item.engine?.bin ||
      !item.engine.version ||
      /maria/i.test(item.engine.version)
    )
      throw new Error('Invalid MySQL version')
    if (cluster.mode !== 'standalone') {
      if (!replicationCapabilities(item.engine.version).supported)
        throw new Error('Replication requires MySQL 8.0.13 or later')
      if (
        cluster.mode === 'group-replication' &&
        !replicationCapabilities(item.engine.version).groupSupported
      )
        throw new Error('Group Replication requires MySQL 8.0.27 or later')
      if (
        item.engine.bin !== instances[0].engine.bin ||
        item.engine.version !== instances[0].engine.version
      )
        throw new Error('All nodes require the same version and installation')
    }
    port(item.port)
    if (item.groupPort !== undefined) port(item.groupPort)
    if (cluster.mode === 'group-replication' && !item.groupPort) throw new Error('Missing GR port')
    if (
      !Number.isInteger(item.serverId) ||
      item.serverId < 1 ||
      item.serverId > 4294967295 ||
      servers.has(item.serverId)
    )
      throw new Error('Invalid or duplicate server ID')
    servers.add(item.serverId)
    if (
      typeof item.dataDir !== 'string' ||
      /[\r\n\0]/.test(item.dataDir) ||
      !(platform === 'Windows' ? /^[a-z]:[\\/]/i : /^\//).test(item.dataDir)
    )
      throw new Error('Invalid data directory')
    const dir = normalizedPath(item.dataDir, platform)
    if (dirs.some((d) => d === dir || d.startsWith(dir + '/') || dir.startsWith(d + '/')))
      throw new Error('Overlapping data directories')
    dirs.push(dir)
    if (!item.socket || /[\r\n\0]/.test(item.socket)) throw new Error('Invalid socket')
    if (platform === 'Windows') {
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(item.socket)) throw new Error('Invalid named pipe')
    } else if (
      !item.socket.startsWith('/') ||
      new TextEncoder().encode(item.socket).length > (platform === 'macOS' ? 103 : 107)
    )
      throw new Error('Invalid socket path or socket path too long')
    const socket = platform === 'Windows' ? item.socket.toLowerCase() : item.socket
    if (sockets.has(socket)) throw new Error('Duplicate socket')
    sockets.add(socket)
  }
  return true
}
export function validateCatalog(value: unknown): SavedCatalog {
  const v = value as SavedCatalog
  if (v?.schemaVersion !== 1 || !Array.isArray(v.instances) || !Array.isArray(v.clusters))
    throw new Error('Invalid catalog schema')
  const all = new Set<string>(),
    groups = new Set<string>(),
    claimed = new Set<string>()
  for (const item of v.instances) {
    if (!item?.id || all.has(item.id)) throw new Error('Duplicate instance ID')
    all.add(item.id)
  }
  for (const group of v.clusters) {
    if (groups.has(group.id)) throw new Error('Duplicate cluster ID')
    groups.add(group.id)
    const members = group.memberIds?.map((id) => v.instances.find((i) => i.id === id))
    if (!members || members.some((i) => !i)) throw new Error('Invalid catalog members')
    const platform: Platform = members[0]!.dataDir.match(/^[a-z]:/i) ? 'Windows' : 'Linux'
    validateCreateRequest({ cluster: group, instances: members as any, credentials: {} }, platform)
    for (const id of group.memberIds) {
      if (claimed.has(id)) throw new Error('Instance belongs to multiple clusters')
      claimed.add(id)
    }
  }
  if (claimed.size !== all.size) throw new Error('Unowned catalog instance')
  return JSON.parse(JSON.stringify(v))
}
