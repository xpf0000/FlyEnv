import type { EngineRef } from '../shared'
import type { RemovalCandidate } from '@/components/VersionManager/RemovalPolicy'
export function usesInstallation(engine: EngineRef, candidate: RemovalCandidate): boolean {
  const norm = (s: string) => s.replace(/\\/g, '/').replace(/\/$/, '')
  if (candidate.source && candidate.source !== engine.source) return false
  if (candidate.bin && norm(candidate.bin) === norm(engine.bin)) return true
  if (candidate.path && norm(candidate.path) === norm(engine.path)) return true
  if (candidate.name && engine.source !== 'Static') {
    const name = candidate.name.split('/').pop()!
    return (
      norm(engine.path).split('/').includes(name) ||
      norm(engine.bin)
        .split('/')
        .some((p) => p === name || p === name + '-server')
    )
  }
  if (candidate.version) return candidate.version.replace(/_\d+$/, '') === engine.version
  // An unresolved installed removal can affect any engine from the same source.
  return true
}
