export const PGADMIN4_MIN_PYTHON_MINOR = 9
export const PGADMIN4_MAX_PYTHON_MINOR = 13

export interface PgAdminPythonCandidate {
  version: string | null
}

export interface PgAdminPythonModule<T extends PgAdminPythonCandidate> {
  installed: readonly T[]
  fetchInstalled: (retryDataDirectory?: boolean) => Promise<boolean>
}

function pgAdminPythonVersionParts(
  version: string | null | undefined
): readonly [number, number, number] | undefined {
  const match = /^(?:Python\s+)?(\d+)\.(\d+)(?:\.(\d+))?\s*$/.exec(version?.trim() ?? '')
  if (!match) return undefined

  return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)]
}

export function supportsPgAdminPython(version: string | null | undefined): boolean {
  const parts = pgAdminPythonVersionParts(version)
  if (!parts) return false

  const [major, minor] = parts
  return major === 3 && minor >= PGADMIN4_MIN_PYTHON_MINOR && minor <= PGADMIN4_MAX_PYTHON_MINOR
}

export function selectPgAdminPython<T extends PgAdminPythonCandidate>(
  candidates: readonly T[],
  isPreferred: (candidate: T) => boolean
): T | undefined {
  const compatible = candidates.filter((candidate) => supportsPgAdminPython(candidate.version))
  const preferred = compatible.find(isPreferred)
  if (preferred) return preferred

  return compatible.reduce<T | undefined>((highest, candidate) => {
    if (!highest) return candidate
    const candidateVersion = pgAdminPythonVersionParts(candidate.version)!
    const highestVersion = pgAdminPythonVersionParts(highest.version)!
    for (let index = 0; index < candidateVersion.length; index += 1) {
      if (candidateVersion[index] === highestVersion[index]) continue
      return candidateVersion[index] > highestVersion[index] ? candidate : highest
    }
    return highest
  }, undefined)
}

export async function resolvePgAdminPython<T extends PgAdminPythonCandidate>(
  module: PgAdminPythonModule<T>,
  isPreferred: (candidate: T) => boolean,
  ensurePreferredReady: () => Promise<unknown>
): Promise<T | undefined> {
  await Promise.all([module.fetchInstalled(true), ensurePreferredReady()])
  return selectPgAdminPython(module.installed, isPreferred)
}
