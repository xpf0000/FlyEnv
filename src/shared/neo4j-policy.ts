import { compareVersions } from './compare-versions'

export const NEO4J_MIN_VERSION = '5.23.0'

export type Neo4jJavaPolicy = {
  supportedMajor: number[]
  recommendedMajor: number
}

export type Neo4jJavaCandidate = {
  bin: string
  path: string
  version: string | null
  num?: number | null
}

export function isNeo4jSupportedVersion(version: string | null | undefined) {
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) return false
  return compareVersions(version, NEO4J_MIN_VERSION) >= 0
}

export function resolveNeo4jJavaPolicy(version: string | null | undefined): Neo4jJavaPolicy {
  if (!isNeo4jSupportedVersion(version)) {
    return { supportedMajor: [], recommendedMajor: 0 }
  }
  const calendar = version!.match(/^(\d{4})\.(\d{2})\./)
  const year = calendar ? Number(calendar[1]) : 0
  const month = calendar ? Number(calendar[2]) : 0
  if (year === 2025 && month >= 1 && month <= 9) {
    return { supportedMajor: [21], recommendedMajor: 21 }
  }
  if (year > 2025 || (year === 2025 && month >= 10)) {
    return { supportedMajor: [21, 25], recommendedMajor: 21 }
  }
  return { supportedMajor: [17, 21], recommendedMajor: 21 }
}

export function javaMajorFromVersion(version: string | null | undefined) {
  const value = `${version ?? ''}`.trim()
  const match = value.match(/(?:^|[^\d])(\d{1,2})(?:\.|$)/)
  return match ? Number(match[1]) : 0
}

export function filterJavaCandidates(
  version: string | null | undefined,
  candidates: Neo4jJavaCandidate[]
) {
  const policy = resolveNeo4jJavaPolicy(version)
  const filtered = candidates.filter((candidate) => {
    const major = candidate.num
      ? Number(String(candidate.num).slice(0, 2))
      : javaMajorFromVersion(candidate.version)
    return policy.supportedMajor.includes(major)
  })
  filtered.sort((a, b) => {
    const aMajor = a.num ? Number(String(a.num).slice(0, 2)) : javaMajorFromVersion(a.version)
    const bMajor = b.num ? Number(String(b.num).slice(0, 2)) : javaMajorFromVersion(b.version)
    return Number(bMajor === policy.recommendedMajor) - Number(aMajor === policy.recommendedMajor)
  })
  return filtered
}
