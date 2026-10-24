export const isGGUFShardPath = (path: string): boolean =>
  /-\d{5}-of-\d{5}\.gguf$/i.test(path.replace(/\\/g, '/').split('/').at(-1) ?? '')

export const isStandaloneGGUFPath = (path: string, repoId = ''): boolean => {
  const segments = path.replace(/\\/g, '/').split('/')
  const filename = segments.at(-1)?.toLowerCase() ?? ''
  return (
    filename.endsWith('.gguf') &&
    !/(?:^|[-_.])draft(?:[-_.]|$)/i.test(repoId) &&
    !isGGUFShardPath(path) &&
    !/mmproj/.test(filename) &&
    !/^imatrix(?:[-_.]|$)/.test(filename) &&
    !/^mtp(?:[-_.]|$)/.test(filename) &&
    !/(?:^|[-_.])dflash(?:[-_.]|$)/.test(filename) &&
    !/(?:^|[-_.])(?:mtp[-_.]draft|draft[-_.]mtp)(?:[-_.]|$)/.test(filename) &&
    !/[-_.]vision(?:[-_.]encoder)?\.gguf$/.test(filename) &&
    !segments.slice(0, -1).some((segment) => /^(?:mtp|mmproj|imatrix)$/i.test(segment))
  )
}

export const modelFileKey = (file: { repoId: string; revision: string; path: string }): string =>
  JSON.stringify([file.repoId, file.revision, file.path])

export type FileRole = 'main' | 'projector' | 'draft-or-mtp' | 'shard' | 'support' | 'unknown'
export interface GGUFDescription {
  role: FileRole
  architecture?: string
  reason?: string
  valid: boolean
  metadata?: Record<string, string | number | boolean>
}
export const describeModelFile = (file: {
  path: string
  standalone?: boolean
  description?: GGUFDescription
  repoId?: string
}): GGUFDescription => {
  if (isGGUFShardPath(file.path)) return { role: 'shard', valid: true }
  if (file.description) return file.description
  if (file.standalone) return { role: 'main', valid: true }
  if (/mmproj/i.test(file.path))
    return {
      role: 'projector',
      valid: true,
      reason: 'Filename candidate; loading compatibility unverified'
    }
  if (/(?:draft|mtp|dflash|eagle)/i.test(file.path)) return { role: 'draft-or-mtp', valid: true }
  return {
    role:
      file.standalone === false
        ? 'unknown'
        : isStandaloneGGUFPath(file.path, file.repoId)
          ? 'main'
          : 'support',
    valid: true,
    reason: 'File metadata not inspected'
  }
}
export const rankProjectors = <
  T extends { repoId: string; revision: string; resolvedRevision?: string; path: string }
>(
  model: T,
  files: T[]
) =>
  files
    .filter((f) => describeModelFile(f).role === 'projector')
    .map((file) => ({
      file,
      confidence:
        file.repoId === model.repoId &&
        file.resolvedRevision &&
        file.resolvedRevision === model.resolvedRevision
          ? 3
          : file.repoId === model.repoId && file.revision === model.revision
            ? 2
            : 1
    }))
    .sort((a, b) => b.confidence - a.confidence || a.file.path.localeCompare(b.file.path))

export const managedReference = (file: {
  repoId: string
  revision: string
  path: string
  size: number
  sha256?: string
  mtimeMs?: number
}) => ({
  kind: 'managed' as const,
  fileKey: modelFileKey(file),
  fingerprint: {
    size: file.size,
    sha256: file.sha256,
    ...(file.mtimeMs === undefined ? {} : { mtimeMs: file.mtimeMs })
  }
})
