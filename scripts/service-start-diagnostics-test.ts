import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'

const require = createRequire(import.meta.url)
const bundle = await build({
  entryPoints: ['src/fork/util/ServiceStart.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  plugins: [
    {
      name: 'application-boundaries',
      setup(builder) {
        builder.onResolve({ filter: /./ }, (args) =>
          args.kind === 'entry-point' ? undefined : { path: args.path, external: true }
        )
      }
    }
  ]
})
const root = await mkdtemp(join(tmpdir(), 'flyenv-start-diagnostics-'))
const children = new Set<ChildProcess>()
let passed = 0
const failures: string[] = []
let caseId = 0

function serviceStarter(linux = false) {
  const helperCalls: unknown[][] = []
  const module = { exports: {} as any }
  runInNewContext(bundle.outputFiles[0].text, {
    module,
    exports: module.exports,
    process,
    Buffer,
    setTimeout,
    clearTimeout,
    console: { log() {} },
    require(name: string) {
      if (name === 'node:child_process')
        return {
          spawn: (...args: Parameters<typeof spawn>) => {
            const cp = spawn(...args)
            children.add(cp)
            cp.once('close', () => children.delete(cp))
            return cp
          }
        }
      if (name.startsWith('node:') || ['path', 'os'].includes(name)) return require(name)
      if (name === '@lang/runtime') return { I18nT: (key: string) => key }
      if (name === '@shared/utils')
        return { isWindows: () => false, isLinux: () => linux, isMacOS: () => !linux }
      if (name === '@shared/EnvSync') return { sync: async () => ({ ...process.env }) }
      if (name === '../Helper')
        return {
          send: async (...args: unknown[]) => {
            helperCalls.push(args)
            return 43210
          }
        }
      if (name === '../Fn')
        return {
          existsSync,
          readFile,
          writeFile,
          mkdirp: (path: string) => mkdir(path, { recursive: true }),
          remove: (path: string) => rm(path, { force: true }),
          AppLog: (level: string, message: string) => ({ level, message })
        }
      return {}
    }
  })
  return {
    start: module.exports.serviceStartSpawn as (
      param: Record<string, unknown>
    ) => Promise<{ 'APP-Service-Start-PID': string }>,
    helperCalls
  }
}

async function fixture(script: string, previous = '', linux = false) {
  const directory = join(root, `${++caseId}`)
  await mkdir(directory)
  const errFile = join(directory, 'start-error.log')
  await writeFile(errFile, previous)
  const runtime = serviceStarter(linux)
  const param = {
    baseDir: directory,
    bin: process.execPath,
    execArgs: ['-e', script],
    cwd: directory,
    version: { typeFlag: 'fixture', version: '1.0' },
    errFile,
    on() {},
    waitTime: 1500
  }
  return { ...runtime, param, errFile }
}
async function failure(operation: Promise<unknown>) {
  try {
    await operation
  } catch (error) {
    return String(error)
  }
  throw new Error('Expected startup rejection')
}
async function test(name: string, run: () => Promise<void>) {
  try {
    await run()
    passed++
    console.log(`PASS ${name}`)
  } catch (error) {
    failures.push(name)
    console.error(`FAIL ${name}: ${error}`)
  }
}

try {
  await test('silent early exit reports metadata without historical stderr', async () => {
    const previous = 'OLD_RUN_PERMISSION_DENIED\n'
    const f = await fixture('process.exit(7)', previous)
    const message = await failure(f.start(f.param))
    assert.match(message, /exit code: 7, signal: none/)
    assert.equal(message.includes('OLD_RUN_PERMISSION_DENIED'), false)
    assert.equal(await readFile(f.errFile, 'utf8'), previous, 'existing log is preserved')
  })
  await test('current stderr appears exactly once', async () => {
    const f = await fixture("process.stderr.write('CURRENT_RUN_FAILURE\\n'); process.exitCode = 2")
    const message = await failure(f.start(f.param))
    assert.equal(message.split('CURRENT_RUN_FAILURE').length - 1, 1)
    assert.match(message, /exit code: 2, signal: none/)
  })
  await test('mixed historical and fresh multibyte stderr is isolated by invocation', async () => {
    const f = await fixture(
      "process.stderr.write('本次启动失败\\n'); process.exitCode = 3",
      '旧启动记录\n'
    )
    const message = await failure(f.start(f.param))
    assert.equal(message.includes('旧启动记录'), false)
    assert.equal(message.split('本次启动失败').length - 1, 1)
    assert.equal(await readFile(f.errFile, 'utf8'), '旧启动记录\n本次启动失败\n')
  })
  if (process.platform !== 'win32')
    await test('signal termination retains signal with empty stderr', async () => {
      const f = await fixture("process.kill(process.pid, 'SIGTERM')")
      const message = await failure(f.start(f.param))
      assert.match(message, /exit code: null, signal: SIGTERM/)
    })
  await test('missing executable remains a spawn error', async () => {
    const f = await fixture('')
    const message = await failure(f.start({ ...f.param, bin: join(root, 'does-not-exist') }))
    assert.match(message, /ENOENT/)
  })
  await test('historical bind errors do not request the Linux privileged fallback', async () => {
    const f = await fixture('process.exit(1)', 'OLD bind permission denied\n', true)
    const message = await failure(f.start({ ...f.param, lowPortService: true }))
    assert.equal(f.helperCalls.length, 0)
    assert.equal(message.includes('OLD bind permission denied'), false)
  })
  await test('current low-port failure still selects the existing helper fallback once', async () => {
    const f = await fixture(
      "process.stderr.write('bind: permission denied\\n'); process.exitCode = 1",
      '',
      true
    )
    const result = await f.start({ ...f.param, lowPortService: true })
    assert.equal(result['APP-Service-Start-PID'], '43210')
    assert.equal(f.helperCalls.length, 1)
    assert.deepEqual(f.helperCalls[0].slice(0, 2), ['service', 'launchLowPort'])
  })
  await test('a surviving child still succeeds and registers its own PID', async () => {
    const f = await fixture('setInterval(() => {}, 1000)', 'older retained log\n')
    const pidPath = join(f.param.baseDir, 'pid', 'service.pid')
    const result = await f.start({ ...f.param, waitTime: 100, pidPath })
    assert.equal(await readFile(pidPath, 'utf8'), result['APP-Service-Start-PID'])
    const child = [...children].find((cp) => `${cp.pid}` === result['APP-Service-Start-PID'])
    assert.ok(child)
    assert.equal(child.exitCode, null)
    child.kill('SIGTERM')
  })
} finally {
  for (const cp of children) if (cp.exitCode === null && cp.signalCode === null) cp.kill('SIGTERM')
  await Promise.all(
    [...children].map((cp) =>
      cp.exitCode !== null || cp.signalCode !== null
        ? undefined
        : new Promise((resolve) => cp.once('close', resolve))
    )
  )
  await rm(root, { recursive: true, force: true })
}
console.log(`${passed} passed, ${failures.length} failed`)
if (failures.length) process.exitCode = 1
