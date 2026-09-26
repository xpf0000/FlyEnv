import { compareVersions } from './compare-versions'

/** Podman first reads [machine] rosetta from containers.conf (Apple Silicon). */
export const PODMAN_ROSETTA_MIN_VERSION = '5.1.0'

/**
 * Extract a comparable x.y.z from `podman --version` output.
 * Examples: "podman version 5.1.0" -> "5.1.0", "5.1" -> "5.1.0", "5.2.0-rc1" -> "5.2.0"
 */
export function parsePodmanVersion(raw: string): string | undefined {
  if (!raw) {
    return undefined
  }
  const match = String(raw).match(/(\d+)\.(\d+)(?:\.(\d+))?/)
  if (!match) {
    return undefined
  }
  return `${match[1]}.${match[2]}.${match[3] ?? '0'}`
}

/**
 * Whether Podman is new enough for the containers.conf Rosetta toggle.
 * Unknown / unparsable versions return false so callers can distinguish
 * "known too old" vs "unknown" themselves (see UI gating).
 */
export function podmanSupportsRosetta(rawVersion: string): boolean {
  const version = parsePodmanVersion(rawVersion)
  if (!version) {
    return false
  }
  try {
    return compareVersions(version, PODMAN_ROSETTA_MIN_VERSION) >= 0
  } catch {
    return false
  }
}

/** True only when the version string parses and is strictly below the minimum. */
export function podmanRosettaVersionTooOld(rawVersion: string): boolean {
  const version = parsePodmanVersion(rawVersion)
  if (!version) {
    return false
  }
  try {
    return compareVersions(version, PODMAN_ROSETTA_MIN_VERSION) < 0
  } catch {
    return false
  }
}

export const PODMAN_ROSETTA_DROPIN = `# Managed by FlyEnv. Global Podman [machine] rosetta preference (not per-VM).
# Safe to delete. Honored by Podman >= ${PODMAN_ROSETTA_MIN_VERSION} on Apple Silicon.
`
