import assert from 'node:assert/strict'
import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, writeFile, copyFile, chmod, rm, realpath } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { userInfo } from 'node:os'
import { loadIsolated } from './helpers/load-isolated'
import { ForkPromise } from '../src/shared/ForkPromise'
import { selectScopedPhpStop, processExecutables } from '../src/fork/module/Php/ScopedStop'
const utils = { isWindows: () => false, isLinux: () => false, appDebugLog: async () => {} }
const snapshot = await loadIsolated('src/shared/ProcessSnapshot.ts', { './utils': utils })
const proc = await loadIsolated('src/shared/Process.ts', {
  '../fork/Helper': {},
  '@shared/child-process': {},
  './Process.unix': {},
  '@shared/utils': utils,
  './ServiceStopDiagnostics': { logServiceStop() {} },
  './ProcessSnapshot': snapshot
})
const other = {
  PID: '200',
  PPID: '1',
  USER: 'x',
  COMMAND: 'php-fpm: master process (/tmp/review-php/85/conf/php-fpm.conf)'
}
let stopped: string[] = []
let processList = async () => [other]
let signalPids = async (pids: string[]) => {
  stopped = pids
}
const scope = { pid: '100', bin: '/opt/homebrew/Cellar/php/8.5.7/sbin/php-fpm' }
class Base {
  pidPath = ''
  appPidFile() {
    return ''
  }
  async readPidFromFile() {
    return '200'
  }
  async stopUnixServicePids(_s: any, pids: string[]) {
    await signalPids(pids)
  }
  async removeStoppedAppPid() {}
}
const mocks: any = {
  '../Base': { Base },
  '@lang/runtime': { I18nT: () => '' },
  '../../Fn': { AppLog: () => '', remove: async () => {} },
  '../../util/ServiceStart': {},
  '@shared/ForkPromise': { ForkPromise },
  compressing: {},
  axios: {},
  '../../TaskQueue': {},
  '@shared/Process': proc,
  '@shared/StopProcessList': {
    StopProcessListFetch: () => processList(),
    fetchStopProcessListLocal: () => processList()
  },
  '@shared/ServiceStopContext': { currentServiceStopContext: () => ({ target: scope }) },
  '../../Helper': {},
  '../../util/Zip': {},
  ini: {},
  '../../../render/util/IniParse': {},
  '@shared/utils': utils,
  '../../util/BrewFormula': {},
  './LoadedExtensions': {},
  './ScopedStop': { selectScopedPhpStop }
}
const runtime = { Server: { PhpDir: '/tmp/review-php' } }
const { default: php } = await loadIsolated('src/fork/module/Php/index.ts', mocks, {
  global: runtime
})
const result: any = await php._stopServer({
  bin: scope.bin,
  path: '/opt/homebrew/Cellar/php/8.5.7',
  version: '8.5.7',
  pid: '100'
})
assert.deepEqual(stopped, [])
assert.deepEqual(Array.from(result['APP-Service-Stop-PID']), ['100'])
console.log(
  'PASS actual PHP stop: stale registered root never selects another-prefix/shared-series or module PID root'
)
const root = { ...other, PID: '100' }
const child = { ...root, PID: '101', PPID: '100', COMMAND: 'php-fpm: pool www' }
assert.deepEqual(await selectScopedPhpStop(scope, [root, child, other], async () => [scope.bin]), [
  '100',
  '101'
])
await assert.rejects(
  selectScopedPhpStop(scope, [root, other], async () => ['/another/Cellar/php/8.5.7/sbin/php-fpm']),
  /verify/
)
await assert.rejects(
  selectScopedPhpStop(scope, [root, other], async () => {
    throw new Error('permission denied')
  }),
  /permission denied/
)
await assert.rejects(
  selectScopedPhpStop(scope, [child, other], async () => [scope.bin]),
  /descendant/
)
assert((await processExecutables(String(process.pid))).length > 0)
console.log(
  'PASS exact root executable identity: genuine proctitle and descendants, foreign/unknown identity rejected, actual read-only executable query'
)

// Opt-in native acceptance uses existing binaries with isolated ini/FPM config,
// private sockets and detached test-only process groups. No package is upgraded.
if (process.env.FLYENV_TEST_PHP_FPM) {
  const bin = await realpath(process.env.FLYENV_TEST_PHP_FPM)
  const nativeRoot = await realpath(await mkdtemp('/tmp/flyenv-fpm-stop-'))
  const children: ChildProcess[] = []
  let diagnostics = ''
  try {
    runtime.Server.PhpDir = nativeRoot
    const otherBin = join(nativeRoot, 'other-prefix/php-fpm')
    await mkdir(join(nativeRoot, 'other-prefix'), { recursive: true })
    await copyFile(bin, otherBin)
    await chmod(otherBin, 0o755)
    const start = async (executable: string, folder: string) => {
      const dir = join(nativeRoot, folder)
      await mkdir(dir, { recursive: true })
      const config = join(dir, 'php-fpm.conf')
      const socket = join(dir, 'fpm.sock')
      await writeFile(
        config,
        `[global]\npid=${dir}/fpm.pid\nerror_log=${dir}/fpm.log\ndaemonize=no\n[www]\nuser=${userInfo().username}\nlisten=${socket}\npm=static\npm.max_children=1\n`
      )
      const child = spawn(executable, ['-n', '-F', '-y', config, '-p', dir], {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })
      children.push(child)
      child.stdout!.on('data', (d) => {
        diagnostics += String(d)
      })
      child.stderr!.on('data', (d) => {
        diagnostics += String(d)
      })
      await new Promise<void>((yes, no) => {
        child.once('spawn', yes)
        child.once('error', no)
      })
      for (let i = 0; i < 100; i++) {
        if (existsSync(socket)) return child
        if (child.exitCode !== null) break
        await new Promise((r) => setTimeout(r, 50))
      }
      throw new Error(`Isolated FPM did not start: ${diagnostics.slice(-2000)}`)
    }
    const a = await start(bin, 'a')
    const b = await start(otherBin, '85/conf')
    processList = async () => {
      const { stdout } = await promisify(execFile)('/bin/ps', ['-axo', 'pid=,ppid=,command='])
      return stdout.split('\n').flatMap((line) => {
        const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)
        return m ? [{ PID: m[1], PPID: m[2], COMMAND: m[3], USER: '' }] : []
      })
    }
    const owned = new Set([String(a.pid)])
    const first = await processList()
    let size = -1
    while (size !== owned.size) {
      size = owned.size
      for (const row of first) if (owned.has(row.PPID)) owned.add(row.PID)
    }
    signalPids = async (pids) => {
      assert(
        pids.every((pid) => owned.has(pid)),
        'native test refuses to signal any process outside its first isolated FPM tree'
      )
      stopped = pids
      for (const pid of pids) {
        try {
          process.kill(Number(pid), 'SIGINT')
        } catch (error: any) {
          if (error.code !== 'ESRCH') throw error
        }
      }
      for (let i = 0; i < 100; i++) {
        if (!(await processList()).some((row) => pids.includes(row.PID))) return
        await new Promise((r) => setTimeout(r, 50))
      }
      throw new Error('Native FPM tree did not terminate')
    }
    scope.pid = String(a.pid)
    scope.bin = bin
    const version = {
      bin,
      path: bin.slice(0, bin.lastIndexOf('/')),
      version: '8.5.10',
      pid: scope.pid
    }
    await php._stopServer(version)
    assert((await processList()).some((row) => row.PID === String(b.pid)))
    stopped = []
    await php._stopServer(version)
    assert.deepEqual(stopped, [])
    assert((await processList()).some((row) => row.PID === String(b.pid)))
    console.log(
      'PASS native FPM: real proctitle/executable verification, only confirmed tree terminated, stale-root replay leaves other-prefix same-series FPM running'
    )
  } finally {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) {
        try {
          process.kill(-child.pid!, 'SIGTERM')
        } catch {}
      }
    }
    for (
      let i = 0;
      i < 40 && children.some((child) => child.exitCode === null && child.signalCode === null);
      i++
    )
      await new Promise((r) => setTimeout(r, 50))
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) {
        try {
          process.kill(-child.pid!, 'SIGKILL')
        } catch {}
      }
    }
    await rm(nativeRoot, { recursive: true, force: true })
  }
}
