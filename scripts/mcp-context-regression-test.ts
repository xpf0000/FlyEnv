import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { MCPTools } from '../src/main/core/MCPTools'
import ServiceProcessManager from '../src/main/core/ServiceProcess'
import ServiceVersionManager from '../src/main/core/ServiceVersionManager'

type ForkCall = {
  module: string
  fn: string
  args: any[]
}

function makeVersion(flag: string, version: string, extra: Record<string, any> = {}) {
  return {
    typeFlag: flag as any,
    version,
    bin: `/opt/${flag}/${version}/bin/${flag}`,
    path: `/opt/${flag}/${version}`,
    num: Number(version.split('.').slice(0, 2).join('')),
    enable: true,
    run: false,
    running: false,
    ...extra
  }
}

function createSendResult(result: { code: number; data?: any; msg?: string }) {
  const promise = Promise.resolve(result)
  return {
    on() {
      return this
    },
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise)
  }
}

class FakeForkManager {
  calls: ForkCall[] = []
  installedByFlag: Record<string, any[]> = {}
  hostList: any[] = []
  configFilesByModule: Record<string, any[]> = {}
  logFilesByModule: Record<string, any[]> = {}

  send(module: string, fn: string, ...args: any[]) {
    this.calls.push({ module, fn, args })

    if (module === 'version' && fn === 'allInstalledVersions') {
      const flags = Array.isArray(args[0]) ? args[0] : []
      const data: Record<string, any[]> = {}
      for (const flag of flags) {
        data[flag] = this.installedByFlag[flag] ?? []
      }
      return createSendResult({ code: 0, data })
    }

    if (module === 'host' && fn === 'hostList') {
      return createSendResult({ code: 0, data: { host: this.hostList } })
    }

    if (fn === 'listConfigFiles') {
      return createSendResult({ code: 0, data: this.configFilesByModule[module] ?? [] })
    }

    if (fn === 'listLogFiles') {
      return createSendResult({ code: 0, data: this.logFilesByModule[module] ?? [] })
    }

    return createSendResult({ code: 0, data: {} })
  }
}

class FakeMcpConfigManager {
  store: Record<string, any>

  constructor(store?: Record<string, any>) {
    this.store = {
      enabledTools: [],
      approval: {},
      allowRemote: false,
      host: '127.0.0.1',
      port: 0,
      token: 'test-token',
      transport: { http: true, stdio: false },
      maskSecrets: false,
      ...(store ?? {})
    }
  }

  getConfig(key?: string, defaultValue?: any) {
    if (typeof key === 'undefined' && typeof defaultValue === 'undefined') {
      return this.store
    }
    if (typeof key === 'undefined') {
      return defaultValue
    }
    return this.store[key] ?? defaultValue
  }
}

function resetManagers() {
  ;(ServiceVersionManager as any).cache = {}
  ;(ServiceVersionManager as any).notifyCallbacks = []
  ;(ServiceProcessManager as any).servicePID = {}
}

function createTempServerLayout() {
  const root = mkdtempSync(join(tmpdir(), 'flyenv-mcp-context-'))
  const baseDir = join(root, 'base')
  const mysqlDir = join(root, 'mysql')
  const redisDir = join(root, 'redis')
  const postgresqlDir = join(root, 'postgresql')
  const mongoDir = join(root, 'mongodb')
  const memcachedDir = join(root, 'memcached')
  const projectDir = join(root, 'project', 'demo')
  const certDir = join(root, 'certs')

  for (const dir of [
    baseDir,
    mysqlDir,
    redisDir,
    postgresqlDir,
    mongoDir,
    memcachedDir,
    join(baseDir, 'vhost', 'nginx'),
    join(baseDir, 'vhost', 'apache'),
    join(baseDir, 'vhost', 'caddy'),
    join(baseDir, 'vhost', 'frankenphp'),
    join(baseDir, 'vhost', 'rewrite'),
    join(baseDir, 'vhost', 'logs'),
    join(baseDir, 'pid'),
    join(projectDir, 'public'),
    certDir
  ]) {
    mkdirSync(dir, { recursive: true })
  }

  writeFileSync(join(projectDir, '.env'), 'APP_ENV=local\n', 'utf-8')
  writeFileSync(join(certDir, 'demo.crt'), 'crt', 'utf-8')
  writeFileSync(join(certDir, 'demo.key'), 'key', 'utf-8')
  writeFileSync(
    join(mysqlDir, 'my-8.4.cnf'),
    '[mysqld]\nport=3307\ndatadir=/data/mysql84\n',
    'utf-8'
  )
  writeFileSync(join(mysqlDir, 'error.log'), 'mysql error\n', 'utf-8')
  writeFileSync(join(mysqlDir, 'slow.log'), 'mysql slow\n', 'utf-8')
  writeFileSync(join(baseDir, 'vhost', 'nginx', '1001.conf'), 'server {}\n', 'utf-8')
  writeFileSync(join(baseDir, 'vhost', 'rewrite', '1001.conf'), 'try_files\n', 'utf-8')
  writeFileSync(join(baseDir, 'vhost', 'logs', '1001.log'), 'access\n', 'utf-8')
  writeFileSync(join(baseDir, 'vhost', 'logs', '1001.error.log'), 'error\n', 'utf-8')

  ;(global as any).Server = {
    BaseDir: baseDir,
    MysqlDir: mysqlDir,
    MariaDBDir: join(root, 'mariadb'),
    PostgreSqlDir: postgresqlDir,
    RedisDir: redisDir,
    MongoDBDir: mongoDir,
    MemcachedDir: memcachedDir
  }

  return {
    root,
    baseDir,
    mysqlDir,
    projectDir,
    certDir
  }
}

async function testContextTools() {
  resetManagers()
  const temp = createTempServerLayout()
  const forkManager = new FakeForkManager()

  const php84 = makeVersion('php', '8.4.0', {
    bin: '/opt/php/8.4.0/sbin/php-fpm',
    path: '/opt/php/8.4.0',
    phpBin: '/opt/php/8.4.0/bin/php',
    phpConfig: '/opt/php/8.4.0/bin/php-config'
  })
  const nginx = makeVersion('nginx', '1.27.0', {
    bin: '/opt/nginx/1.27.0/sbin/nginx'
  })
  const mysql84 = makeVersion('mysql', '8.4.0', {
    bin: '/opt/mysql/8.4.0/bin/mysqld',
    path: '/opt/mysql/8.4.0',
    rootPassword: 'root001'
  })

  ServiceVersionManager.updateCache({
    php: [php84],
    nginx: [nginx],
    mysql: [mysql84]
  })
  ServiceProcessManager.addPid('php', '1101', php84)
  ServiceProcessManager.addPid('nginx', '2202', nginx)
  ServiceProcessManager.addPid('mysql', '3303', mysql84)

  forkManager.hostList = [
    {
      id: 1001,
      name: 'demo.test',
      alias: 'www.demo.test\napi.demo.test',
      type: 'php',
      phpVersion: 84,
      useSSL: true,
      autoSSL: true,
      url: 'http://demo.test',
      root: join(temp.projectDir, 'public'),
      projectName: 'demo',
      projectPort: 5173,
      startCommand: 'yarn dev',
      envFile: join(temp.projectDir, '.env'),
      reverseProxy: [{ path: '/api', url: 'http://127.0.0.1:3000' }],
      ssl: {
        cert: join(temp.certDir, 'demo.crt'),
        key: join(temp.certDir, 'demo.key')
      },
      port: {
        nginx: 80,
        nginx_ssl: 443,
        apache: 8080,
        apache_ssl: 8443,
        caddy: 80,
        caddy_ssl: 443,
        frankenphp: 81,
        frankenphp_ssl: 444,
        tomcat: 80,
        tomcat_ssl: 443
      },
      nginx: {
        rewrite: ''
      }
    }
  ]

  forkManager.configFilesByModule.php = [
    { name: 'php.ini', path: '/opt/php/8.4.0/php.ini', exists: true }
  ]
  forkManager.logFilesByModule.php = [
    { name: 'php-fpm.error.log', path: '/opt/php/8.4.0/var/log/php-fpm.log', exists: true }
  ]
  forkManager.configFilesByModule.mysql = [
    { name: 'main', path: join(temp.mysqlDir, 'my-8.4.cnf'), exists: true }
  ]
  forkManager.logFilesByModule.mysql = [
    { name: 'error', path: join(temp.mysqlDir, 'error.log'), exists: true }
  ]

  const tools = new MCPTools(forkManager as any, new FakeMcpConfigManager() as any)

  const urls = await tools.resolveSiteUrls('demo.test')
  assert.equal(urls.primaryUrl, 'https://demo.test')
  assert.deepEqual(urls.aliases, ['www.demo.test', 'api.demo.test'])
  assert.equal(urls.ssl.keyMasked, '******')
  assert.ok(urls.urls.includes('https://www.demo.test'))

  const runtime = await tools.resolveSiteRuntime('demo.test')
  assert.equal(runtime.php.resolvedVersion, '8.4.0')
  assert.equal(runtime.php.running, true)
  assert.equal(runtime.webServer.preferred, 'nginx')
  assert.equal(runtime.projectRuntime?.startCommand, 'yarn dev')
  assert.ok(runtime.managedFiles.log.some((item: any) => item.name === 'nginx-access'))

  const serviceExec = await tools.getServiceExecInfo('php', '8.4.0')
  assert.equal(serviceExec.phpBin, '/opt/php/8.4.0/bin/php')
  assert.equal(serviceExec.running, true)
  assert.ok(serviceExec.configFiles.some((item: any) => item.path === '/opt/php/8.4.0/php.ini'))

  const db = await tools.getDatabaseConnectionInfo('mysql', '8.4.0')
  assert.equal(db.port, 3307)
  assert.equal(db.password, 'root001')
  assert.equal(db.socket, '/tmp/mysql.8.4.0.sock')
  assert.equal(db.sourceHints.port, 'config')
  assert.equal(db.sourceHints.socket, 'derived')

  const siteFiles = await tools.getManagedFileMap({ scope: 'site', name: 'demo.test' })
  assert.ok(siteFiles.files.env.some((item: any) => item.path.endsWith('.env') && item.exists))
  assert.ok(siteFiles.files.config.some((item: any) => item.name === 'nginx-vhost' && item.exists))
  assert.ok(siteFiles.files.cert.some((item: any) => item.name === 'ssl-key' && item.exists))

  const serviceFiles = await tools.getManagedFileMap({
    scope: 'service',
    flag: 'mysql',
    version: '8.4.0'
  })
  assert.ok(
    serviceFiles.files.runtime.some(
      (item: any) => item.name === 'socket' && item.path === '/tmp/mysql.8.4.0.sock'
    )
  )
  assert.ok(serviceFiles.files.data.some((item: any) => item.path.includes('/data/mysql84')))

  const maskedTools = new MCPTools(
    forkManager as any,
    new FakeMcpConfigManager({ maskSecrets: true }) as any
  )
  const maskedDb = await maskedTools.getDatabaseConnectionInfo('mysql', '8.4.0')
  assert.equal(maskedDb.password, '******')
  const maskedExec = await maskedTools.getServiceExecInfo('mysql', '8.4.0')
  assert.equal(maskedExec.rootPassword, '******')

  rmSync(temp.root, { recursive: true, force: true })
}

async function main() {
  await testContextTools()
  console.log('mcp context regression tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
