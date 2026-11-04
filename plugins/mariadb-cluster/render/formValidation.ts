import { normalizedPath, supportedMariaDBVersion } from '../policy'
import type { ClusterMode, EngineRef, InstanceSpec, Platform, SavedCatalog } from '../shared'

export interface InstanceFormModel {
  name: string
  mode: ClusterMode
  count?: number
  startPort?: number
  password: string
  engineBin: string
  members: InstanceSpec[]
}
interface FormContext {
  catalog: SavedCatalog
  platform: Platform
  editingGroupId?: string
  engine?: EngineRef
  t(key: string): string
}

/** View-only field validation; Fork still owns filesystem, availability and mutation checks. */
export function instanceFormErrors(
  model: InstanceFormModel,
  context: FormContext
): Record<string, string> {
  const { catalog, platform, editingGroupId, engine, t } = context
  const errors: Record<string, string> = {}
  const required = (label: string) => t('required') + t(label)
  const normalizedName = (name: string) => name.trim().toLowerCase()
  const edited = new Set(catalog.clusters.find((g) => g.id === editingGroupId)?.memberIds ?? [])
  const others = catalog.instances.filter((i) => !edited.has(i.id))
  if (!model.name.trim()) errors.name = required('clusterName')
  else if (
    catalog.clusters.some(
      (g) => g.id !== editingGroupId && normalizedName(g.name) === normalizedName(model.name)
    )
  )
    errors.name = t('duplicateClusterName') + model.name.trim()
  if (!['standalone', 'replication'].includes(model.mode)) errors.mode = required('mode')
  if (!model.engineBin || !engine || !model.members.length) errors.engineBin = required('version')
  else if (!engine.path || !engine.bin) errors.engineBin = t('unsupported')
  else if (model.mode !== 'standalone' && !supportedMariaDBVersion(engine.version))
    errors.engineBin = t('replicationVersionRequired')
  if (
    model.mode === 'replication' &&
    (!Number.isInteger(model.count) || model.count! < 1 || model.count! > 15)
  )
    errors.count = t('replicaCountInvalid')
  const validPort = (value?: number) => Number.isInteger(value) && value! >= 1 && value! <= 65535
  if (!validPort(model.startPort)) errors.startPort = t('portInvalid')
  if (!editingGroupId && !model.password) errors.password = required('password')

  const ports: { key: string; value?: number }[] = []
  const paths = model.members.map((i) => normalizedPath(i.dataDir, platform))
  const overlaps = (a: string, b: string) =>
    a === b || a.startsWith(b + '/') || b.startsWith(a + '/')
  const socketKey = (s: string) => (platform === 'Windows' ? s.toLowerCase() : s)
  model.members.forEach((member, index) => {
    const key = (field: string) => `members.${index}.${field}`
    if (!member.name.trim()) errors[key('name')] = required('instanceName')
    else if (
      [...others, ...model.members.filter((i) => i.id !== member.id)].some(
        (i) => normalizedName(i.name) === normalizedName(member.name)
      )
    )
      errors[key('name')] = t('duplicateInstanceName') + member.name.trim()
    ports.push({ key: key('port'), value: member.port })
    if (!member.socket) errors[key('socket')] = required(platform === 'Windows' ? 'pipe' : 'socket')
    else if (
      platform === 'Windows'
        ? !/^[a-zA-Z0-9_-]{1,128}$/.test(member.socket)
        : !member.socket.startsWith('/') ||
          /[\r\n\0]/.test(member.socket) ||
          new TextEncoder().encode(member.socket).length > (platform === 'macOS' ? 103 : 107)
    )
      errors[key('socket')] = t(platform === 'Windows' ? 'pipeInvalid' : 'socketInvalid')
    else if (
      [...others, ...model.members.filter((i) => i.id !== member.id)].some(
        (i) => socketKey(i.socket) === socketKey(member.socket)
      )
    )
      errors[key('socket')] = t('socketInUse')
    if (!member.dataDir.trim()) errors[key('dataDir')] = required('dataDir')
    else if (
      /[\r\n\0]/.test(member.dataDir) ||
      !(platform === 'Windows' ? /^[a-z]:[\\/]/i : /^\//).test(member.dataDir)
    )
      errors[key('dataDir')] = t('dataDirInvalid')
    else if (
      paths.some((path, other) => other !== index && overlaps(path, paths[index])) ||
      others.some((i) => overlaps(normalizedPath(i.dataDir, platform), paths[index]))
    )
      errors[key('dataDir')] = t('dataDirOverlap')
  })
  for (const port of ports) {
    if (!validPort(port.value)) errors[port.key] = t('portInvalid')
    else if (
      ports.some((p) => p.key !== port.key && p.value === port.value) ||
      others.some((i) => i.port === port.value)
    )
      errors[port.key] = t('portInUse')
  }
  return errors
}
