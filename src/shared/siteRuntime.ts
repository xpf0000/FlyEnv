import type { AppHost, SoftInstalled } from '@shared/app'

export const DEFAULT_WEB_SERVER_ORDER = [
  'caddy',
  'nginx',
  'apache',
  'frankenphp',
  'tomcat'
] as const

export const splitHostAliases = (alias?: string): string[] => {
  return `${alias ?? ''}`
    .split('\n')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

export const buildSiteHostnames = (site: Pick<AppHost, 'name' | 'alias'>): string[] => {
  return [site.name, ...splitHostAliases(site.alias)].filter(
    (item, index, list) => item.length > 0 && list.indexOf(item) === index
  )
}

export const resolveSitePhpVersion = (
  site: Pick<AppHost, 'phpVersion'>,
  phpVersions: SoftInstalled[]
): SoftInstalled | undefined => {
  if (!site?.phpVersion) {
    return undefined
  }
  return phpVersions.find((version) => version?.num === site.phpVersion)
}

export const isDirectProjectSite = (site: Pick<AppHost, 'type' | 'subType' | 'projectPort'>) => {
  const type = site?.type ?? ''
  return (
    ['node', 'go', 'python'].includes(type) ||
    (type === 'java' && site?.subType === 'springboot')
  )
}

export const isTomcatSite = (site: Pick<AppHost, 'type' | 'subType'>) => {
  const type = site?.type ?? ''
  return type === 'tomcat' || (type === 'java' && site?.subType === 'other')
}

export const hasProjectRuntime = (
  site: Pick<AppHost, 'projectName' | 'projectPort' | 'startCommand'>
) => {
  return !!(site?.projectName || site?.projectPort || site?.startCommand)
}

export const resolvePreferredWebServer = (
  site: Pick<AppHost, 'type' | 'subType' | 'projectPort'>,
  runningFlags: Set<string>,
  installedFlags: Set<string>
): string | null => {
  if (isTomcatSite(site)) {
    return 'tomcat'
  }
  if (isDirectProjectSite(site)) {
    return null
  }
  for (const flag of DEFAULT_WEB_SERVER_ORDER) {
    if (runningFlags.has(flag)) {
      return flag
    }
  }
  for (const flag of DEFAULT_WEB_SERVER_ORDER) {
    if (installedFlags.has(flag)) {
      return flag
    }
  }
  return DEFAULT_WEB_SERVER_ORDER[0]
}
