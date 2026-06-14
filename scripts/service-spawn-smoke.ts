/**
 * Standalone smoke test for the serviceStartSpawn migration.
 *
 * Verifies, against REAL local binaries, that a module:
 *   1. starts (foreground spawn, no error)
 *   2. the process is actually alive after start
 *   3. NO `start-*.sh` script was landed to disk in the module baseDir
 *   4. stops cleanly (process gone afterwards)
 *
 * Usage: MODULE=<module> npx tsx scripts/service-spawn-smoke.ts
 *   e.g. MODULE=qdrant npx tsx scripts/service-spawn-smoke.ts
 *
 * It sets up global.Server manually (mirroring src/main/utils/ServerPath.ts)
 * WITHOUT importing electron, so it runs under plain tsx.
 */
import { join, dirname } from 'node:path'
import { existsSync, readdirSync, mkdirSync } from 'node:fs'
import { homedir, arch as osArch } from 'node:os'

const runpath = '/Users/x/Library/PhpWebStudy'
const repo = '/Users/x/Desktop/WorkSpace/GitHub/FlyEnv'
// Use the BUILT static dir: it has platform-specific tmpl/sh files flattened into
// tmpl/ and sh/ (production layout), matching what global.Server.Static points to at
// runtime. The source static/ keeps them under tmpl/macOS, tmpl/Linux, etc.
const staticDir = join(repo, 'dist/electron/static')

// ---- mirror SetupGlobalPaths (ServerPath.ts:46-67) without electron ----
const arch = osArch()
;(global as any).Server = {
  UserHome: homedir(),
  isArmArch: arch === 'arm64',
  BaseDir: join(runpath, 'server'),
  AppDir: join(runpath, 'app'),
  NginxDir: join(runpath, 'server/nginx'),
  PhpDir: join(runpath, 'server/php'),
  MysqlDir: join(runpath, 'server/mysql'),
  MariaDBDir: join(runpath, 'server/mariadb'),
  ApacheDir: join(runpath, 'server/apache'),
  MemcachedDir: join(runpath, 'server/memcached'),
  RedisDir: join(runpath, 'server/redis'),
  MongoDBDir: join(runpath, 'server/mongodb'),
  FTPDir: join(runpath, 'server/ftp'),
  PostgreSqlDir: join(runpath, 'server/postgresql'),
  Cache: join(runpath, 'server/cache'),
  Static: staticDir,
  Arch: arch === 'x64' ? 'x86_64' : 'arm64',
  Local: 'en_US.UTF-8',
  Lang: 'en',
  isMacOS: process.platform === 'darwin',
  isLinux: process.platform === 'linux',
  isWindows: process.platform === 'win32'
}
for (const d of ['server', 'app', 'server/cache']) {
  mkdirSync(join(runpath, d), { recursive: true })
}

// i18n must be initialized before any module calls I18nT()
const { AppI18n } = await import(`${repo}/src/lang/index.ts`)
AppI18n('en')

// ---- registry: module key -> import dir, bin path, version, baseDir to scan ----
type Reg = {
  dir: string // src/fork/module/<dir>
  bin: string
  version: string
  baseDir: string // dir where serviceStartExec would have landed start-*.sh
}
const S = (global as any).Server
const REG: Record<string, Reg> = {
  qdrant: {
    dir: 'Qdrant',
    bin: join(runpath, 'app/qdrant/1.18.2/qdrant'),
    version: '1.18.2',
    baseDir: join(S.BaseDir, 'qdrant')
  },
  etcd: {
    dir: 'ETCD',
    bin: join(runpath, 'app/etcd/3.6.1/etcd'),
    version: '3.6.1',
    baseDir: join(S.BaseDir, 'etcd')
  },
  ollama: {
    dir: 'Ollama',
    bin: join(runpath, 'app/static-ollama-0.18.2/ollama'),
    version: '0.18.2',
    baseDir: join(S.BaseDir, 'ollama')
  },
  mailpit: {
    dir: 'MailPit',
    bin: join(runpath, 'app/static-mailpit-1.26.2/mailpit'),
    version: '1.26.2',
    baseDir: join(S.BaseDir, 'mailpit')
  },
  caddy: {
    dir: 'Caddy',
    bin: join(runpath, 'app/static-caddy-2.11.2/caddy'),
    version: '2.11.2',
    baseDir: join(S.BaseDir, 'caddy')
  },
  nginx: {
    dir: 'Nginx',
    bin: join(runpath, 'app/nginx-1.28.0/sbin/nginx'),
    version: '1.28.0',
    baseDir: S.NginxDir
  },
  frankenphp: {
    dir: 'FrankenPHP',
    bin: join(runpath, 'app/frankenphp/1.12.2/frankenphp'),
    version: '1.12.2',
    baseDir: join(S.BaseDir, 'frankenphp')
  },
  php: {
    dir: 'Php',
    bin: join(runpath, 'app/static-php-8.3.30/sbin/php-fpm'),
    version: '8.3.30',
    baseDir: S.PhpDir
  },
  numa: {
    dir: 'Numa',
    bin: join(runpath, 'app/numa/0.14.3/numa'),
    version: '0.14.3',
    baseDir: join(S.BaseDir, 'numa')
  },
  cliproxyapi: {
    dir: 'CliProxyAPI',
    bin: join(runpath, 'app/cliproxyapi/6.9.45/cli-proxy-api'),
    version: '6.9.45',
    baseDir: join(S.BaseDir, 'cliproxyapi')
  },
  elasticsearch: {
    dir: 'Elasticsearch',
    bin: join(runpath, 'app/elasticsearch/v9.4.2/bin/elasticsearch'),
    version: '9.4.2',
    baseDir: join(S.BaseDir, 'elasticsearch')
  },
  memcached: {
    dir: 'Memcached',
    bin: '/opt/homebrew/bin/memcached',
    version: '1.6.0',
    baseDir: S.MemcachedDir
  },
  mariadb: {
    dir: 'Mariadb',
    bin: '/opt/homebrew/Cellar/mariadb/12.3.2/bin/mariadbd',
    version: '12.3.2',
    baseDir: S.MariaDBDir
  },
  mysql: {
    dir: 'Mysql',
    bin: '/opt/homebrew/Cellar/mysql/9.6.0/bin/mysqld',
    version: '9.6.0',
    baseDir: S.MysqlDir
  },
  postgresql: {
    dir: 'Postgresql',
    bin: '/opt/homebrew/Cellar/postgresql@17/17.10/bin/pg_ctl',
    version: '17.10',
    baseDir: S.PostgreSqlDir
  },
  rabbitmq: {
    dir: 'RabbitMQ',
    bin: '/opt/homebrew/Cellar/rabbitmq/4.3.1_1/sbin/rabbitmq-server',
    version: '4.3.1',
    baseDir: join(S.BaseDir, 'rabbitmq')
  },
  n8n: {
    dir: 'N8N',
    bin: join(runpath, 'app/nodejs/v24.14.0/lib/node_modules/n8n/bin/n8n'),
    version: '1.0.0',
    baseDir: join(S.BaseDir, 'n8n')
  },
  tomcat: {
    dir: 'Tomcat',
    // Mirror production: allInstalledVersions sets version.bin to startup.sh.
    bin: join(runpath, 'app/static-tomcat-11.0.22/bin/startup.sh'),
    version: '11.0.22',
    baseDir: join(S.BaseDir, 'tomcat')
  }
}

function scanScripts(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((f) => /^start-.*\.sh$/.test(f))
}

function isAlive(pid: string | number): boolean {
  const n = Number(pid)
  if (!n || Number.isNaN(n)) return false
  try {
    process.kill(n, 0)
    return true
  } catch {
    return false
  }
}

async function doStart(name: string): Promise<string> {
  const r = REG[name]
  const version = mkVersion(name)
  const mod = (await import(`${repo}/src/fork/module/${r.dir}/index.ts`)).default
  // Production calls module.init() before exec (BaseManager.doRun) — it sets pidPath etc.
  mod?.init?.()
  const res: any = await new Promise((resolve, reject) => {
    mod
      ._startServer(version)
      .on((x: any) => console.log('  LOG', JSON.stringify(x)))
      .then(resolve)
      .catch(reject)
  })
  return res?.['APP-Service-Start-PID']
}

async function doStop(name: string, pid: string) {
  const r = REG[name]
  const version = mkVersion(name)
  version.pid = `${pid}`
  const mod = (await import(`${repo}/src/fork/module/${r.dir}/index.ts`)).default
  mod?.init?.()
  await new Promise((resolve, reject) => {
    mod
      ._stopServer(version)
      .on((x: any) => console.log('  LOG', JSON.stringify(x)))
      .then(resolve)
      .catch(reject)
  })
}

function mkVersion(name: string): any {
  const r = REG[name]
  return {
    typeFlag: name === 'frankenphp' ? 'frankenphp' : name,
    version: r.version,
    bin: r.bin,
    path: dirname(dirname(r.bin)),
    num: 0,
    enable: true,
    run: false,
    running: false,
    flag: 'local'
  }
}

async function main() {
  // Read the module name from env (not argv) so this script's own command line
  // does NOT contain the module name.
  const name = process.env.MODULE || ''
  // PHASE sub-commands let us run start in a short-lived child process that EXITS,
  // so the detached service reparents to init (PID 1) before we run stop. Otherwise
  // this runner stays the service's parent and _stopServer's process-tree walk would
  // catch and kill the runner itself (a test-only artifact; in production the parent
  // is the long-lived fork manager).
  const phase = process.env.PHASE || ''

  if (!name || !REG[name]) {
    console.error(
      `unknown module "${name}". set MODULE=<name>. known: ${Object.keys(REG).join(', ')}`
    )
    process.exit(2)
  }
  const r = REG[name]
  if (!existsSync(r.bin)) {
    console.error(`bin not found: ${r.bin}`)
    process.exit(2)
  }

  if (phase === 'start') {
    const pid = await doStart(name)
    // emit the pid on a recognizable line for the parent to capture
    console.log(`##PID##${pid}##PID##`)
    process.exit(0)
  }
  if (phase === 'stop') {
    await doStop(name, process.env.PID || '')
    process.exit(0)
  }

  // ---- orchestrator: spawn start child, then verify, then spawn stop child ----
  // The child phases kill the service process tree; because node lives under AppDir
  // and the service may transiently share our process group, the kill can deliver a
  // signal back to us. We are the orchestrator and must survive it — ignore the
  // terminating signals and rely on explicit process.exit() at the end.
  process.on('SIGINT', () => {})
  process.on('SIGTERM', () => {})
  process.on('SIGHUP', () => {})
  const { spawnSync } = await import('node:child_process')

  const before = scanScripts(r.baseDir)
  if (before.length) {
    console.log(`[warn] pre-existing start scripts (from old code): ${before.join(', ')}`)
  }

  console.log(`\n=== starting ${name} (${r.bin}) ===`)
  const self = process.argv[1]
  const startRun = spawnSync('npx', ['tsx', self], {
    env: { ...process.env, MODULE: name, PHASE: 'start' },
    encoding: 'utf-8'
  })
  const out = (startRun.stdout || '') + (startRun.stderr || '')
  const m = /##PID##(.*?)##PID##/.exec(out)
  const pid = m?.[1]?.trim() || ''
  console.log(out.split('\n').filter((l) => l.includes('LOG') || l.includes('Error')).join('\n'))
  console.log(`started, PID=${pid}`)

  await new Promise((r) => setTimeout(r, 3000))
  const alive = isAlive(pid)
  const stray = scanScripts(r.baseDir).filter((f) => !before.includes(f))
  console.log(`alive=${alive}  strayScripts=${JSON.stringify(stray)}`)

  console.log(`=== stopping ${name} ===`)
  // Run stop in a fully detached session (setsid via detached:true) so that when
  // _stopServer walks the service process tree and kills it, the signal cannot
  // propagate back to this orchestrator. We don't read its exit code; instead we
  // verify success by checking the service is actually gone below.
  const { spawn } = await import('node:child_process')
  await new Promise<void>((resolve) => {
    const child = spawn('npx', ['tsx', self], {
      env: { ...process.env, MODULE: name, PHASE: 'stop', PID: pid },
      detached: true,
      stdio: 'ignore'
    })
    child.unref()
    child.on('exit', () => resolve())
    // safety timeout in case the child is killed mid-run
    setTimeout(() => resolve(), 15000)
  })
  // Some services (Tomcat/JVM, databases) take a few seconds to shut down after the
  // stop signal — poll for up to ~10s before declaring it still alive.
  let aliveAfter = true
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500))
    if (!isAlive(pid)) {
      aliveAfter = false
      break
    }
  }
  console.log(`aliveAfterStop=${aliveAfter}`)

  const fails: string[] = []
  if (!alive) fails.push('process NOT running 3s after start')
  if (stray.length) fails.push(`start-*.sh landed to disk: ${stray.join(', ')}`)
  if (aliveAfter) fails.push('process STILL alive after stop')

  if (fails.length) {
    console.error(`\nFAIL ${name}:\n  - ${fails.join('\n  - ')}`)
    process.exit(1)
  }
  console.log(`\nPASS ${name}`)
  process.exit(0)
}

main().catch((e) => {
  console.error('ERROR', e)
  process.exit(1)
})
