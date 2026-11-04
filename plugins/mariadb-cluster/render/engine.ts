import type { EngineRef } from '../shared'
export function installationSource(item: {
  path: string
  bin: string
  source?: string
  flag?: string
}): EngineRef['source'] {
  const path = (item.path + ' ' + item.bin).replace(/\\/g, '/')
  if (item.flag === 'macports' || /\/opt\/local\/lib\/mariadb[^/]*\//i.test(path)) return 'Macports'
  if (/\/Cellar\/[^/]+\//.test(path) || /\/(?:homebrew\/)?opt\/mariadb(?:@[^/]+)?\//.test(path))
    return 'Homebrew'
  return item.source === 'Homebrew' || item.source === 'Macports' ? item.source : 'Static'
}
export function engineFromInstalled(item: {
  version: string
  path: string
  bin: string
  source?: string
  flag?: string
}): EngineRef {
  const bin = item.bin.replace(/mariadbd-safe$/, 'mariadbd')
  if (!/(?:^|[/\\])(?:mariadbd|mysqld)(?:\.exe)?$/i.test(bin))
    throw new Error('The selected installation has no MariaDB server executable')
  return {
    version: item.version,
    path: item.path,
    bin,
    installationBin: item.bin,
    source: installationSource(item)
  }
}
