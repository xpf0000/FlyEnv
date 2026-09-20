export const FLYENV_PLUGIN_API_VERSION = 1

export type FlyEnvPluginManifest = {
  apiVersion: number
  id: string
  name: string
  version: string
  description?: string
  author?: string
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

const safeId = /^[a-z0-9][a-z0-9._-]*$/i

export function validatePluginManifest(value: unknown): FlyEnvPluginManifest {
  if (!value || typeof value !== 'object') {
    throw new Error('plugin.json must contain an object')
  }
  const manifest = value as FlyEnvPluginManifest
  if (manifest.apiVersion !== FLYENV_PLUGIN_API_VERSION) {
    throw new Error(`Unsupported plugin apiVersion: ${manifest.apiVersion}`)
  }
  if (!manifest.id || !safeId.test(manifest.id)) {
    throw new Error('Plugin id is invalid')
  }
  if (!manifest.name || !manifest.version) {
    throw new Error('Plugin name and version are required')
  }
  if (!manifest.module?.typeFlag || !safeId.test(manifest.module.typeFlag)) {
    throw new Error('Plugin module.typeFlag is invalid')
  }
  if (!manifest.entry || (!manifest.entry.render && !manifest.entry.fork)) {
    throw new Error('Plugin must define at least one entry')
  }
  return manifest
}
