import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, rename, readdir, chmod } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import { ForkPromise } from '../src/shared/ForkPromise'
import { MSSQL_WINDOWS_INSTALLERS } from '../plugins/mssql/fork/Mssql/version'

const root = await mkdtemp(join(tmpdir(), 'mssql-fork-'))
let windows = true
let stopCalls = 0
let forwardedStopArgs: unknown[] = []
class Base {
  type = 'mssql'
  pidPath = ''
  getAxiosProxy() {
    return false
  }
  _stopServer(_version?: any, ...args: unknown[]) {
    forwardedStopArgs = args
    stopCalls++
    return new ForkPromise((resolve) => resolve({ 'APP-Service-Stop-PID': [] }))
  }
  stopService(version: any) {
    return this._stopServer(version)
  }
  startService(version: any, ...args: any[]) {
    return new ForkPromise(async (resolve) => {
      await this._stopServer(version)
      resolve(await (this as any)._startServer(version, ...args))
    })
  }
  installSoft() {
    throw Error('legacy Base installer must not decide MSSQL installation success')
  }
  async ensureAppPidDirWritable() {}
  async saveAppPid() {}
  async readPidFromFile() {
    return '999'
  }
}
const state = {
  Base,
  ForkPromise,
  windows: () => windows,
  hasBwrap: true,
  existsSync,
  start: async (_params: any) => ({ 'APP-Service-Start-PID': `${process.pid}` }),
  fn: {
    mkdirp: (dir: string) => mkdir(dir, { recursive: true }),
    remove: (path: string) => rm(path, { recursive: true, force: true }),
    readFile,
    writeFile,
    rename,
    readdir,
    chmod,
    AppLog: (_level: string, message: string) => message,
    waitTime: async () => {},
    versionDirCache: {},
    versionFilterSame: (v: any) => v,
    versionSort: (v: any) => v,
    versionFixed: (v: string) => v,
    versionLocalFetch: async () => [],
    execPromiseWithEnv: async () => ({ stdout: '' }),
    spawnPromiseWithEnv: async () => ({ stdout: '' }),
    zipUnpack: async () => {}
  }
}
;(globalThis as any).__mssqlForkTest = state
;(globalThis as any).Server = {
  BaseDir: root,
  AppDir: join(root, 'app'),
  Cache: join(root, 'cache')
}
const stubs: Record<string, string> = {
  fs: 'export { createReadStream } from "node:fs"; export const existsSync = path => path === "/usr/bin/bwrap" ? globalThis.__mssqlForkTest.hasBwrap : globalThis.__mssqlForkTest.existsSync(path)',
  axios: 'export default async () => { throw Error("unexpected axios request") }',
  '@fork/module/Base': 'export const Base = globalThis.__mssqlForkTest.Base',
  '@fork/Fn': Object.keys(state.fn)
    .map(
      (name) => `export const ${name} = (...args) => globalThis.__mssqlForkTest.fn.${name}(...args)`
    )
    .join('\n')
    .replace(
      'export const versionDirCache = (...args) => globalThis.__mssqlForkTest.fn.versionDirCache(...args)',
      'export const versionDirCache = globalThis.__mssqlForkTest.fn.versionDirCache'
    ),
  '@fork/util/ServiceStart':
    'export const serviceStartSpawn = params => globalThis.__mssqlForkTest.start(params)',
  '@lang/runtime': 'export const I18nT = key => key',
  '@shared/utils':
    'export const isWindows = () => globalThis.__mssqlForkTest.windows(); export const isLinux = () => !globalThis.__mssqlForkTest.windows()',
  '@shared/ForkPromise': 'export const ForkPromise = globalThis.__mssqlForkTest.ForkPromise',
  '@shared/compare-versions': 'export const compareVersions = (a, b) => a.localeCompare(b)',
  '../lang': 'export const MssqlT = (key, args) => key + JSON.stringify(args || {})',
  'node:os': 'export const arch = () => "x64"; export const totalmem = () => 8 * 1024 ** 3'
}
try {
  const bundled = await build({
    entryPoints: [join(import.meta.dirname, '../plugins/mssql/fork/Mssql/index.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    plugins: [
      {
        name: 'mssql-fork-test',
        setup(builder) {
          builder.onResolve({ filter: /.*/ }, (args) =>
            stubs[args.path] ? { path: args.path, namespace: 'test' } : undefined
          )
          builder.onLoad({ filter: /.*/, namespace: 'test' }, (args) => ({
            contents: stubs[args.path],
            loader: 'js'
          }))
        }
      }
    ]
  })
  const bundlePath = join(root, 'fork.mjs')
  await writeFile(bundlePath, bundled.outputFiles[0].text)
  const { default: mssql } = await import(pathToFileURL(bundlePath).href)
  mssql.init()
  const previousExists = state.existsSync
  const previousExec = state.fn.execPromiseWithEnv
  const windowsBin = 'C:\\SQL\\Binn\\sqlservr.exe'
  state.existsSync = ((file: any) => file === windowsBin || previousExists(file)) as any
  state.fn.execPromiseWithEnv = (async (command: string) => ({
    stdout: command.includes('Instance Names')
      ? '    FLYENV    REG_SZ    MSSQL16.FLYENV'
      : '    Version    REG_SZ    16.0.1000.6\n    SQLBinRoot    REG_SZ    C:\\SQL\\Binn\\\n'
  })) as any
  let scanQueries = 0
  mssql._scQuery = async () => {
    scanQueries++
    return { state: 'RUNNING', pid: 9876 }
  }
  const scanned = await mssql.allInstalledVersions({})
  assert.equal(scanned.length, 1)
  assert.equal(scanned[0].run, false)
  assert.equal(scanned[0].pid, undefined)
  assert.equal(scanQueries, 0, 'installation scans must not observe or adopt external services')
  state.existsSync = previousExists
  state.fn.execPromiseWithEnv = previousExec
  const version = {
    version: '16.0.1-1',
    bin: '/sql/sqlservr.exe',
    path: '/sql',
    serviceName: 'MSSQL$FLYENV',
    pid: '1234'
  }
  mssql._scQuery = async () => {
    throw Error('query denied')
  }
  await assert.rejects(Promise.resolve(mssql._stopServer(version)), /query denied/)
  mssql._scQuery = async () => ({ state: '', pid: 0 })
  await assert.rejects(Promise.resolve(mssql._stopServer(version)), /windowsServiceUnknown/)
  let controls = 0
  mssql._scQuery = async () => ({ state: 'STOPPED', pid: 0 })
  mssql._scControl = async () => {
    controls++
    return ''
  }
  assert.deepEqual((await mssql._stopServer(version))['APP-Service-Stop-PID'], ['1234'])
  assert.equal(controls, 0)
  mssql._scQuery = async () => ({ state: 'RUNNING', pid: 2345 })
  mssql._waitWindowsServiceState = async () => ({ state: 'STOPPED', pid: 0 })
  await assert.rejects(Promise.resolve(mssql._stopServer(version)), /windowsServiceNotOwned/)
  assert.equal(controls, 0, 'a replacement external PID must not be stopped')
  assert.deepEqual((await mssql._stopServer({ ...version, pid: '' }))['APP-Service-Stop-PID'], [])
  assert.equal(controls, 0, 'a service without a FlyEnv PID must not be stopped')
  assert.deepEqual((await mssql._stopServer({ ...version, pid: '2345' }))['APP-Service-Stop-PID'], [
    '2345'
  ])
  assert.equal(controls, 1)
  controls = 0
  stopCalls = 0
  await assert.rejects(Promise.resolve(mssql.startService(version)), /windowsServiceAlreadyRunning/)
  assert.equal(controls, 0, 'an external running service must not be adopted or restarted')
  assert.equal(stopCalls, 0)
  mssql._scQuery = async () => ({ state: 'STOPPED', pid: 0 })
  mssql._waitWindowsServiceState = async () => ({ state: 'RUNNING', pid: 3456 })
  assert.equal((await mssql.startService(version))['APP-Service-Start-PID'], '3456')
  assert.equal(controls, 1, 'only a service started by FlyEnv produces a running registration')

  windows = false
  await mssql._stopServer(version, { saPassword: 'never-log-this-password' })
  assert.deepEqual(forwardedStopArgs, [], 'start-only secrets must not reach the Base stop logger')
  const appDir = join(root, 'app/mssql/16.0.1-1')
  const row = {
    version: '16.0.1-1',
    appDir,
    bin: join(appDir, 'opt/mssql/bin/sqlservr'),
    zip: join(root, 'cache/mssql-server-16.0.1-1.deb'),
    url: 'https://test/pkg',
    eulaAccepted: true
  }
  const verifyChecksum = mssql._verifyDebChecksum.bind(mssql)
  await mkdir(join(root, 'cache'), { recursive: true })
  await writeFile(row.zip, 'broken-cache')
  await assert.rejects(
    verifyChecksum({ ...row, note: JSON.stringify({ sha256: '0'.repeat(64) }) }),
    /SHA256 mismatch/
  )
  assert.equal(
    existsSync(row.zip),
    false,
    'a corrupt owned cache file must not poison every future retry'
  )
  mssql._download = async () => {}
  mssql._verifyDebChecksum = async () => {}
  mssql._unpackDeb = async (_deb: string, target: string) => {
    await mkdir(join(target, 'opt/mssql/bin'), { recursive: true })
    await writeFile(join(target, 'opt/mssql/bin/sqlservr'), 'engine')
  }
  const originalWrite = state.fn.writeFile
  state.fn.writeFile = (async (path: any, ...args: any[]) => {
    if (`${path}`.endsWith('flyenv-runtime.json')) throw Error('manifest disk full')
    return (originalWrite as any)(path, ...args)
  }) as any
  await assert.rejects(Promise.resolve(mssql.installSoft(row)), /manifest disk full/)
  assert.equal(existsSync(row.bin), false, 'failed install must not publish a partial binary')
  state.fn.writeFile = originalWrite
  assert.equal(await mssql.installSoft(row), true)
  assert.equal(existsSync(row.bin), true)
  assert.equal(
    JSON.parse(await readFile(join(appDir, 'flyenv-runtime.json'), 'utf8')).edition,
    'Express'
  )
  const downloads = new Map<string, () => void>()
  mssql._download = (item: any) =>
    new Promise<void>((resolve) => {
      assert.equal(downloads.has(item.version), false, 'same-version downloads must not overlap')
      downloads.set(item.version, resolve)
    })
  const parallelRow = (version: string) => {
    const appDir = join(root, 'app/mssql', version)
    return { ...row, version, appDir, bin: join(appDir, 'opt/mssql/bin/sqlservr') }
  }
  const firstRow = parallelRow('16.0.2-1')
  const secondRow = parallelRow('16.0.3-1')
  const firstInstall = Promise.resolve(mssql.installSoft(firstRow))
  const secondInstall = Promise.resolve(mssql.installSoft(secondRow))
  const duplicateInstall = Promise.resolve(mssql.installSoft(firstRow)).then(
    () => assert.fail('a queued duplicate cannot overwrite an installed directory'),
    (error) => assert.match(error.message, /installDirectoryExists/)
  )
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(downloads.size, 2, 'different versions must download concurrently')
  downloads.get(secondRow.version)!()
  assert.equal(await secondInstall, true, 'another version can finish while the first is pending')
  assert.equal(existsSync(firstRow.bin), false)
  downloads.get(firstRow.version)!()
  assert.equal(await firstInstall, true)
  await duplicateInstall
  mssql._download = async () => {}
  let launchParams: any
  let readinessReads = 0
  state.start = async (params: any) => {
    launchParams = params
    return { 'APP-Service-Start-PID': `${process.pid}` }
  }
  const originalRead = state.fn.readFile
  state.fn.readFile = (async (file: any, ...args: any[]) => {
    if (file === launchParams?.outFile)
      return ++readinessReads >= 3 ? 'SQL Server is now ready for client connections' : ''
    return (originalRead as any)(file, ...args)
  }) as any
  const native = { ...row, path: appDir, note: 'a user remark, not engine metadata' }
  await mssql._startServer(native, { saPassword: 'Flyenv#2026', port: 1433, eulaAccepted: true })
  assert.equal(readinessReads, 3)
  assert.equal(launchParams.bin, '/usr/bin/bwrap')
  assert.equal(launchParams.execEnv.MSSQL_PID, 'Express')
  assert.equal(launchParams.execEnv.MSSQL_MASTER_DATA_FILE, '/var/opt/mssql/data/master.mdf')
  assert.equal(launchParams.sensitive, true)
  state.fn.readFile = originalRead
  state.start = async () => ({ 'APP-Service-Start-PID': '2147483647' })
  const beforeFailedStart = stopCalls
  await assert.rejects(
    Promise.resolve(mssql._startServer(native, { saPassword: 'Flyenv#2026', eulaAccepted: true })),
    /exited/
  )
  assert.equal(
    stopCalls,
    beforeFailedStart + 1,
    'failed readiness invokes the existing process cleanup owner'
  )
  state.hasBwrap = false
  await assert.rejects(
    Promise.resolve(mssql._startServer(native, { saPassword: 'Flyenv#2026', eulaAccepted: true })),
    /bubblewrapRequired/
  )
  state.hasBwrap = true
  mssql._stopServer = () => new ForkPromise((_resolve, reject) => reject(Error('stop refused')))
  await assert.rejects(Promise.resolve(mssql.uninstallSoft(row)), /stop refused/)
  assert.equal(existsSync(row.bin), true)
  mssql._stopServer = () => new ForkPromise((resolve) => resolve({ 'APP-Service-Stop-PID': [] }))
  await mkdir(join(root, 'mssql/data-16/data'), { recursive: true })
  await writeFile(join(root, 'mssql/data-16/data/master.mdf'), 'database')
  assert.equal(await mssql.uninstallSoft(row), true)
  assert.equal(existsSync(row.bin), false)
  assert.equal(await readFile(join(root, 'mssql/data-16/data/master.mdf'), 'utf8'), 'database')
  await assert.rejects(
    Promise.resolve(mssql.uninstallSoft({ ...row, appDir: root })),
    /ownedInstallRequired/
  )
  windows = true
  const catalog = MSSQL_WINDOWS_INSTALLERS.find(
    (item) => item.version === '2022' && item.edition === 'Express'
  )!
  const windowsRow = {
    version: '2022-express',
    url: catalog.url,
    zip: join(root, 'cache', catalog.fileName),
    eulaAccepted: true
  }
  const commands: Array<{ args: string[]; wait: boolean }> = []
  mssql._runWindowsProgram = async (_file: string, args: string[], wait: boolean) => {
    commands.push({ args, wait })
    if (wait) {
      const dir = args.find((arg) => arg.startsWith('/MEDIAPATH='))!.slice('/MEDIAPATH='.length)
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, 'SQLEXPR_x64_ENU.exe'), 'full-media')
    }
  }
  state.fn.zipUnpack = (async (_archive: string, dir: string) => {
    await writeFile(join(dir, 'setup.exe'), 'setup')
  }) as any
  assert.deepEqual(await mssql.installSoft(windowsRow), { installerLaunched: true })
  assert.equal(commands.length, 2)
  assert.ok(commands[0].args.includes('/ACTION=Download'))
  assert.equal(commands[0].wait, true)
  assert.equal(commands[1].wait, false)
  assert.ok(commands[1].args.some((arg) => arg.startsWith('/INSTANCEDIR=')))
  assert.ok(commands[1].args.every((arg) => !/^\/(Q|QS|QUIET|IACCEPT)/i.test(arg)))
  mssql._runWindowsProgram = async () => {
    throw Error('launcher denied')
  }
  await assert.rejects(Promise.resolve(mssql.installSoft(windowsRow)), /launcher denied/)
  console.log('MSSQL fork lifecycle and installation tests passed')
} finally {
  await rm(root, { recursive: true, force: true })
}
