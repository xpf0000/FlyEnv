import { validatePluginMCP, type PluginMCPDeclaration } from './PluginMCP'
import type { PluginRuntimeDeclaration } from './PluginRuntime'

export const FLYENV_PLUGIN_API_VERSION = 2
export const FLYENV_SUPPORTED_PLUGIN_API_VERSIONS = [1, 2] as const
export const isPluginApiSupported = (version: number = 1) =>
  (FLYENV_SUPPORTED_PLUGIN_API_VERSIONS as readonly number[]).includes(version)

export const FLYENV_PLUGIN_PLATFORMS = ['macOS', 'Windows', 'Linux'] as const
export const FLYENV_PLUGIN_ARCHITECTURES = ['x64', 'arm64', 'arm', 'ia32'] as const

type PluginArchitecture = (typeof FLYENV_PLUGIN_ARCHITECTURES)[number]

/**
 * Plugin text that may be localized: either a plain string (shown as-is for
 * every language) or a map of locale code -> text, for example
 * `{ "en": "...", "zh": "..." }`. Locale codes match the app's language
 * directories (`en`, `zh`, `zh-hant`, `pt-br`, ...).
 */
export type FlyEnvPluginI18nText = string | Record<string, string>

/**
 * Resolve a FlyEnvPluginI18nText for a locale. Lookup order: exact locale,
 * base language (`pt-br` -> `pt`), `en`, then the first entry.
 */
export function resolvePluginI18nText(
  text: FlyEnvPluginI18nText | undefined,
  locale: string
): string | undefined {
  if (!text) return undefined
  if (typeof text === 'string') return text
  const normalized = `${locale}`.toLowerCase()
  if (text[normalized]) return text[normalized]
  const base = normalized.split('-')[0]
  if (base && text[base]) return text[base]
  if (text.en) return text.en
  const first = Object.values(text).find((value) => typeof value === 'string' && value)
  return first || undefined
}

function isValidI18nText(value: unknown): boolean {
  if (typeof value === 'string') return true
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const entries = Object.values(value as Record<string, unknown>)
  return entries.length > 0 && entries.every((item) => typeof item === 'string' && !!item)
}

export type FlyEnvPluginManifest = {
  apiVersion: number
  id: string
  name: string
  version: string
  description?: FlyEnvPluginI18nText
  author?: string
  homepage?: string
  icon?: string
  architecture?: PluginArchitecture[]
  runtime?: PluginRuntimeDeclaration
  mcp?: PluginMCPDeclaration
  module: {
    typeFlag: string
    moduleType?: string
    label?: string
    asideIndex?: number
    isService?: boolean
    isTray?: boolean
    platform?: Array<'macOS' | 'Windows' | 'Linux'>
  }
  entry: {
    render?: string
    fork?: string
  }
}

export type FlyEnvPluginArtifact = {
  url: string
  sha256?: string
}

export type FlyEnvPluginCatalogItem = {
  apiVersion?: number
  id: string
  name: string
  version: string
  description?: FlyEnvPluginI18nText
  author?: string
  homepage?: string
  icon?: string
  module?: FlyEnvPluginManifest['module']
  platforms?: FlyEnvPluginManifest['module']['platform']
  artifact: FlyEnvPluginArtifact
  /** Legacy registry alias accepted for compatibility with the original proposal. */
  package?: FlyEnvPluginArtifact
  official?: boolean
  source?: string
}

export type FlyEnvPluginCatalog = {
  schemaVersion?: number
  plugins: FlyEnvPluginCatalogItem[]
}

const safeId = /^[a-z0-9][a-z0-9._-]*$/i
const semver =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

function validateRelativeEntry(entry: string) {
  if (!entry || entry.includes('\\') || entry.startsWith('/') || /^[A-Za-z]:/.test(entry)) {
    throw new Error('Plugin entry must stay inside the package')
  }
  const parts = entry.split('/')
  if (parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error('Plugin entry must stay inside the package')
  }
}

export function validatePluginManifest(value: unknown): FlyEnvPluginManifest {
  if (!value || typeof value !== 'object') {
    throw new Error('plugin.json must contain an object')
  }
  const manifest = value as FlyEnvPluginManifest
  if (!isPluginApiSupported(manifest.apiVersion) || manifest.apiVersion === undefined) {
    throw new Error(`Unsupported plugin apiVersion: ${manifest.apiVersion}`)
  }
  if (!manifest.id || !safeId.test(manifest.id)) {
    throw new Error('Plugin id is invalid')
  }
  if (typeof manifest.name !== 'string' || !manifest.name || typeof manifest.version !== 'string') {
    throw new Error('Plugin name and version are required')
  }
  if (manifest.description !== undefined && !isValidI18nText(manifest.description)) {
    throw new Error('Plugin description must be a string or a locale-to-text map')
  }
  if (!semver.test(manifest.version))
    throw new Error(`Plugin version is invalid: ${manifest.version}`)
  if (!manifest.module?.typeFlag || !safeId.test(manifest.module.typeFlag)) {
    throw new Error('Plugin module.typeFlag is invalid')
  }
  if (!manifest.entry || (!manifest.entry.render && !manifest.entry.fork)) {
    throw new Error('Plugin must define at least one entry')
  }
  if (manifest.module.platform) {
    if (
      !Array.isArray(manifest.module.platform) ||
      manifest.module.platform.some((platform) => !FLYENV_PLUGIN_PLATFORMS.includes(platform))
    ) {
      throw new Error('Plugin module.platform is invalid')
    }
  }
  if (manifest.architecture) {
    if (
      !Array.isArray(manifest.architecture) ||
      manifest.architecture.some(
        (architecture) => !FLYENV_PLUGIN_ARCHITECTURES.includes(architecture)
      )
    ) {
      throw new Error('Plugin architecture is invalid')
    }
  }
  for (const entry of [manifest.entry.render, manifest.entry.fork]) {
    if (entry) validateRelativeEntry(entry)
  }
  if (manifest.runtime !== undefined || manifest.mcp !== undefined) {
    if (manifest.apiVersion !== 2) throw new Error('Plugin capabilities require API 2')
    if (
      !manifest.entry.fork ||
      manifest.runtime?.mode !== 'dedicated' ||
      manifest.runtime?.dataAccess !== 'exclusive'
    )
      throw new Error('Plugin capabilities require a dedicated exclusive fork runtime')
    if (manifest.mcp !== undefined) validatePluginMCP(manifest.mcp)
  }
  return manifest
}

export function validatePluginCatalog(value: unknown): FlyEnvPluginCatalog {
  if (!value || typeof value !== 'object') throw new Error('Plugin registry must contain an object')
  const raw = value as Record<string, any>
  const catalog = (
    Array.isArray(raw.plugins)
      ? raw
      : raw.id
        ? {
            schemaVersion: 1,
            plugins: [
              {
                ...raw,
                artifact: raw.artifact ?? { url: raw.url ?? raw.downloadUrl }
              }
            ]
          }
        : raw
  ) as FlyEnvPluginCatalog
  if (!Array.isArray(catalog.plugins)) throw new Error('Plugin registry plugins must be an array')
  const validated: FlyEnvPluginCatalogItem[] = []
  for (const plugin of catalog.plugins) {
    if (!plugin || !safeId.test(plugin.id) || !plugin.name || !plugin.version) {
      throw new Error('Plugin registry contains an invalid plugin')
    }
    if (plugin.description !== undefined && !isValidI18nText(plugin.description)) {
      throw new Error(`Plugin registry description is invalid: ${plugin.id}`)
    }
    if (
      plugin.apiVersion !== undefined &&
      (!Number.isSafeInteger(plugin.apiVersion) || plugin.apiVersion < 1)
    )
      throw new Error(`Plugin registry apiVersion is invalid: ${plugin.id}`)
    const candidate = plugin as FlyEnvPluginCatalog['plugins'][number] & {
      url?: string
      downloadUrl?: string
    }
    if (!candidate.artifact && (candidate.url || candidate.downloadUrl)) {
      candidate.artifact = { url: candidate.url ?? candidate.downloadUrl! }
    }
    const packageArtifact = (plugin as FlyEnvPluginCatalogItem & { package?: FlyEnvPluginArtifact })
      .package
    if (!candidate.artifact && packageArtifact) candidate.artifact = packageArtifact
    // Draft entries (url intentionally left empty until the release asset is
    // uploaded) are skipped instead of rejecting the whole registry.
    if (plugin.artifact?.url === '') {
      continue
    }
    if (!plugin.artifact?.url || !/^https?:\/\//i.test(plugin.artifact.url)) {
      throw new Error(`Plugin registry artifact URL is invalid: ${plugin.id}`)
    }
    if (plugin.artifact.sha256 && !/^[a-f0-9]{64}$/i.test(plugin.artifact.sha256)) {
      throw new Error(`Plugin registry artifact checksum is invalid: ${plugin.id}`)
    }
    validated.push(plugin)
  }
  catalog.plugins = validated
  return catalog
}
