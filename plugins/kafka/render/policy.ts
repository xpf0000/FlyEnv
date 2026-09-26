import type { SoftInstalled } from '@/store/brew'
import { compareVersions } from '@shared/compare-versions'

export const kafkaMinJavaMajor = 17

export type KafkaJavaCandidate = {
  bin: string
  path: string
  version: string | null
  num?: number | null
}

/** Parse a JDK version string (17, 17.0.9, 1.8.0_292, 21.x) to a major number. */
export function javaMajorFromVersion(version: string | null | undefined) {
  const value = `${version ?? ''}`.trim().replace(/_/g, '.')
  if (!value) return 0
  const legacy = value.match(/^1\.(\d+)/)
  if (legacy) return Number(legacy[1])
  const match = value.match(/^(\d+)/)
  return match ? Number(match[1]) : 0
}

export function kafkaJavaCandidateMajor(candidate: KafkaJavaCandidate) {
  const fromVersion = javaMajorFromVersion(candidate.version)
  if (fromVersion > 0) return fromVersion
  return candidate.num ? Number(String(candidate.num).slice(0, 2)) : 0
}

function comparableJavaVersion(version: string | null | undefined) {
  const normalized = `${version ?? ''}`
    .trim()
    .replace(/_/g, '.')
    .replace(/[^\d.].*$/, '')
  return normalized || '0'
}

/** Sort display candidates from the newest Java runtime to the oldest. */
export function sortKafkaJavaCandidates(candidates: KafkaJavaCandidate[]) {
  return [...candidates].sort((a, b) => {
    const majorResult = kafkaJavaCandidateMajor(b) - kafkaJavaCandidateMajor(a)
    if (majorResult !== 0) return majorResult

    let versionResult = 0
    try {
      versionResult = compareVersions(
        comparableJavaVersion(b.version),
        comparableJavaVersion(a.version)
      )
    } catch {
      versionResult = 0
    }
    if (versionResult !== 0) return versionResult
    return `${a.path}`.localeCompare(`${b.path}`)
  })
}

/** Keep only JDK installations whose major version can run Kafka (Java 17+). */
export function filterKafkaJavaCandidates(installed: SoftInstalled[]): KafkaJavaCandidate[] {
  const candidates = installed
    .map((item) => ({
      bin: item.bin,
      path: item.path,
      version: item.version ?? null,
      num: item.num
    }))
    .filter((candidate) => kafkaJavaCandidateMajor(candidate) >= kafkaMinJavaMajor)
  return sortKafkaJavaCandidates(candidates)
}
