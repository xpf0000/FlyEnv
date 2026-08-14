import type { AppHost } from '@shared/app'
import { join } from '@/util/path-browserify'

export type TomcatContextForm = {
  id: string
  path: string
  docBase: string
}

export type AppBaseEntry = {
  name: string
  kind: 'directory' | 'war'
}

export type AppBaseContextCandidate = {
  path: string
  docBase: string
  kind: AppBaseEntry['kind']
}

export type TomcatSiteFormConfig = {
  contexts: TomcatContextForm[]
  rewrite: {
    enabled: boolean
    content: string
  }
}

export type TomcatSiteFormHost = AppHost & {
  tomcat: TomcatSiteFormConfig
}

export const createTomcatSiteConfig = (): TomcatSiteFormConfig => ({
  contexts: [],
  rewrite: { enabled: false, content: '' }
})

export const cloneTomcatSiteHost = (host: Partial<TomcatSiteFormHost>): TomcatSiteFormHost => {
  const item = JSON.parse(JSON.stringify(host ?? {}))
  return {
    id: item.id ?? Date.now(),
    type: 'tomcat',
    name: item.name ?? '',
    useSSL: item.useSSL ?? false,
    autoSSL: item.autoSSL ?? false,
    ssl: item.ssl ?? { cert: '', key: '' },
    port: item.port ?? { tomcat: 80, tomcat_ssl: 443 },
    url: item.url ?? '',
    root: item.root ?? '',
    mark: item.mark ?? '',
    envFile: item.envFile ?? '',
    tomcat: {
      contexts: item.tomcat?.contexts ?? [],
      rewrite: item.tomcat?.rewrite ?? { enabled: false, content: '' }
    }
  } as TomcatSiteFormHost
}

export const rendererContextPathError = (path: string) => {
  if (path === '/') return ''
  if (!path.startsWith('/') || path.includes('//') || /[\\?#\s]/.test(path)) {
    return 'invalid'
  }
  const segments = path.slice(1).split('/')
  if (
    segments.some(
      (segment) => segment === '.' || segment === '..' || !/^[A-Za-z0-9._~-]+$/.test(segment)
    )
  ) {
    return 'invalid'
  }
  return ''
}

const appBaseContextPath = (entry: AppBaseEntry) => {
  const name = entry.kind === 'war' ? entry.name.replace(/\.war$/i, '') : entry.name
  return name === 'ROOT' ? '/' : `/${name}`
}

export const appBaseContextCandidates = (
  appBase: string,
  entries: AppBaseEntry[]
): AppBaseContextCandidate[] => {
  const candidates = new Map<string, AppBaseContextCandidate>()
  for (const entry of entries) {
    if (!entry.name || entry.name.includes('/') || entry.name.includes('\\')) continue
    if (entry.kind === 'war' && !/\.war$/i.test(entry.name)) continue
    const path = appBaseContextPath(entry)
    if (rendererContextPathError(path)) continue
    const candidate = { path, docBase: join(appBase, entry.name), kind: entry.kind } as const
    const current = candidates.get(path)
    if (!current || (current.kind === 'war' && candidate.kind === 'directory')) {
      candidates.set(path, candidate)
    }
  }
  return [...candidates.values()].sort((left, right) => left.path.localeCompare(right.path))
}

export const mergeAppBaseContextCandidates = (
  contexts: TomcatContextForm[],
  candidates: AppBaseContextCandidate[],
  createId: (path: string) => string
): TomcatContextForm[] => {
  const paths = new Set(contexts.map((context) => context.path))
  return [
    ...contexts,
    ...candidates
      .filter((candidate) => !paths.has(candidate.path))
      .map(({ path, docBase }) => ({ id: createId(path), path, docBase }))
  ]
}

export const rendererTomcatNameError = (name: string) => {
  return name
    .split('.')
    .some((label) => !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))
}
