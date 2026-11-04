import { createHash } from 'node:crypto'

// Local identities describe a canonical file, without asserting a Hub source.
export const localModelIdentity = (canonicalPath: string, relativeName: string) => ({
  repoId: `local/${createHash('sha256').update(canonicalPath).digest('hex').slice(0, 20)}`,
  revision: 'local',
  path: relativeName
})
