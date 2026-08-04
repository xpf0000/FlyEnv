# PostgreSQL pgAdmin 4 Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Add a loopback-only pgAdmin 4 management-panel entry for a running PostgreSQL service.

**Architecture:** A pure PostgreSQL pgAdmin helper defines the pinned Python package, paths, generated configuration, server registration, credential validation, and loopback port lookup. The PostgreSQL fork module owns installation, one-time initialization, process tracking, and shutdown. The PostgreSQL page requests credentials only when the fork reports no initialized pgAdmin database.

**Tech Stack:** TypeScript, Vue 3, Element Plus, Electron IPC, Node net, Python virtual environments, pgAdmin 4 Python wheel.

---

## File Map

- Create: src/fork/module/Postgresql/pgAdmin.ts - pure runtime and config helpers.
- Create: scripts/postgresql-pgadmin4-test.ts - helper and source-seam regression test.
- Modify: src/fork/module/Postgresql/index.ts - install, initialize, launch, log, and stop pgAdmin.
- Create: src/render/components/PostgreSql/PgAdminSetup.vue - first-run email/password dialog.
- Modify: src/render/components/PostgreSql/Index.vue - running-service button and IPC sequence.
- Modify: package.json - test:postgresql-pgadmin4 script.

## Task 1: Establish the Testable Runtime Contract

**Files:**
- Create: src/fork/module/Postgresql/pgAdmin.ts
- Create: scripts/postgresql-pgadmin4-test.ts
- Modify: package.json

- [ ] **Step 1: Write the failing test**

Create scripts/postgresql-pgadmin4-test.ts before the helper exists.

~~~ts
import assert from 'node:assert/strict'
import {
  PGADMIN4_DEFAULT_PORT, PGADMIN4_PACKAGE, pgAdminConfigContent, pgAdminPaths,
  pgAdminServersContent, pgAdminUrl, postgresqlPortFromConfig, validPgAdminCredentials,
  validPgAdminPythonVersion
} from '../src/fork/module/Postgresql/pgAdmin'

assert.equal(PGADMIN4_PACKAGE, 'pgadmin4==9.17')
assert.equal(PGADMIN4_DEFAULT_PORT, 5050)
assert.equal(pgAdminUrl(5052), 'http://127.0.0.1:5052')
assert.equal(pgAdminPaths('/tmp/flyenv/postgresql', false).python, '/tmp/flyenv/postgresql/pgadmin4/venv/bin/python')
assert.equal(pgAdminPaths('C:/FlyEnv/postgresql', true).python, 'C:/FlyEnv/postgresql/pgadmin4/venv/Scripts/python.exe')
assert.equal(postgresqlPortFromConfig("port = 15432\n"), 15432)
assert.equal(postgresqlPortFromConfig("port = invalid\n"), 5432)
assert.equal(validPgAdminPythonVersion('3.9.0'), true)
assert.equal(validPgAdminPythonVersion('3.8.18'), false)

const config = pgAdminConfigContent('/tmp/flyenv/postgresql/pgadmin4/data', 5052)
assert.match(config, /DATA_DIR = "\/tmp\/flyenv\/postgresql\/pgadmin4\/data"/)
assert.match(config, /DEFAULT_SERVER = "127\.0\.0\.1"/)
assert.match(config, /DEFAULT_SERVER_PORT = 5052/)
assert.doesNotMatch(config, /0\.0\.0\.0/)

const servers = JSON.parse(pgAdminServersContent(15432))
assert.deepEqual(servers.Servers['1'], {
  Name: 'FlyEnv PostgreSQL', Group: 'Servers', Host: '127.0.0.1', Port: 15432,
  MaintenanceDB: 'postgres', Username: 'root', SSLMode: 'prefer'
})
assert.doesNotMatch(JSON.stringify(servers), /password/i)
assert.equal(validPgAdminCredentials({ email: 'admin@example.test', password: '12345678' }), true)
assert.equal(validPgAdminCredentials({ email: 'invalid', password: '12345678' }), false)
assert.equal(validPgAdminCredentials({ email: 'admin@example.test', password: 'short' }), false)
console.log('PostgreSQL pgAdmin 4 regression tests passed')
~~~

Add this package.json script:

~~~json
"test:postgresql-pgadmin4": "tsx scripts/postgresql-pgadmin4-test.ts"
~~~

- [ ] **Step 2: Run the test to verify it fails**

Run: yarn test:postgresql-pgadmin4

Expected: module resolution fails because pgAdmin.ts does not yet exist.

- [ ] **Step 3: Implement the pure helper**

Create src/fork/module/Postgresql/pgAdmin.ts. This is the complete public interface; keep process spawning and writes in index.ts.

~~~ts
import { createServer } from 'node:net'
import { join } from 'node:path'

export const PGADMIN4_PACKAGE = 'pgadmin4==9.17'
export const PGADMIN4_DEFAULT_PORT = 5050
export type PgAdminCredentials = { email: string; password: string }
export type PgAdminPaths = { root: string; data: string; log: string; pid: string; port: string; servers: string; venv: string; python: string }

export function pgAdminPaths(postgreSqlDir: string, windows: boolean): PgAdminPaths {
  const root = join(postgreSqlDir, 'pgadmin4')
  const venv = join(root, 'venv')
  return {
    root, data: join(root, 'data'), log: join(root, 'log'), pid: join(root, 'pgadmin4.pid'), port: join(root, 'pgadmin4.port'),
    servers: join(root, 'servers.json'), venv,
    python: windows ? join(venv, 'Scripts', 'python.exe') : join(venv, 'bin', 'python')
  }
}
export function pgAdminUrl(port: number): string { return 'http://127.0.0.1:' + port }
export function pgAdminConfigContent(dataDir: string, port: number): string {
  return 'DATA_DIR = ' + JSON.stringify(dataDir) + '\nDEFAULT_SERVER = "127.0.0.1"\nDEFAULT_SERVER_PORT = ' + port + '\n'
}
export function postgresqlPortFromConfig(config: string): number {
  const match = config.match(/^\s*port\s*=\s*'?([0-9]+)'?\s*$/m)
  const port = Number(match?.[1])
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 5432
}
export function validPgAdminPythonVersion(version?: string | null): boolean {
  const match = version?.match(/^(\d+)\.(\d+)/)
  if (!match) return false
  return Number(match[1]) > 3 || (Number(match[1]) === 3 && Number(match[2]) >= 9)
}
export function pgAdminServersContent(postgreSqlPort: number): string {
  return JSON.stringify({ Servers: { '1': {
    Name: 'FlyEnv PostgreSQL', Group: 'Servers', Host: '127.0.0.1', Port: postgreSqlPort,
    MaintenanceDB: 'postgres', Username: 'root', SSLMode: 'prefer'
  } } }, null, 2) + '\n'
}
export function validPgAdminCredentials(value: Partial<PgAdminCredentials>): value is PgAdminCredentials {
  return typeof value.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email) &&
    typeof value.password === 'string' && value.password.length >= 8
}
export async function findPgAdminPort(start = PGADMIN4_DEFAULT_PORT): Promise<number> {
  for (let port = start; port <= start + 20; port += 1) {
    const available = await new Promise<boolean>((resolve) => {
      const server = createServer()
      server.once('error', () => resolve(false))
      server.listen({ host: '127.0.0.1', port }, () => server.close(() => resolve(true)))
    })
    if (available) return port
  }
  throw new Error('No available pgAdmin port in ' + start + '-' + (start + 20))
}
~~~

- [ ] **Step 4: Run the helper test**

Run: yarn test:postgresql-pgadmin4

Expected: every helper assertion passes.

- [ ] **Step 5: Commit**

~~~bash
git add package.json scripts/postgresql-pgadmin4-test.ts src/fork/module/Postgresql/pgAdmin.ts
git commit -m "test: define PostgreSQL pgAdmin 4 runtime contract"
~~~

## Task 2: Implement Fork Lifecycle and Secure Initialization

**Files:**
- Modify: src/fork/module/Postgresql/index.ts
- Modify: scripts/postgresql-pgadmin4-test.ts

- [ ] **Step 1: Extend the failing test**

Add these imports and assertions before the success log.

~~~ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const forkSource = readFileSync(join(root, 'src/fork/module/Postgresql/index.ts'), 'utf8')
assert.match(forkSource, /pgAdminStatus\(\): ForkPromise/)
assert.match(forkSource, /openPGAdmin\(/)
assert.match(forkSource, /validPgAdminCredentials\(credentials\)/)
assert.match(forkSource, /validPgAdminPythonVersion\(python\.version\)/)
assert.match(forkSource, /spawnPromiseWithEnv\(python\.bin, \['-m', 'venv', paths\.venv\]/)
assert.match(forkSource, /PGADMIN4_PACKAGE/)
assert.match(forkSource, /setup\.py/)
assert.match(forkSource, /load-servers/)
assert.match(forkSource, /findPgAdminPort\(/)
assert.match(forkSource, /ProcessKill\('-INT', \[pid\]\)/)
assert.doesNotMatch(forkSource, /execEnv:\s*\{[^}]*PGADMIN_SETUP_PASSWORD/s)
~~~

- [ ] **Step 2: Run the test to verify it fails**

Run: yarn test:postgresql-pgadmin4

Expected: the new lifecycle expectations fail.

- [ ] **Step 3: Implement pgAdmin status, launch, and stop**

Import remove from ../../Fn, ProcessKill and ProcessListFetch from @shared/Process, and every helper export from ./pgAdmin. Add these methods before _stopServer.

~~~ts
private pgAdminPaths() { return pgAdminPaths(global.Server.PostgreSqlDir!, isWindows()) }

private async pgAdminPackageRoot(pythonBin: string): Promise<string> {
  const result = await spawnPromiseWithEnv(pythonBin, [
    '-c', 'import os, pgadmin; print(os.path.dirname(os.path.dirname(pgadmin.__file__)))'
  ], { shell: false })
  const root = result.stdout.trim()
  if (!root) throw new Error('pgAdmin package directory was not found')
  return root
}

private async pgAdminRunningPid(): Promise<string | undefined> {
  const paths = this.pgAdminPaths()
  if (!existsSync(paths.pid)) return undefined
  const pid = await this.readPidFromFile(paths.pid)
  const process = pid ? (await ProcessListFetch()).find((item) => item.PID === pid) : undefined
  if (!process?.COMMAND.includes(paths.root)) {
    await remove(paths.pid).catch(() => {})
    return undefined
  }
  return pid
}

private async _stopPGAdmin(): Promise<string[]> {
  const paths = this.pgAdminPaths()
  const pid = await this.pgAdminRunningPid()
  if (!pid) return []
  await ProcessKill('-INT', [pid])
  await remove(paths.pid).catch(() => {})
  return [pid]
}

pgAdminStatus(): ForkPromise<{ initialized: boolean }> {
  return new ForkPromise((resolve) => {
    resolve({ initialized: existsSync(join(this.pgAdminPaths().data, 'pgadmin4.db')) })
  })
}
~~~

Implement openPGAdmin(version, dataDir, python, credentials?) as a ForkPromise, where python is the selected SoftInstalled item. Reject direct calls when postmaster.pid is absent, python.bin is missing, or validPgAdminPythonVersion(python.version) is false. On first start reject invalid credentials. Use this mandatory order.

~~~ts
const paths = this.pgAdminPaths()
const firstStart = !pgAdminInitialized(paths, existsSync)
if (!existsSync(join(dataDir, 'postmaster.pid'))) throw new Error('PostgreSQL is not running')
if (!python?.bin || !existsSync(python.bin)) throw new Error('A selected Python binary is required')
if (!validPgAdminPythonVersion(python.version)) throw new Error('pgAdmin 4 requires Python 3.9 or later')
if (firstStart && !validPgAdminCredentials(credentials ?? {})) throw new Error('pgAdmin administrator credentials are required')
const postgreSqlPort = postgresqlPortFromConfig(await readFile(join(dataDir, 'postgresql.conf'), 'utf8'))
await mkdirp(paths.data)
await mkdirp(paths.log)
if (!existsSync(paths.python)) await spawnPromiseWithEnv(python.bin, ['-m', 'venv', paths.venv], { shell: false })
let packageRoot = ''
try { packageRoot = await this.pgAdminPackageRoot(paths.python) } catch {}
if (!packageRoot) {
  await spawnPromiseWithEnv(paths.python, ['-m', 'pip', 'install', '--disable-pip-version-check', PGADMIN4_PACKAGE], { shell: false })
  packageRoot = await this.pgAdminPackageRoot(paths.python)
}
~~~

For firstStart only, migrate the database without credentials, create or verify the administrator through a FlyEnv-owned no-secret bootstrap script, and then import the password-free connection. `setup-db` does not create the administrator account. Do not trust the exit status of either pgAdmin CLI helper: write the completion marker only after a separate no-secret verification script uses pgAdmin's `create_app`, `User`, and `Server` models to confirm the active internal Administrator and exact user-owned, password-free FlyEnv PostgreSQL record.

~~~ts
await writeFile(paths.servers, pgAdminServersContent(postgreSqlPort))
await spawnPromiseWithEnv(paths.python, [join(packageRoot, 'setup.py'), 'setup-db'], {
  shell: false
})
await writeFile(paths.bootstrap, pgAdminBootstrapContent())
await spawnPromiseWithEnv(paths.python, [paths.bootstrap, packageRoot], {
  shell: false,
  env: { PGADMIN_SETUP_EMAIL: credentials.email, PGADMIN_SETUP_PASSWORD: credentials.password },
  cwd: packageRoot
})
await spawnPromiseWithEnv(paths.python, [
  join(packageRoot, 'setup.py'), 'load-servers', paths.servers, '--user', credentials.email
], { shell: false })
await writeFile(paths.verification, pgAdminInitializationVerificationContent())
await completePgAdminInitialization({
  verify: () => spawnPromiseWithEnv(paths.python, [
    paths.verification, packageRoot, credentials.email, `${postgreSqlPort}`
  ], { shell: false, cwd: packageRoot }),
  markInitialized: () => writeFile(paths.initialized, '1')
})
~~~

Start the long-running process without sensitive values. serviceStartSpawn logs the parameter object.

~~~ts
const started = await serviceStartSpawn({
  version: { typeFlag: 'postgresql', version: 'pgadmin4', bin: paths.python, path: paths.root, num: null, enable: true, run: false, running: false },
  pidPath: paths.pid, baseDir: paths.root, bin: paths.python,
  execArgs: [join(packageRoot, 'pgAdmin4.py')],
  execEnv: { LC_ALL: global.Server.Local!, LANG: global.Server.Local! },
  on, waitTime: 2000, cwd: packageRoot,
  outFile: join(paths.log, 'pgadmin4.start.out.log'),
  errFile: join(paths.log, 'pgadmin4.start.err.log')
})
resolve({ url: pgAdminUrl(port), ...started })
~~~

Before spawning, reuse a healthy owned PID or remove a stale one. At _stopServer entry call _stopPGAdmin and merge its PIDs into the existing pids set. Add the pgAdmin stdout and stderr files to getLogFiles.

Use the selected-port file to return a healthy existing process without creating another server:

~~~ts
const runningPid = await this.pgAdminRunningPid()
if (runningPid && existsSync(paths.port)) {
  const port = Number((await readFile(paths.port, 'utf8')).trim())
  if (Number.isInteger(port) && port >= 1 && port <= 65535) {
    resolve({ url: pgAdminUrl(port), 'APP-Service-Start-PID': runningPid })
    return
  }
}
const port = await findPgAdminPort()
await writeFile(paths.port, String(port))
await writeFile(join(packageRoot, 'config_local.py'), pgAdminConfigContent(paths.data, port))
~~~

- [ ] **Step 4: Run fork checks**

Run:
~~~bash
yarn test:postgresql-pgadmin4
yarn tsx scripts/stop-process-list-cache-test.ts
yarn tsx scripts/service-web-panel-test.ts
~~~

Expected: all pass and the source test confirms serviceStartSpawn receives no password.

- [ ] **Step 5: Commit**

~~~bash
git add src/fork/module/Postgresql/index.ts scripts/postgresql-pgadmin4-test.ts
git commit -m "feat: run pgAdmin 4 with PostgreSQL"
~~~

## Task 3: Add the First-Run Dialog and Service Entry

**Files:**
- Create: src/render/components/PostgreSql/PgAdminSetup.vue
- Modify: src/render/components/PostgreSql/Index.vue
- Modify: scripts/postgresql-pgadmin4-test.ts

- [ ] **Step 1: Add failing UI assertions**

~~~ts
const pageSource = readFileSync(join(root, 'src/render/components/PostgreSql/Index.vue'), 'utf8')
assert.match(pageSource, /<template v-if="isRunning" #tool-left>/)
assert.match(pageSource, /:disabled="pgAdminOpening"/)
assert.match(pageSource, /shell\.openExternal\(res\.data\.url\)/)
assert.match(pageSource, /<PgAdminSetup v-model="pgAdminSetupVisible"/)
assert.match(pageSource, /@submit="openPGAdmin"/)
const dialogSource = readFileSync(join(root, 'src/render/components/PostgreSql/PgAdminSetup.vue'), 'utf8')
assert.match(dialogSource, /type="password"/)
assert.match(dialogSource, /show-password/)
assert.match(dialogSource, /form\.password = ''/)
assert.match(dialogSource, /I18nT\('feedback\.email'\)/)
assert.match(dialogSource, /I18nT\('common\.password'\)/)
~~~

- [ ] **Step 2: Run the test to verify it fails**

Run: yarn test:postgresql-pgadmin4

Expected: the renderer and dialog expectations fail.

- [ ] **Step 3: Implement the dialog and page flow**

Create PgAdminSetup.vue with Element Plus dialog/form validation, existing feedback.email, common.password, base.cancel, and base.confirm translation keys, and no persisted state.

~~~ts
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: [value: { email: string; password: string }]
}>()
const form = reactive({ email: '', password: '' })
const close = () => { form.password = ''; emit('update:modelValue', false) }
const submit = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  emit('submit', { email: form.email.trim(), password: form.password })
  form.password = ''
  emit('update:modelValue', false)
}
~~~

The password input must use type="password", show-password, and autocomplete="new-password"; require an email and at least eight password characters.

In PostgreSql/Index.vue render the dialog and use a ClickHouse-style HTTP button only while PostgreSQL is running.

~~~ts
const isRunning = computed(() => brewStore.module('postgresql').installed.some((item) => item.run))
const runningVersion = computed(() => brewStore.module('postgresql').installed.find((item) => item.run))
const runningDataDir = computed(() => {
  const version = runningVersion.value
  if (!version?.bin) return ''
  const versionTop = version.version?.split('.')?.shift() ?? ''
  return PostgreSqlSetup.dir[version.bin] ?? join(window.Server.PostgreSqlDir!, `postgresql${versionTop}`)
})
const pgAdminOpening = ref(false)
const pgAdminSetupVisible = ref(false)
~~~

On click, send pgAdminStatus. If initialized is false set pgAdminSetupVisible to true. Otherwise call openPGAdmin with no credentials. Derive the data directory from runningVersion instead of the current PostgreSQL selector. openPGAdmin must first reject a missing selected Python item or binary through MessageError(I18nT('base.needSelectVersion')), then send the ordered IPC request below.

~~~ts
IPC.send(
  'app-fork:postgresql', 'openPGAdmin', runningVersion.value, runningDataDir.value,
  brewStore.currentVersion('python'), credentials
)
~~~

Keep pgAdminOpening true through terminal IPC response. In both success and failure branches call IPC.off(key) and clear loading state. On success call shell.openExternal(res.data.url); otherwise use MessageError(res.msg ?? 'pgAdmin 4 failed to start').

- [ ] **Step 4: Run renderer checks**

Run:
~~~bash
yarn test:postgresql-pgadmin4
yarn tsx scripts/service-web-panel-test.ts
yarn tsx scripts/host-qrcode-url-test.ts
~~~

Expected: all pass; the test proves runtime gating, password clearing, and opening only the fork-returned URL.

- [ ] **Step 5: Commit**

~~~bash
git add src/render/components/PostgreSql/PgAdminSetup.vue src/render/components/PostgreSql/Index.vue scripts/postgresql-pgadmin4-test.ts
git commit -m "feat: add PostgreSQL pgAdmin panel entry"
~~~

## Task 4: Verify the Complete Change

**Files:**
- Modify only the files above if a focused regression identifies a defect.

- [ ] **Step 1: Run focused regression suite**

Run:
~~~bash
yarn test:postgresql-pgadmin4
yarn tsx scripts/service-web-panel-test.ts
yarn tsx scripts/stop-process-list-cache-test.ts
yarn tsx scripts/host-qrcode-url-test.ts
yarn test:clickhouse-ch-ui
~~~

Expected: every command exits successfully.

- [ ] **Step 2: Run type checking**

Run: yarn vue-tsc --noEmit

Expected: no pgAdmin-file diagnostics. Record documented unrelated diagnostics but do not alter unrelated modules.

- [ ] **Step 3: Inspect the final change**

Run:
~~~bash
git diff master...HEAD --check
git diff master...HEAD -- src/fork/module/Postgresql src/render/components/PostgreSql scripts/postgresql-pgadmin4-test.ts package.json
git status --short --branch
~~~

Expected: no whitespace errors and only pgAdmin implementation, tests, and documentation differ from master.

- [ ] **Step 4: Commit a verification correction only when needed**

When a focused check fails, first tighten its failing assertion, make the smallest correction, rerun the check, and commit with a behavior-specific message. Do not commit when all checks pass.
