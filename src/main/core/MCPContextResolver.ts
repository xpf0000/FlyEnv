import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { parse as iniParse } from 'ini'
import type { AppHost, SoftInstalled } from '@shared/app'
import type {
  DatabaseConnectionInfo,
  GetManagedFileMapInput,
  GetManagedFileMapResponse,
  ManagedFileGroups,
  ManagedPathItem,
  MCPContextSourceHint,
  ResolveSiteRuntimeResponse,
  ResolveSiteUrlsResponse,
  ServiceExecInfo
} from '@shared/mcpContext'
import {
  buildSiteHostnames,
  hasProjectRuntime,
  isDirectProjectSite,
  isTomcatSite,
  resolvePreferredWebServer,
  resolveSitePhpVersion,
  splitHostAliases
} from '@shared/siteRuntime'
import type { ForkManager } from './ForkManager'
import type MCPConfigManager from './MCPConfigManager'
import ServiceProcessManager from './ServiceProcess'
import ServiceVersionManager from './ServiceVersionManager'

const DATABASE_FLAGS = new Set([
  'mysql',
  'mariadb',
  'postgresql',
  'clickhouse',
  'redis',
  'mongodb',
  'memcached'
])

const WEB_SERVER_FLAGS = ['caddy', 'nginx', 'apache', 'frankenphp', 'tomcat'] as const

type MySqlStyleConfig = {
  serverSection: string
  values: Record<string, string>
}

type PostgresqlConfig = {
  port?: string
  unixSocketDirectories?: string
}

type RedisConfig = {
  port?: string
  dir?: string
  unixsocket?: string
}

function callFork(
  forkManager: ForkManager,
  module: string,
  fn: string,
  ...args: any[]
): Promise<any> {
  return new Promise((resolve, reject) => {
    let settled = false
    forkManager
      .send(module, fn, ...args)
      .on(() => {})
      .then((res: any) => {
        if (settled) {
          return
        }
        settled = true
        if (res?.code === 0) {
          resolve(res?.data)
          return
        }
        reject(new Error(typeof res?.msg === 'string' ? res.msg : 'fork call failed'))
      })
      .catch((error: any) => {
        if (settled) {
          return
        }
        settled = true
        reject(error instanceof Error ? error : new Error(`${error}`))
      })
  })
}

function stripQuotes(value: any) {
  return `${value ?? ''}`.trim().replace(/^['"]|['"]$/g, '')
}

function uniquePathItems(items: ManagedPathItem[]) {
  const seen = new Set<string>()
  const output: ManagedPathItem[] = []
  for (const item of items) {
    if (!item?.path) {
      continue
    }
    const key = `${item.name}:${item.path}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    output.push(item)
  }
  return output
}

function makePathItem(name: string, path?: string): ManagedPathItem | undefined {
  if (!path) {
    return undefined
  }
  return {
    name,
    path,
    exists: existsSync(path)
  }
}

function emptyManagedFiles(): ManagedFileGroups {
  return {
    env: [],
    config: [],
    log: [],
    cert: [],
    runtime: [],
    data: []
  }
}

function readTextIfExists(path?: string) {
  if (!path || !existsSync(path)) {
    return ''
  }
  try {
    return readFileSync(path, 'utf-8')
  } catch {
    return ''
  }
}

function parsePort(value: any): number | undefined {
  const port = Number(`${value ?? ''}`.trim())
  if (!Number.isFinite(port) || port <= 0) {
    return undefined
  }
  return port
}

function firstExistingConfigFile(files: ManagedPathItem[]) {
  return files.find((file) => file.exists)?.path ?? files[0]?.path
}

function mysqlVersionPrefix(version?: string | null) {
  return version?.split('.')?.slice(0, 2)?.join('.') ?? ''
}

function postgresqlVersionMajor(version?: string | null) {
  return version?.split('.')?.shift() ?? ''
}

function redisVersionMajor(version?: string | null) {
  return version?.split('.')?.[0] ?? ''
}

function versionBinRunning(flag: string, version?: SoftInstalled) {
  const status = ServiceProcessManager.statusOf(flag)
  if (!version?.bin) {
    return status.running
  }
  return status.instances.some((instance) => instance.bin === version.bin)
}

function preferredPortForServer(site: AppHost, preferred: string | null, ssl = false) {
  if (!preferred) {
    return undefined
  }
  if (preferred === 'frankenphp') {
    return ssl
      ? (site.port?.frankenphp_ssl ?? site.port?.caddy_ssl)
      : (site.port?.frankenphp ?? site.port?.caddy)
  }
  if (preferred === 'tomcat') {
    return ssl ? site.port?.tomcat_ssl : site.port?.tomcat
  }
  if (preferred === 'apache') {
    return ssl ? site.port?.apache_ssl : site.port?.apache
  }
  if (preferred === 'nginx') {
    return ssl ? site.port?.nginx_ssl : site.port?.nginx
  }
  if (preferred === 'caddy') {
    return ssl ? site.port?.caddy_ssl : site.port?.caddy
  }
  return undefined
}

function withPort(urlBase: string, port?: number, defaultPort?: number) {
  if (!port || (defaultPort && port === defaultPort)) {
    return urlBase
  }
  return `${urlBase}:${port}`
}

export function parseMySqlStyleConfigText(text: string): MySqlStyleConfig {
  const config = iniParse(text)
  const serverSection = config?.mariadbd ? 'mariadbd' : config?.mysqld ? 'mysqld' : 'mysqld'
  const section = config?.[serverSection] ?? {}
  const values: Record<string, string> = {}
  for (const [key, value] of Object.entries(section)) {
    values[key] = stripQuotes(value)
  }
  return {
    serverSection,
    values
  }
}

export function parsePostgresqlConfigText(text: string): PostgresqlConfig {
  const output: PostgresqlConfig = {}
  for (const rawLine of text.split(/\r?\n/g)) {
    const line = rawLine.replace(/\s+#.*$/, '').trim()
    if (!line || line.startsWith('#') || !line.includes('=')) {
      continue
    }
    const [rawKey, ...rawValue] = line.split('=')
    const key = rawKey.trim()
    const value = stripQuotes(rawValue.join('=').trim())
    if (key === 'port') {
      output.port = value
    } else if (key === 'unix_socket_directories' || key === 'unix_socket_directory') {
      output.unixSocketDirectories = value
    }
  }
  return output
}

export function parseRedisConfigText(text: string): RedisConfig {
  const output: RedisConfig = {}
  for (const rawLine of text.split(/\r?\n/g)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }
    const [key, ...rest] = line.split(/\s+/g)
    const value = stripQuotes(rest.join(' ').trim())
    if (key === 'port') {
      output.port = value
    } else if (key === 'dir') {
      output.dir = value
    } else if (key === 'unixsocket') {
      output.unixsocket = value
    }
  }
  return output
}

export default class MCPContextResolver {
  private forkManager: ForkManager
  private mcpConfig: MCPConfigManager

  constructor(forkManager: ForkManager, mcpConfig: MCPConfigManager) {
    this.forkManager = forkManager
    this.mcpConfig = mcpConfig
  }

  private get maskSecrets() {
    return !!this.mcpConfig.getConfig('maskSecrets')
  }

  private maskValue(value: string | null | undefined) {
    if (value == null) {
      return value ?? null
    }
    return this.maskSecrets ? '******' : value
  }

  private async rawServiceVersions(flag: string) {
    return ServiceVersionManager.getVersions(flag)
  }

  private async resolveVersionObj(flag: string, version?: string) {
    const installed = await this.rawServiceVersions(flag)
    if (!installed.length) {
      throw new Error(`No installed version for ${flag}`)
    }
    if (version) {
      const exact = installed.find((item) => item?.version === version)
      if (!exact) {
        throw new Error(`Version ${version} of ${flag} not found`)
      }
      return exact
    }
    const status = ServiceProcessManager.statusOf(flag)
    if (status.instances.length > 0) {
      const running = installed.find((item) =>
        status.instances.some((instance) => instance.bin === item.bin)
      )
      if (running) {
        return running
      }
    }
    return installed.find((item) => item?.enable) ?? installed[0]
  }

  private async listConfigFiles(flag: string, version?: SoftInstalled) {
    const list = await callFork(this.forkManager, flag, 'listConfigFiles', version)
    return Array.isArray(list) ? list : []
  }

  private async listLogFiles(flag: string, version?: SoftInstalled) {
    const list = await callFork(this.forkManager, flag, 'listLogFiles', version)
    return Array.isArray(list) ? list : []
  }

  private async listSitesRaw(): Promise<AppHost[]> {
    const data = await callFork(this.forkManager, 'host', 'hostList')
    const list = data?.host ?? data ?? []
    return Array.isArray(list) ? list : []
  }

  private async findSiteByName(siteName: string) {
    const list = await this.listSitesRaw()
    const site = list.find((item) => item?.name === siteName)
    if (!site) {
      throw new Error(`Site ${siteName} not found`)
    }
    return site
  }

  private async webServerVersion(flag: string) {
    const versions = await this.rawServiceVersions(flag)
    const status = ServiceProcessManager.statusOf(flag)
    const running = versions.find((version) =>
      status.instances.some((instance) => instance.bin === version.bin)
    )
    return running ?? versions.find((version) => version.enable) ?? versions[0]
  }

  private resolveDatabasePassword(flag: string, version: SoftInstalled) {
    if (flag === 'mysql' || flag === 'mariadb') {
      return {
        value: version?.rootPassword ?? 'root',
        source: version?.rootPassword
          ? ('runtime' as MCPContextSourceHint)
          : ('default' as MCPContextSourceHint)
      }
    }
    return {
      value: null,
      source: 'default' as MCPContextSourceHint
    }
  }

  private getExecHints(flag: string) {
    if (flag === 'php') {
      return [
        'Use phpBin to execute CLI scripts directly.',
        'Use phpConfig to inspect the active php.ini.'
      ]
    }
    if (flag === 'mysql' || flag === 'mariadb') {
      return [
        'Use sibling client binaries such as mysql, mysqladmin, and dump tools from the same bin directory.'
      ]
    }
    if (flag === 'postgresql') {
      return ['Use sibling client binaries such as psql and pg_ctl from the same bin directory.']
    }
    if (flag === 'redis') {
      return ['Use redis-cli from the same bin directory when it is available.']
    }
    return []
  }

  private defaultDataDir(flag: string, version: SoftInstalled) {
    const versionText = version?.version ?? ''
    if (flag === 'mysql') {
      const prefix = mysqlVersionPrefix(versionText)
      return prefix ? join(global.Server.MysqlDir!, `data-${prefix}`) : undefined
    }
    if (flag === 'mariadb') {
      const prefix = mysqlVersionPrefix(versionText)
      return prefix ? join(global.Server.MariaDBDir!, `data-${prefix}`) : undefined
    }
    if (flag === 'postgresql') {
      const major = postgresqlVersionMajor(versionText)
      return major ? join(global.Server.PostgreSqlDir!, `postgresql${major}`) : undefined
    }
    if (flag === 'redis') {
      const major = redisVersionMajor(versionText)
      return major ? join(global.Server.RedisDir!, `db-${major}`) : undefined
    }
    if (flag === 'mongodb') {
      const prefix = mysqlVersionPrefix(versionText)
      return prefix ? join(global.Server.MongoDBDir!, `data-${prefix}`) : undefined
    }
    return undefined
  }

  private deriveSocket(flag: string, version: SoftInstalled, configText: string, port: number) {
    if (flag === 'mysql' || flag === 'mariadb') {
      if (version?.version) {
        return `/tmp/mysql.${version.version}.sock`
      }
      return '/tmp/mysql.sock'
    }
    if (flag === 'postgresql') {
      const parsed = parsePostgresqlConfigText(configText)
      if (parsed.unixSocketDirectories) {
        const dir = parsed.unixSocketDirectories
          .split(',')
          .map((item) => stripQuotes(item.trim()))[0]
        if (dir) {
          return join(dir, `.s.PGSQL.${port}`)
        }
      }
      return undefined
    }
    if (flag === 'redis') {
      return parseRedisConfigText(configText).unixsocket
    }
    return undefined
  }

  private buildSiteManagedFiles(site: AppHost): ManagedFileGroups {
    const files = emptyManagedFiles()
    const baseDir = global.Server.BaseDir!
    const siteId = `${site.id}`

    const push = (bucket: keyof ManagedFileGroups, item?: ManagedPathItem) => {
      if (!item) {
        return
      }
      files[bucket].push(item)
    }

    push('env', makePathItem('.env', site.envFile))
    push('config', makePathItem('nginx-vhost', join(baseDir, 'vhost', 'nginx', `${siteId}.conf`)))
    push('config', makePathItem('apache-vhost', join(baseDir, 'vhost', 'apache', `${siteId}.conf`)))
    push('config', makePathItem('caddy-vhost', join(baseDir, 'vhost', 'caddy', `${siteId}.conf`)))
    push(
      'config',
      makePathItem('frankenphp-vhost', join(baseDir, 'vhost', 'frankenphp', `${siteId}.conf`))
    )
    push(
      'config',
      makePathItem('nginx-rewrite', join(baseDir, 'vhost', 'rewrite', `${siteId}.conf`))
    )
    if (isTomcatSite(site)) {
      push(
        'config',
        makePathItem('tomcat-server.xml', join(baseDir, 'tomcat', siteId, 'conf', 'server.xml'))
      )
    }

    push('log', makePathItem('nginx-access', join(baseDir, 'vhost', 'logs', `${siteId}.log`)))
    push('log', makePathItem('nginx-error', join(baseDir, 'vhost', 'logs', `${siteId}.error.log`)))
    push(
      'log',
      makePathItem('apache-access', join(baseDir, 'vhost', 'logs', `${siteId}-access_log`))
    )
    push('log', makePathItem('apache-error', join(baseDir, 'vhost', 'logs', `${siteId}-error_log`)))
    push('log', makePathItem('caddy', join(baseDir, 'vhost', 'logs', `${siteId}.caddy.log`)))
    push(
      'log',
      makePathItem('frankenphp', join(baseDir, 'vhost', 'logs', `${siteId}.frankenphp.log`))
    )

    push('cert', makePathItem('ssl-cert', site?.ssl?.cert))
    push('cert', makePathItem('ssl-key', site?.ssl?.key))

    push('runtime', makePathItem('root', site.root))
    if (site.envFile) {
      push('runtime', makePathItem('project-root', dirname(site.envFile)))
    }

    files.env = uniquePathItems(files.env)
    files.config = uniquePathItems(files.config)
    files.log = uniquePathItems(files.log)
    files.cert = uniquePathItems(files.cert)
    files.runtime = uniquePathItems(files.runtime)
    files.data = uniquePathItems(files.data)
    return files
  }

  private async buildServiceManagedFiles(flag: string, version: SoftInstalled) {
    const files = emptyManagedFiles()
    files.config = uniquePathItems(await this.listConfigFiles(flag, version))
    files.log = uniquePathItems(await this.listLogFiles(flag, version))

    const configText = readTextIfExists(firstExistingConfigFile(files.config))
    const port =
      flag === 'mysql' || flag === 'mariadb'
        ? (parsePort(parseMySqlStyleConfigText(configText).values.port) ?? 3306)
        : flag === 'postgresql'
          ? (parsePort(parsePostgresqlConfigText(configText).port) ?? 5432)
          : flag === 'redis'
            ? (parsePort(parseRedisConfigText(configText).port) ?? 6379)
            : flag === 'mongodb'
              ? 27017
              : flag === 'memcached'
                ? 11211
                : undefined

    const push = (bucket: keyof ManagedFileGroups, item?: ManagedPathItem) => {
      if (!item) {
        return
      }
      files[bucket].push(item)
    }

    push('runtime', makePathItem('bin', version.bin))
    push('runtime', makePathItem('path', version.path))
    push('runtime', makePathItem('php-bin', version.phpBin))
    push('runtime', makePathItem('php-config', version.phpConfig))
    push('runtime', makePathItem('pid', join(global.Server.BaseDir!, 'pid', `${flag}.pid`)))

    if (port) {
      push('runtime', makePathItem('socket', this.deriveSocket(flag, version, configText, port)))
    }

    const defaultDataDir = this.defaultDataDir(flag, version)
    if (flag === 'mysql' || flag === 'mariadb') {
      const dataDir = parseMySqlStyleConfigText(configText).values.datadir || defaultDataDir
      push('data', makePathItem('data-dir', dataDir))
    } else if (flag === 'postgresql' || flag === 'mongodb') {
      push('data', makePathItem('data-dir', defaultDataDir))
    } else if (flag === 'redis') {
      const dataDir = parseRedisConfigText(configText).dir || defaultDataDir
      push('data', makePathItem('data-dir', dataDir))
    }

    files.runtime = uniquePathItems(files.runtime)
    files.data = uniquePathItems(files.data)
    return files
  }

  async getServiceExecInfo(flag: string, version?: string): Promise<ServiceExecInfo> {
    const versionObj = await this.resolveVersionObj(flag, version)
    const configFiles = await this.listConfigFiles(flag, versionObj)
    const logFiles = await this.listLogFiles(flag, versionObj)
    const password = this.resolveDatabasePassword(flag, versionObj)

    return {
      flag,
      version: versionObj?.version ?? null,
      running: versionBinRunning(flag, versionObj),
      bin: versionObj?.bin,
      path: versionObj?.path,
      phpBin: versionObj?.phpBin,
      phpConfig: versionObj?.phpConfig,
      rootPassword: DATABASE_FLAGS.has(flag) ? this.maskValue(password.value) : null,
      configFiles,
      logFiles,
      execHints: this.getExecHints(flag),
      warnings: []
    }
  }

  async resolveSiteUrls(siteName: string): Promise<ResolveSiteUrlsResponse> {
    const site = await this.findSiteByName(siteName)
    const aliases = splitHostAliases(site.alias)
    const hostnames = buildSiteHostnames(site)
    const warnings: string[] = []
    let urls: string[] = []
    let primaryUrl = site.url || `http://${site.name}`

    if (isDirectProjectSite(site) && site.projectPort) {
      primaryUrl = `http://127.0.0.1:${site.projectPort}`
      urls = [primaryUrl]
      if (site.useSSL) {
        warnings.push('Direct project runtimes do not infer HTTPS URLs from projectPort.')
      }
    } else if (isTomcatSite(site)) {
      const httpPort = site.port?.tomcat ?? 80
      const httpsPort = site.port?.tomcat_ssl ?? 443
      for (const hostname of hostnames) {
        urls.push(withPort(`http://${hostname}`, httpPort, 80))
        if (site.useSSL) {
          urls.push(withPort(`https://${hostname}`, httpsPort, 443))
        }
      }
      primaryUrl = site.useSSL
        ? withPort(`https://${site.name}`, httpsPort, 443)
        : withPort(`http://${site.name}`, httpPort, 80)
    } else {
      const webVersions = await ServiceVersionManager.getVersionsBatch([...WEB_SERVER_FLAGS])
      const installedFlags = new Set(
        Object.entries(webVersions)
          .filter(([, versions]) => Array.isArray(versions) && versions.length > 0)
          .map(([flag]) => flag)
      )
      const runningFlags = new Set(
        WEB_SERVER_FLAGS.filter((flag) => ServiceProcessManager.statusOf(flag).running)
      )
      const preferred = resolvePreferredWebServer(site, runningFlags, installedFlags)
      const httpPort = preferredPortForServer(site, preferred, false) ?? 80
      const httpsPort = preferredPortForServer(site, preferred, true) ?? 443
      for (const hostname of hostnames) {
        urls.push(withPort(`http://${hostname}`, httpPort, 80))
        if (site.useSSL) {
          urls.push(withPort(`https://${hostname}`, httpsPort, 443))
        }
      }
      primaryUrl = site.useSSL
        ? withPort(`https://${site.name}`, httpsPort, 443)
        : site.url || withPort(`http://${site.name}`, httpPort, 80)
    }

    return {
      primaryUrl,
      urls: [...new Set(urls)],
      ssl: {
        enabled: !!site.useSSL,
        autoSSL: !!site.autoSSL,
        cert: site?.ssl?.cert || undefined,
        keyMasked: site?.ssl?.key ? '******' : undefined
      },
      aliases,
      ports: {
        nginx: site?.port?.nginx,
        nginx_ssl: site?.port?.nginx_ssl,
        apache: site?.port?.apache,
        apache_ssl: site?.port?.apache_ssl,
        caddy: site?.port?.caddy,
        caddy_ssl: site?.port?.caddy_ssl,
        frankenphp: site?.port?.frankenphp,
        frankenphp_ssl: site?.port?.frankenphp_ssl,
        tomcat: site?.port?.tomcat,
        tomcat_ssl: site?.port?.tomcat_ssl
      },
      reverseProxy: site?.reverseProxy ?? [],
      warnings
    }
  }

  async resolveSiteRuntime(siteName: string): Promise<ResolveSiteRuntimeResponse> {
    const site = await this.findSiteByName(siteName)
    const warnings: string[] = []
    const phpVersions = await this.rawServiceVersions('php')
    const resolvedPhp = resolveSitePhpVersion(site, phpVersions)
    if (site?.phpVersion && !resolvedPhp) {
      warnings.push(`Configured PHP ${site.phpVersion} is not installed.`)
    }

    const webVersions = await ServiceVersionManager.getVersionsBatch([...WEB_SERVER_FLAGS])
    const installedFlags = new Set(
      Object.entries(webVersions)
        .filter(([, versions]) => Array.isArray(versions) && versions.length > 0)
        .map(([flag]) => flag)
    )
    const runningFlags = new Set(
      WEB_SERVER_FLAGS.filter((flag) => ServiceProcessManager.statusOf(flag).running)
    )
    const preferred = resolvePreferredWebServer(site, runningFlags, installedFlags)
    const preferredVersion = preferred
      ? await this.webServerVersion(preferred).catch(() => undefined)
      : undefined
    const managed = this.buildSiteManagedFiles(site)

    const response: ResolveSiteRuntimeResponse = {
      site: {
        name: site.name,
        root: site.root,
        url: site.url,
        alias: site.alias,
        envFile: site.envFile,
        projectName: site.projectName,
        projectPort: site.projectPort,
        startCommand: site.startCommand,
        useSSL: !!site.useSSL
      },
      php: {
        configuredVersion: site?.phpVersion ?? null,
        resolvedVersion: resolvedPhp?.version ?? null,
        bin: resolvedPhp?.bin,
        phpBin: resolvedPhp?.phpBin,
        phpConfig: resolvedPhp?.phpConfig,
        running: versionBinRunning('php', resolvedPhp)
      },
      webServer: {
        preferred,
        running: preferred ? ServiceProcessManager.statusOf(preferred).running : false,
        version: preferredVersion?.version ?? null,
        port: preferred ? preferredPortForServer(site, preferred, false) : undefined,
        sslPort: preferred ? preferredPortForServer(site, preferred, true) : undefined
      },
      managedFiles: {
        env: managed.env,
        config: managed.config,
        log: managed.log,
        cert: managed.cert
      },
      warnings
    }

    if (hasProjectRuntime(site)) {
      response.projectRuntime = {
        projectName: site.projectName,
        projectPort: site.projectPort,
        startCommand: site.startCommand
      }
    }

    return response
  }

  async getManagedFileMap(input: GetManagedFileMapInput): Promise<GetManagedFileMapResponse> {
    if (input.scope === 'site') {
      if (!input.name) {
        throw new Error('name is required when scope=site')
      }
      const site = await this.findSiteByName(input.name)
      return {
        scope: 'site',
        identity: {
          name: site.name,
          id: site.id
        },
        files: this.buildSiteManagedFiles(site),
        warnings: []
      }
    }

    if (input.scope === 'service') {
      if (!input.flag) {
        throw new Error('flag is required when scope=service')
      }
      const versionObj = await this.resolveVersionObj(input.flag, input.version)
      return {
        scope: 'service',
        identity: {
          flag: input.flag,
          version: versionObj?.version ?? null
        },
        files: await this.buildServiceManagedFiles(input.flag, versionObj),
        warnings: []
      }
    }

    throw new Error(`Unsupported scope: ${input.scope}`)
  }

  async getDatabaseConnectionInfo(flag: string, version?: string): Promise<DatabaseConnectionInfo> {
    if (!DATABASE_FLAGS.has(flag)) {
      throw new Error(`Unsupported database flag: ${flag}`)
    }

    const versionObj = await this.resolveVersionObj(flag, version)
    const configFiles = await this.listConfigFiles(flag, versionObj)
    const logFiles = await this.listLogFiles(flag, versionObj)
    const configPath = firstExistingConfigFile(configFiles)
    const configText = readTextIfExists(configPath)
    const warnings: string[] = []
    const sourceHints: Record<string, MCPContextSourceHint> = {
      host: 'default'
    }

    let port = 0
    let socket: string | undefined
    let user: string | null = null
    let password: string | null = null
    const notes: string[] = []

    if (flag === 'mysql' || flag === 'mariadb') {
      const parsed = parseMySqlStyleConfigText(configText)
      port = parsePort(parsed.values.port) ?? 3306
      sourceHints.port = parsed.values.port ? 'config' : 'default'
      if (!parsed.values.port) {
        warnings.push('Configured port not found, fallback to default 3306.')
      }
      socket = this.deriveSocket(flag, versionObj, configText, port)
      sourceHints.socket = socket ? 'derived' : 'default'
      user = 'root'
      sourceHints.user = 'default'
      const resolvedPassword = this.resolveDatabasePassword(flag, versionObj)
      password = this.maskValue(resolvedPassword.value)
      sourceHints.password = resolvedPassword.source
      notes.push('Use socket on macOS/Linux when available.')
    } else if (flag === 'postgresql') {
      const parsed = parsePostgresqlConfigText(configText)
      port = parsePort(parsed.port) ?? 5432
      sourceHints.port = parsed.port ? 'config' : 'default'
      if (!parsed.port) {
        warnings.push('Configured port not found, fallback to default 5432.')
      }
      socket = this.deriveSocket(flag, versionObj, configText, port)
      sourceHints.socket = socket ? 'config' : 'default'
      user = 'postgres'
      sourceHints.user = 'default'
    } else if (flag === 'redis') {
      const parsed = parseRedisConfigText(configText)
      port = parsePort(parsed.port) ?? 6379
      sourceHints.port = parsed.port ? 'config' : 'default'
      if (!parsed.port) {
        warnings.push('Configured port not found, fallback to default 6379.')
      }
      socket = parsed.unixsocket
      sourceHints.socket = socket ? 'config' : 'default'
    } else if (flag === 'mongodb') {
      port = 27017
      sourceHints.port = 'default'
    } else if (flag === 'memcached') {
      port = 11211
      sourceHints.port = 'default'
    }

    return {
      flag,
      version: versionObj?.version ?? null,
      running: versionBinRunning(flag, versionObj),
      host: '127.0.0.1',
      port,
      socket,
      user,
      password,
      bin: versionObj?.bin,
      path: versionObj?.path,
      configFiles,
      logFiles,
      notes,
      warnings,
      sourceHints
    }
  }
}
