import type { SoftInstalled } from '@shared/app'

export type BrewIdentity = { bin: string; prefix: string; cellar: string; arch: string }
export type BrewFormulaSnapshot = {
  identity: BrewIdentity
  formula: string
  tap: string
  installedVersions: string[]
  availableVersion: string
  kegs: string[]
  affectedRacks: string[]
  pinned: boolean
  outdated: boolean
  eligible: boolean
  reason?: string
  fingerprint: string
}
export type BrewServiceTarget = { module: string; item: SoftInstalled; generation?: number }
export type BrewUpgradeCatalog = {
  rows: BrewFormulaSnapshot[]
  failures: { formula: string; error: string }[]
}
export type BrewUpgradePreview = {
  previewId: string
  module: 'php'
  snapshot: BrewFormulaSnapshot
  targets: BrewServiceTarget[]
}
export type BrewPackageAction = 'install' | 'uninstall' | 'upgrade'
export type BrewPackageResult = {
  operationId: string
  identity?: BrewIdentity
  postprocessError?: string
  action: BrewPackageAction
  outcome: 'succeeded' | 'failed' | 'unknown'
  code?: number | null
  signal?: string | null
  error?: string
  logs: string
}
