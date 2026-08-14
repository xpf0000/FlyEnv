import { dirname, isAbsolute, join, relative } from 'node:path'
import { createHash } from 'node:crypto'
import type { AppHost } from '@shared/app'
import { existsSync, mkdirp, readFile, readdir, realpath, remove, stat, writeFile } from '../../Fn'

export type TomcatContextMapping = {
  id: string
  path: string
  docBase: string
}

export type TomcatSiteConfig = {
  contexts: TomcatContextMapping[]
  rewrite: {
    enabled: boolean
    content: string
  }
}

export type TomcatSiteHost = AppHost & {
  tomcat?: TomcatSiteConfig
}

export type TomcatValidationOptions = {
  requireExistingPaths?: boolean
  validateCertificateFiles?: boolean
}

export const tomcatSiteConfig = (host: TomcatSiteHost): TomcatSiteConfig => {
  return {
    contexts: host.tomcat?.contexts ?? [],
    rewrite: host.tomcat?.rewrite ?? { enabled: false, content: '' }
  }
}

/** Returns the auto-generated certificate owner to remove after a committed delete. */
export const tomcatAutoSSLDeletionId = (host: TomcatSiteHost, old?: TomcatSiteHost) => {
  const candidate = old?.autoSSL ? old : host.autoSSL ? host : undefined
  return candidate?.id
}

export const tomcatHostName = (host: TomcatSiteHost) => host.name.trim().toLowerCase()

const isTomcatHostName = (name: string) => {
  return (
    name.length <= 253 &&
    name.split('.').every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))
  )
}

export const validateContextPath = (path: string) => {
  if (path === '/') {
    return path
  }
  if (!path.startsWith('/')) {
    throw new Error('Context path must start with "/"')
  }
  if (path.includes('//')) {
    throw new Error('Context path cannot contain an empty segment')
  }
  if (/[\\?#\s]/.test(path)) {
    throw new Error('Context path contains an unsafe character')
  }
  const segments = path.slice(1).split('/')
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error('Context path contains an unsafe segment')
  }
  if (segments.some((segment) => !/^[A-Za-z0-9._~-]+$/.test(segment))) {
    throw new Error('Context path contains an unsafe character')
  }
  return path
}

export const contextDescriptorName = (path: string) => {
  const normalized = validateContextPath(path)
  return normalized === '/' ? 'ROOT.xml' : `${normalized.slice(1).replaceAll('/', '#')}.xml`
}

const isInside = (parent: string, child: string) => {
  const result = relative(parent, child)
  return result === '' || (!result.startsWith('..') && !isAbsolute(result))
}

const isNativeAppBaseContext = (
  appBase: string,
  contextPath: string,
  docBase: string,
  isDirectory: boolean
) => {
  if (!isInside(appBase, docBase)) {
    return false
  }
  const childName = relative(appBase, docBase)
  if (!childName || childName.includes('/') || childName.includes('\\')) {
    return false
  }
  const deploymentName = isDirectory ? childName : childName.replace(/\.war$/i, '')
  const naturalPath = deploymentName === 'ROOT' ? '/' : `/${deploymentName}`
  return contextPath === naturalPath
}

export const validateTomcatSite = async (
  host: TomcatSiteHost,
  existing: TomcatSiteHost[],
  options: TomcatValidationOptions = {}
) => {
  const requireExistingPaths = options.requireExistingPaths ?? true
  const validateCertificateFiles = options.validateCertificateFiles ?? true
  if (!host.root || !isAbsolute(host.root) || (requireExistingPaths && !existsSync(host.root))) {
    throw new Error('Tomcat appBase must be an existing absolute directory')
  }
  const rootStat = existsSync(host.root) ? await stat(host.root) : undefined
  if (rootStat && !rootStat.isDirectory()) {
    throw new Error('Tomcat appBase must be an existing absolute directory')
  }
  const appBase = rootStat ? await realpath(host.root) : host.root
  const seenPaths = new Set<string>()
  const seenIds = new Set<string>()

  for (const context of tomcatSiteConfig(host).contexts) {
    if (!/^[A-Za-z0-9]+$/.test(context.id)) {
      throw new Error('Tomcat Context id contains an unsafe character')
    }
    if (seenIds.has(context.id)) {
      throw new Error('Tomcat Context id is duplicated')
    }
    seenIds.add(context.id)

    const path = validateContextPath(context.path)
    if (seenPaths.has(path)) {
      throw new Error(`Tomcat site contains a duplicate Context path: ${path}`)
    }
    seenPaths.add(path)

    if (
      !context.docBase ||
      !isAbsolute(context.docBase) ||
      (requireExistingPaths && !existsSync(context.docBase))
    ) {
      throw new Error('Tomcat Context docBase must be an existing absolute path')
    }
    if (!existsSync(context.docBase)) continue
    const docStat = await stat(context.docBase)
    if (!docStat.isDirectory() && !context.docBase.toLowerCase().endsWith('.war')) {
      throw new Error('Tomcat Context docBase must be a directory or a .war file')
    }
    const docBase = await realpath(context.docBase)
    if (
      isInside(appBase, docBase) &&
      !isNativeAppBaseContext(appBase, path, docBase, docStat.isDirectory())
    ) {
      throw new Error('Tomcat Context docBase must be outside appBase')
    }
  }

  const ownName = tomcatHostName(host)
  if (!ownName) {
    throw new Error('Tomcat site requires a hostname')
  }
  if (!isTomcatHostName(ownName)) {
    throw new Error('Tomcat hostname is invalid')
  }
  const httpPort = host.port?.tomcat ?? 80
  const httpsPort = host.port?.tomcat_ssl ?? 443
  if (!Number.isInteger(httpPort) || httpPort < 1 || httpPort > 65535) {
    throw new Error('Tomcat HTTP port must be an integer from 1 to 65535')
  }
  if (!Number.isInteger(httpsPort) || httpsPort < 1 || httpsPort > 65535) {
    throw new Error('Tomcat HTTPS port must be an integer from 1 to 65535')
  }
  if (host.useSSL && httpPort === httpsPort) {
    throw new Error('Tomcat site cannot use the same HTTP and HTTPS port')
  }
  for (const candidate of existing) {
    if (candidate.type !== 'tomcat' || candidate.id === host.id) {
      continue
    }
    if (tomcatHostName(candidate) === ownName) {
      throw new Error(`Tomcat hostname already belongs to another Tomcat site: ${ownName}`)
    }
  }
  if (
    validateCertificateFiles &&
    host.useSSL &&
    !host.autoSSL &&
    (!existsSync(host.ssl?.cert) || !existsSync(host.ssl?.key))
  ) {
    throw new Error('Tomcat SSL certificate and private key files must exist')
  }
}

export const contextMarker = (siteId: number, contextId: string) => {
  return `<!-- FlyEnv Tomcat Context site=${siteId} context=${contextId} -->`
}

export const rewriteMarker = (siteId: number) => `# FlyEnv Tomcat Rewrite site=${siteId}`

const contextMarkerPattern = /^<!-- FlyEnv Tomcat Context site=\d+ context=[A-Za-z0-9]+ -->$/
const rewriteMarkerPattern = /^# FlyEnv Tomcat Rewrite site=\d+$/

const escapeXml = (value: string) => {
  return value.replace(/[&<>"']/g, (character) => {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;'
    }[character]!
  })
}

const firstNonEmptyLine = (content: string) => {
  return content.split(/\r?\n/).find((line) => line.trim()) ?? ''
}

const normalRewriteContent = (siteId: number, content: string) => {
  return `${rewriteMarker(siteId)}\n${content.replace(/\r\n/g, '\n').replace(/\n*$/, '\n')}`
}

export const reconcileTomcatSiteFiles = async (catalinaBase: string, hosts: TomcatSiteHost[]) => {
  const root = join(catalinaBase, 'conf', 'Catalina')
  await mkdirp(root)
  const desiredDescriptors = new Map<string, string>()
  const desiredRewrites = new Map<string, string>()

  for (const host of hosts) {
    await validateTomcatSite(host, hosts, {
      requireExistingPaths: false,
      validateCertificateFiles: false
    })
    const config = tomcatSiteConfig(host)
    const appBase = existsSync(host.root) ? await realpath(host.root) : host.root
    const hostDir = join(root, tomcatHostName(host))
    for (const context of config.contexts) {
      if (existsSync(context.docBase)) {
        const docBase = await realpath(context.docBase)
        const docStat = await stat(context.docBase)
        if (isNativeAppBaseContext(appBase, context.path, docBase, docStat.isDirectory())) {
          continue
        }
      }
      const descriptor = join(hostDir, contextDescriptorName(context.path))
      desiredDescriptors.set(
        descriptor,
        `${contextMarker(host.id, context.id)}\n<Context docBase="${escapeXml(context.docBase)}" />\n`
      )
    }
    if (config.rewrite.enabled) {
      desiredRewrites.set(
        join(hostDir, 'rewrite.config'),
        normalRewriteContent(host.id, config.rewrite.content)
      )
    }
  }

  const directories = await readdir(root)
  for (const name of directories) {
    const hostDir = join(root, name)
    if (!(await stat(hostDir)).isDirectory()) {
      continue
    }
    const rewriteFile = join(hostDir, 'rewrite.config')
    if (existsSync(rewriteFile) && desiredRewrites.has(rewriteFile)) {
      const marker = firstNonEmptyLine(await readFile(rewriteFile, 'utf-8'))
      if (!rewriteMarkerPattern.test(marker)) {
        throw new Error(`Tomcat site has a user-managed rewrite.config: ${rewriteFile}`)
      }
    }
    for (const descriptor of desiredDescriptors.keys()) {
      if (dirname(descriptor) !== hostDir || !existsSync(descriptor)) continue
      const marker = (await readFile(descriptor, 'utf-8')).split(/\r?\n/, 1)[0]
      if (!contextMarkerPattern.test(marker)) {
        throw new Error(`Tomcat site has a user-managed Context descriptor: ${descriptor}`)
      }
    }
  }

  for (const name of directories) {
    const hostDir = join(root, name)
    if (!(await stat(hostDir)).isDirectory()) {
      continue
    }
    for (const fileName of await readdir(hostDir)) {
      const file = join(hostDir, fileName)
      if (fileName.endsWith('.xml')) {
        const marker = (await readFile(file, 'utf-8')).split(/\r?\n/, 1)[0]
        if (contextMarkerPattern.test(marker) && !desiredDescriptors.has(file)) {
          await remove(file)
        }
      } else if (fileName === 'rewrite.config') {
        const marker = firstNonEmptyLine(await readFile(file, 'utf-8'))
        if (rewriteMarkerPattern.test(marker) && !desiredRewrites.has(file)) {
          await remove(file)
        }
      }
    }
  }

  for (const [file, content] of desiredDescriptors) {
    await mkdirp(dirname(file))
    await writeFile(file, content)
  }
  for (const [file, content] of desiredRewrites) {
    await mkdirp(dirname(file))
    await writeFile(file, content)
  }
}

export type TomcatSiteFilesSnapshot = {
  exists: boolean
  files: Map<string, string>
}

const snapshotFile = (root: string, file: string) => {
  return relative(root, file).split('\\').join('/')
}

const readTomcatSiteFiles = async (root: string, directory: string, files: Map<string, string>) => {
  for (const name of await readdir(directory)) {
    const file = join(directory, name)
    const fileStat = await stat(file)
    if (fileStat.isDirectory()) {
      await readTomcatSiteFiles(root, file, files)
    } else if (fileStat.isFile()) {
      files.set(snapshotFile(root, file), await readFile(file, 'utf-8'))
    }
  }
}

export const snapshotTomcatSiteFiles = async (
  catalinaBase: string
): Promise<TomcatSiteFilesSnapshot> => {
  const root = join(catalinaBase, 'conf', 'Catalina')
  if (!existsSync(root)) {
    return { exists: false, files: new Map() }
  }
  const files = new Map<string, string>()
  await readTomcatSiteFiles(root, root, files)
  return { exists: true, files }
}

export const restoreTomcatSiteFiles = async (
  catalinaBase: string,
  snapshot: TomcatSiteFilesSnapshot
) => {
  const root = join(catalinaBase, 'conf', 'Catalina')
  if (existsSync(root)) {
    await remove(root)
  }
  if (!snapshot.exists) {
    return
  }
  for (const [file, content] of snapshot.files) {
    const target = join(root, file)
    await mkdirp(dirname(target))
    await writeFile(target, content)
  }
}

export const tomcatSiteFilesFingerprint = (snapshot: TomcatSiteFilesSnapshot) => {
  const hash = createHash('sha256')
  hash.update(snapshot.exists ? '1' : '0')
  for (const [file, content] of [...snapshot.files].sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(file)
    hash.update('\0')
    hash.update(content)
    hash.update('\0')
  }
  return hash.digest('hex')
}
