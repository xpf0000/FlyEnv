import type { ExtensionPackage, PhpExtensionProfile } from '@fork/module/Php.win/WindowsExtensions'

export type ExtensionRow = {
  key: string
  name: string
  description: string
  packageName?: string
  configuredName?: string
  status: 'loaded' | 'unloaded' | 'available'
  source?: 'pecl' | 'pie'
}

export function extensionRows(
  profile: PhpExtensionProfile | undefined,
  packages: ExtensionPackage[],
  query = ''
): ExtensionRow[] {
  const configured = new Map(profile?.configured?.map((item) => [item.name, item]))
  const loaded = new Set(profile?.loaded.map((name) => name.toLowerCase().replace(/^zend /, '')))
  const represented = new Set<string>()
  const rows: ExtensionRow[] = packages.map((pkg) => {
    const source = pkg.source ?? (pkg.name.startsWith('pecl:') ? 'pecl' : 'pie')
    const name = (
      pkg.extension ??
      pkg.name
        .replace(/^pecl:/, '')
        .split('/')
        .at(-1)!
        .replace(/^ext-/, '')
    ).toLowerCase()
    const local = configured.get(name)
    represented.add(name)
    return {
      key: pkg.name,
      name,
      description: pkg.description?.trim() ?? '',
      packageName: pkg.name,
      source,
      configuredName: local?.name,
      status: local?.loaded || loaded.has(name) ? 'loaded' : local ? 'unloaded' : 'available'
    }
  })
  const keyword = query.trim().toLowerCase()
  for (const item of configured.values()) {
    if (represented.has(item.name) || !item.name.toLowerCase().includes(keyword)) continue
    rows.push({
      key: `configured:${item.name}`,
      name: item.name,
      description: '',
      configuredName: item.name,
      status: item.loaded || loaded.has(item.name) ? 'loaded' : 'unloaded'
    })
  }
  const rank = { unloaded: 0, loaded: 1, available: 2 }
  return rows.sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name))
}
