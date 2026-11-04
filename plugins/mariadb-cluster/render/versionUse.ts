import { installationSource } from './engine'
import type { EngineRef } from '../shared'
import type { RemovalCandidate } from './RemovalPolicy'
export function usesInstallation(engine: EngineRef, candidate: RemovalCandidate): boolean {
  const norm = (s: string) => s.replace(/\\/g, '/').replace(/\/$/, '')
  const source = installationSource(engine)
  if (
    candidate.bin &&
    [engine.bin, engine.installationBin]
      .filter(Boolean)
      .some((bin) => norm(candidate.bin!) === norm(bin!))
  )
    return true
  if (candidate.path && norm(candidate.path) === norm(engine.path)) return true
  if (candidate.source && candidate.source !== source) return false
  if (candidate.dependentRemoval && source === 'Macports') return true
  if (candidate.name && source !== 'Static') {
    const name = candidate.name.split('/').pop()!
    if (!/^mariadb(?:@?[0-9.]+)?(?:-server)?$/.test(name)) return true
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
