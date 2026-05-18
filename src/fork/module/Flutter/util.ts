import { relative } from 'path'
import { isMacOS, isWindows } from '@shared/utils'

export function _archiveExt(url: string): string {
  const lower = (url || '').toLowerCase()
  if (lower.endsWith('.tar.xz')) {
    return '.tar.xz'
  }
  if (lower.endsWith('.tar.gz')) {
    return '.tar.gz'
  }
  if (lower.endsWith('.zip')) {
    return '.zip'
  }
  if (isWindows() || isMacOS()) {
    return '.zip'
  }
  return '.tar.xz'
}

export function _detectChannelByUrl(url: string): 'stable' | 'beta' | 'dev' {
  const lower = `${url ?? ''}`.toLowerCase()
  if (lower.includes('/beta/')) {
    return 'beta'
  }
  if (lower.includes('/dev/')) {
    return 'dev'
  }
  return 'stable'
}

export function _sanitizeProjectName(name: string): string {
  return `${name ?? ''}`
    .trim()
    .replace(/[^a-z0-9_]/gi, '_')
    .toLowerCase()
}

export function _bundleIdFrom(orgName: string, projectName: string): string {
  const org = `${orgName ?? ''}`
    .trim()
    .replace(/[^a-z0-9.]/gi, '')
    .toLowerCase()
  const name = _sanitizeProjectName(projectName)
  const tail = name || 'app'
  if (!org) {
    return `com.example.${tail}`
  }
  const fixedOrg = org.endsWith('.') ? org.slice(0, -1) : org
  return `${fixedOrg}.${tail}`
}

export function _normalizeBundleId(raw: string, orgName: string, projectName: string): string {
  const input = `${raw ?? ''}`.trim().toLowerCase()
  if (!input) {
    return _bundleIdFrom(orgName, projectName)
  }
  const cleaned = input
    .replace(/[^a-z0-9._]/g, '_')
    .replace(/\.+/g, '.')
    .replace(/^\./, '')
    .replace(/\.$/, '')
  if (!cleaned.includes('.')) {
    return _bundleIdFrom(orgName, cleaned)
  }
  return cleaned
}

export function _toProjectRelative(projectDir: string, filePath: string): string {
  const p = `${filePath ?? ''}`.trim()
  if (!p) {
    return ''
  }
  if (!projectDir) {
    return p.replace(/\\/g, '/')
  }
  const rel = relative(projectDir, p).replace(/\\/g, '/')
  if (!rel || rel === '.') {
    return p.replace(/\\/g, '/')
  }
  return rel
}
