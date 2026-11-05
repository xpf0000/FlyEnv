import type { PhpExtensionProfile } from './WindowsExtensions'

export type ExtensionRelease = {
  version: string
  compatible: boolean | null
  url?: string
  error?: string
}

export type ExtensionPreparation = {
  name: string
  source: 'pecl' | 'pie'
  homepage: string
  profile: PhpExtensionProfile
  releases: ExtensionRelease[]
  command?: string
  extension?: string
  zend?: boolean
}

export const stableExtensionVersion = (version: string) =>
  /^v?\d+(?:\.\d+){1,3}(?:\+[a-z0-9.]+)?$/i.test(version)

export const compareExtensionVersions = (a: string, b: string) => {
  const left = a.replace(/^v/, '').split(/[.+]/).slice(0, 4).map(Number)
  const right = b.replace(/^v/, '').split(/[.+]/).slice(0, 4).map(Number)
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (right[i] || 0) - (left[i] || 0)
    if (difference) return difference
  }
  return b.localeCompare(a)
}
