import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import * as Process from '../src/shared/Process'
import * as Context from '../src/shared/ServiceStopContext'
import { StopProcessListAccess } from '../src/shared/StopProcessList'
import type { PItem } from '../src/shared/Process'

// Exercise real module stop methods and shared exit comparison, with controlled
// OS sampling/signals. Unrelated startup/install dependencies are not loaded.
const directory = await mkdtemp(resolve(tmpdir(), 'flyenv-stop-snapshot-'))
const root: PItem = {
  PID: '7001',
  PPID: '1',
  USER: 'user',
  COMMAND: '/app/cloudflared tunnel run',
  CREATED: '2026-10-06T08:00:00.000Z',
  EXECUTABLE: '/app/cloudflared'
}
let initial: PItem[] = [root]
let after: PItem[] = []
let discoveries = 0
let confirmations = 0
let windows = false
let queryError: Error | undefined
let signalError: Error | undefined
const signals: string[][] = []
const sample = async () => {
  discoveries++
  if (queryError) throw queryError
  return initial
}
const fresh = async () => {
  confirmations++
  if (queryError) throw queryError
  if (confirmations > 1) throw new Error('Repeated query after a reused PID')
  return after
}
const access = new StopProcessListAccess(sample)
const dependencies: Record<string, any> = {
  '@shared/Process': {
    ...Process,
    ProcessListFetch: sample,
    ProcessKillStrict: async (_signal: string, pids: string[]) => {
      signals.push(pids)
      if (signalError) throw signalError
    }
  },
  '@shared/StopProcessList': {
    StopProcessListFetch: () => access.fetch(),
    fetchStopProcessListLocal: fresh
  },
  '@shared/ServiceStopContext': Context,
  '@shared/utils': {
    isWindows: () => windows,
    isMacOS: () => !windows,
    isLinux: () => false,
    waitTime: async () => {},
    appDebugLog: async () => {}
  },
  '../../Fn': {
    readFile,
    writeFile,
    remove: (file: string) => rm(file),
    waitTime: async () => {},
    AppLog: () => ''
  },
  '../../Helper': { default: {} },
  '../../util/Zip': {},
  '../../util/ServiceStart': {}
}
async function load(file: string) {
  const bundled = await build({
    entryPoints: [file],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    plugins: [
      {
        name: 'os-boundaries',
        setup(builder) {
          builder.onResolve({ filter: /./ }, (args) =>
            args.kind === 'entry-point' ? undefined : { path: args.path, external: true }
          )
        }
      }
    ]
  })
  const require = createRequire(pathToFileURL(resolve(file)))
  const module = { exports: {} as any }
  runInNewContext(bundled.outputFiles[0].text, {
    module,
    exports: module.exports,
    require: (name: string) => {
      const canonical =
        name.startsWith('./') && file.startsWith('src/shared/') ? `@shared/${name.slice(2)}` : name
      return dependencies[canonical] ?? require(name)
    },
    process,
    global,
    console,
    setTimeout,
    clearTimeout,
    Buffer
  })
  return module.exports
}
try {
  dependencies['@shared/ServiceStop'] = await load('src/shared/ServiceStop.ts')
  dependencies['../Base'] = await load('src/fork/module/Base/index.ts')
  const pg = (await load('src/fork/module/Postgresql/index.ts')).default
  const { CloudflareTunnel } = await load('src/fork/module/CloudflareTunnel/CloudflareTunnel.ts')

  // A PID reused after the signal must not cause pgAdmin to falsely time out.
  after = [{ ...root, CREATED: '2026-10-06T08:00:01.000Z' }]
  initial = after
  assert.strictEqual(await pg.stopPgAdminPidsStrict(['7001'], [root]), after)
  assert.equal(confirmations, 1)
  initial = [root]

  discoveries = 0
  confirmations = 0
  await Context.withServiceStopContext({ processList: initial, reason: 'quit' }, () =>
    pg.stopPgAdminPidsStrict(['7001'])
  )
  assert.equal(discoveries, 0, 'pgAdmin cleanup must reuse its supplied initial snapshot')
  assert.equal(confirmations, 1)

  confirmations = 0
  after = [{ ...root, CREATED: undefined }]
  await assert.rejects(pg.stopPgAdminPidsStrict(['7001'], initial), /Repeated query/)
  confirmations = 0
  queryError = new Error('process query failed')
  await assert.rejects(pg.stopPgAdminPidsStrict(['7001'], initial), /process query failed/)
  queryError = undefined
  after = [{ ...root, CREATED: '2026-10-06T08:00:01.000Z' }]

  const pidFile = resolve(directory, 'tunnel.pid')
  const tunnel = new CloudflareTunnel()
  tunnel.pidFilePath = () => pidFile
  tunnel.cloudflaredBin = '/app/cloudflared'
  const reset = async () => {
    discoveries = 0
    confirmations = 0
    signals.length = 0
    queryError = undefined
    signalError = undefined
    tunnel.pid = '7001'
    await writeFile(pidFile, '7001')
  }
  // A supplied empty snapshot is authoritative: do not rediscover or signal.
  await reset()
  await Context.withServiceStopContext({ processList: [], reason: 'quit' }, () => tunnel.stop())
  assert.equal(discoveries, 0)
  assert.equal(signals.length, 0)
  assert.equal(existsSync(pidFile), false)

  // Both platform branches consume the supplied snapshot; Unix confirmation
  // distinguishes a new occupant of the original PID and preserves that process.
  for (windows of [false, true]) {
    await reset()
    await Context.withServiceStopContext({ processList: initial, reason: 'quit' }, () =>
      tunnel.stop()
    )
    assert.equal(discoveries, 0)
    assert.deepEqual(signals.flat(), ['7001'])
    assert.equal(tunnel.pid, '')
    assert.equal(existsSync(pidFile), false)
  }
  windows = false
  await reset()
  queryError = new Error('process query failed')
  await assert.rejects(tunnel.stop(), /process query failed/)
  assert.equal(signals.length, 0)
  assert.equal(await readFile(pidFile, 'utf8'), '7001')
  assert.equal(tunnel.pid, '7001')

  // Failed signalling with an unconfirmed live target must retain PID state.
  await reset()
  after = [root]
  signalError = new Error('signal denied')
  await assert.rejects(
    Context.withServiceStopContext({ processList: initial, reason: 'quit' }, () => tunnel.stop()),
    /signal denied/
  )
  assert.equal(await readFile(pidFile, 'utf8'), '7001')
  assert.equal(tunnel.pid, '7001')
  // Plugin overrides must not poll the immutable discovery snapshot after Base
  // has confirmed exit. Exercise the real llama.cpp override and Base together.
  dependencies['@fork/module/Base'] = dependencies['../Base']
  dependencies['@fork/Fn'] = dependencies['../../Fn']
  dependencies['@fork/util/ServiceStart'] = {}
  dependencies['../release'] = {}
  dependencies['../runtime'] = {}
  dependencies['../models'] = {}
  const { LlamaCppModule } = await load('plugins/llamacpp/fork/LlamaCpp/index.ts')
  const savedServer = global.Server
  global.Server = { ...savedServer, BaseDir: directory } as typeof global.Server
  const llama = new LlamaCppModule()
  const version = { bin: '/app/llama-server', path: '/app', pid: '7001', version: 'test' }
  const llamaPidFile = resolve(directory, 'llama-cpp/llama-server.pid')
  await mkdir(resolve(directory, 'llama-cpp'))
  const resetLlama = async () => {
    initial = [
      {
        ...root,
        COMMAND: '/app/llama-server --model weights.gguf',
        EXECUTABLE: '/app/llama-server'
      }
    ]
    after = []
    discoveries = 0
    confirmations = 0
    signals.length = 0
    queryError = undefined
    signalError = undefined
    llama.activeRuntime = version
    await writeFile(llamaPidFile, '7001')
  }
  try {
    for (const reason of ['stop', 'quit'] as const) {
      await resetLlama()
      // A replacement with the same PID is also a completed original stop.
      if (reason === 'quit') after = [{ ...initial[0], CREATED: '2026-10-06T08:00:01.000Z' }]
      const progress: any[] = []
      const result = await Context.withServiceStopContext({ processList: initial, reason }, () =>
        llama.stopService(version).on((event: any) => progress.push(event))
      )
      assert.deepEqual(Array.from(result['APP-Service-Stop-PID']), ['7001'])
      assert.equal(discoveries, 0, 'plugin must reuse the supplied discovery snapshot')
      assert.equal(confirmations, 1, 'Base owns fresh exit confirmation')
      assert.equal(existsSync(llamaPidFile), false)
      assert.equal(llama.activeRuntime, undefined)
      assert.equal(progress.filter((event) => event['APP-Service-Stop-Success']).length, 1)
    }
    await resetLlama()
    after = initial
    signalError = new Error('signal denied')
    const progress: any[] = []
    await assert.rejects(
      Context.withServiceStopContext({ processList: initial, reason: 'stop' }, () =>
        llama.stopService(version).on((event: any) => progress.push(event))
      ),
      /signal denied/
    )
    assert.equal(await readFile(llamaPidFile, 'utf8'), '7001')
    assert.strictEqual(llama.activeRuntime, version)
    assert.equal(
      progress.some((event) => event['APP-Service-Stop-Success']),
      false
    )
    // Windows quit completes on the shared kill result without an extra poll.
    await resetLlama()
    windows = true
    const quitResult = await Context.withServiceStopContext(
      { processList: initial, reason: 'quit' },
      () => llama.stopService(version)
    )
    assert.deepEqual(Array.from(quitResult['APP-Service-Stop-PID']), ['7001'])
    assert.equal(discoveries, 0)
    assert.equal(confirmations, 0)
    assert.equal(existsSync(llamaPidFile), false)
    assert.equal(llama.activeRuntime, undefined)
  } finally {
    windows = false
    global.Server = savedServer
  }
  console.log('pgAdmin, Cloudflare and llama.cpp stop snapshot regression tests passed')
} finally {
  await rm(directory, { recursive: true, force: true })
}
