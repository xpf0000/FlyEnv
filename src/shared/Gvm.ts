import { compareVersions } from './compare-versions'

export type GvmVersionItem = {
  name: string
  version: string
  installed: boolean
  isDefault: boolean
}

export type GvmInstalledVersion = {
  name: string
  isDefault: boolean
}

const GVM_VERSION_PATTERN =
  /^(?:go[A-Za-z0-9._-]*|release\.[A-Za-z0-9._-]+|weekly\.[A-Za-z0-9._-]+)$/

export function isGvmVersionIdentifier(value: string): boolean {
  return GVM_VERSION_PATTERN.test(value)
}

function parseGvmLine(line: string): GvmInstalledVersion | undefined {
  const trimmed = line.trim()
  const isDefault = trimmed.startsWith('=>')
  const normalized = trimmed.replace(/^=>\s*/, '').trim()
  const name = normalized.split(/\s+/)[0] ?? ''
  if (!isGvmVersionIdentifier(name)) {
    return undefined
  }
  return { name, isDefault }
}

export function parseGvmAvailableVersions(output: string): string[] {
  return Array.from(
    new Set(
      output
        .split(/\r?\n/)
        .map((line) => parseGvmLine(line)?.name)
        .filter((name): name is string => !!name)
    )
  )
}

export function parseGvmInstalledVersions(output: string): GvmInstalledVersion[] {
  const versions = new Map<string, GvmInstalledVersion>()
  output
    .split(/\r?\n/)
    .map(parseGvmLine)
    .filter((item): item is GvmInstalledVersion => !!item)
    .forEach((item) => versions.set(item.name, item))
  return Array.from(versions.values())
}

function displayVersion(name: string): string {
  return name.startsWith('go') ? name.slice(2) : name
}

export function mergeGvmVersionData(
  availableOutput: string,
  installedOutput: string
): GvmVersionItem[] {
  const installed = new Map(
    parseGvmInstalledVersions(installedOutput).map((item) => [item.name, item])
  )
  const names = [...parseGvmAvailableVersions(availableOutput)]
  installed.forEach((_item, name) => {
    if (!names.includes(name)) {
      names.push(name)
    }
  })
  return names.map((name) => ({
    name,
    version: displayVersion(name),
    installed: installed.has(name),
    isDefault: installed.get(name)?.isDefault ?? false
  }))
}

export function sortGvmVersionsNewestFirst<T extends GvmVersionItem>(versions: readonly T[]): T[] {
  return [...versions].sort(
    (a, b) =>
      compareVersions(b.version, a.version) ||
      b.name.localeCompare(a.name, undefined, { numeric: true })
  )
}

export function quotePosixShell(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}
