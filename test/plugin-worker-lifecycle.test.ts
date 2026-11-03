import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, realpath, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import ts from 'typescript'
import { join } from 'node:path'
import { PluginWorkerRegistry, type PluginWorker } from '../src/main/core/PluginWorkerRegistry'
import { PluginWorkerRuntime } from '../src/fork/runtime/PluginWorkerRuntime'
import { ForkItem } from '../src/main/core/ForkItem'
import { ForkPromise } from '../src/shared/ForkPromise'
import type {
  ForkPluginSnapshot,
  PluginRuntimeDescriptor
} from '../src/shared/plugin/PluginRuntime'

function deferred<T = void>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
const tick = () => new Promise<void>((resolve) => setImmediate(resolve))
class Worker implements PluginWorker {
  ready = deferred()
  exited = deferred()
  actualExit = this.exited.promise
  descriptor?: PluginRuntimeDescriptor
  calls: unknown[][] = []
  closes = 0
  initializePlugin(descriptor: PluginRuntimeDescriptor) {
    this.descriptor = descriptor
    return this.ready.promise
  }
  send(...args: any[]) {
    this.calls.push(args)
    return new ForkPromise((resolve) => resolve({ code: 0, data: this.calls.length }))
  }
  closeAndWait() {
    this.closes++
    return this.actualExit
  }
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'flyenv-worker-'))
  const snapshot: ForkPluginSnapshot = {
    sample: {
      id: 'sample',
      version: '1.0.0',
      module: 'sample',
      entry: '/fixture.mjs',
      runtime: { mode: 'dedicated', dataAccess: 'exclusive' },
      dataRoot: join(root, 'data'),
      installGeneration: 'install-1'
    }
  }
  const workers: Worker[] = []
  const registry = new PluginWorkerRegistry(
    () => snapshot,
    () => {
      const worker = new Worker()
      workers.push(worker)
      return worker
    }
  )
  return {
    root,
    snapshot,
    workers,
    registry,
    clean: () => rm(root, { recursive: true, force: true })
  }
}
async function waitWorker(f: Awaited<ReturnType<typeof fixture>>) {
  for (let i = 0; i < 100 && !f.workers.length; i++)
    await new Promise((resolve) => setTimeout(resolve, 1))
  assert.equal(f.workers.length, 1)
  return f.workers[0]
}
test('simultaneous UI and MCP first calls share one canonical owner and await ready', async () => {
  const f = await fixture()
  try {
    const ui = Promise.resolve(f.registry.dispatch('sample', 'read', []))
    const mcp = f.registry.capture('sample')
    const worker = await waitWorker(f)
    assert.equal(worker.calls.length, 0)
    worker.ready.resolve()
    const identity = await mcp
    await ui
    await f.registry.dispatch('sample', 'read', [], identity)
    assert.equal(worker.calls.length, 2)
    assert.equal(worker.descriptor?.dataRoot, await realpath(f.snapshot.sample.dataRoot!))
    const closing = f.registry.close('sample')
    await tick()
    assert.equal(worker.closes, 1)
    let done = false
    void closing.then(() => {
      done = true
    })
    await tick()
    assert.equal(done, false)
    await assert.rejects(
      Promise.resolve(f.registry.dispatch('sample', 'read', [])),
      /stopping|closed/
    )
    worker.exited.resolve()
    await closing
  } finally {
    await f.clean()
  }
})
test('install generation and symlink aliases cannot bypass an existing stopping owner', async () => {
  const f = await fixture()
  try {
    const capture = f.registry.capture('sample')
    const worker = await waitWorker(f)
    worker.ready.resolve()
    const old = await capture
    const close = f.registry.close('sample')
    const repeated = f.registry.close('sample')
    await tick()
    assert.equal(worker.closes, 1)
    await symlink(f.snapshot.sample.dataRoot!, join(f.root, 'alias'))
    f.snapshot.sample = {
      ...f.snapshot.sample,
      installGeneration: 'install-2',
      dataRoot: join(f.root, 'alias')
    }
    await assert.rejects(f.registry.capture('sample'), /stopping|busy/)
    await assert.rejects(
      Promise.resolve(f.registry.dispatch('sample', 'write', [], old)),
      /stale|stopping|busy/
    )
    assert.equal(f.workers.length, 1)
    worker.exited.resolve()
    await Promise.all([close, repeated])
    const next = f.registry.capture('sample')
    for (let i = 0; i < 100 && f.workers.length < 2; i++)
      await new Promise((resolve) => setTimeout(resolve, 1))
    f.workers[1].ready.resolve()
    const current = await next
    assert.equal(current.dataRoot, old.dataRoot)
    assert.notEqual(current.workerGeneration, old.workerGeneration)
    await assert.rejects(Promise.resolve(f.registry.dispatch('sample', 'write', [], old)), /stale/)
    const end = f.registry.close('sample')
    f.workers[1].exited.resolve()
    await end
  } finally {
    await f.clean()
  }
})
test('initialization failure closes the failed process and never publishes readiness', async () => {
  const f = await fixture()
  try {
    const capture = f.registry.capture('sample')
    const rejected = assert.rejects(capture, /initialization/)
    const worker = await waitWorker(f)
    worker.ready.reject(new Error('initialization failed'))
    await tick()
    assert.equal(worker.closes, 1)
    assert.equal(worker.calls.length, 0)
    worker.exited.resolve()
    await rejected
  } finally {
    await f.clean()
  }
})
test('runtime locks before async initialization and drains before closing its lease', async () => {
  const events: string[] = []
  const initialized = deferred()
  const request = deferred<number>()
  const runtime = new PluginWorkerRuntime({
    acquire: async () => ({
      dataRoot: '/canonical',
      release: async () => {
        events.push('release')
      }
    }),
    load: async () => ({
      initialize: async () => {
        events.push('init')
        await initialized.promise
      },
      exec: () => request.promise,
      close: async () => {
        events.push('close')
      }
    })
  })
  const descriptor = {
    pluginId: 'sample',
    moduleId: 'sample',
    dataRoot: '/canonical',
    installGeneration: 'a',
    workerGeneration: 'b'
  }
  const init = runtime.initialize(descriptor)
  await tick()
  await assert.rejects(runtime.dispatch('sample', 'read', []), /not_ready/)
  initialized.resolve()
  await init
  const call = runtime.dispatch('sample', 'read', [])
  const closing = runtime.close()
  await tick()
  assert.deepEqual(events, ['init'])
  await assert.rejects(runtime.dispatch('sample', 'read', []), /not_ready|closing/)
  request.resolve(3)
  assert.equal(await call, 3)
  await closing
  assert.deepEqual(events, ['init', 'close', 'release'])
})
test('runtime initialization failure cleans up and does not hold the directory lease', async () => {
  const events: string[] = []
  const runtime = new PluginWorkerRuntime({
    acquire: async () => ({
      dataRoot: '/canonical',
      release: async () => {
        events.push('release')
      }
    }),
    load: async () => ({
      initialize: async () => {
        throw new Error('private input')
      },
      close: async () => {
        events.push('close')
      },
      exec: () => {}
    })
  })
  await assert.rejects(
    runtime.initialize({
      pluginId: 'p',
      moduleId: 'm',
      dataRoot: '/canonical',
      installGeneration: 'a',
      workerGeneration: 'b'
    }),
    /initialization_failed/
  )
  assert.deepEqual(events, ['close', 'release'])
})
class Child extends EventEmitter {
  pid = 12345678
  messages: any[] = []
  killed = false
  postMessage(message: any) {
    this.messages.push(message)
  }
  kill() {
    this.killed = true
    return true
  }
}
function fork() {
  ;(global as any).Server = {}
  const child = new Child()
  const bridge: any = { handle: () => false }
  const item = new ForkItem(
    'fixture.mjs',
    {
      idleTimeoutMs: 10000,
      primary: false,
      dedicated: true,
      closeTimeoutMs: 15,
      forkProcess: () => child as any,
      killProcess: () => {}
    },
    bridge,
    bridge,
    bridge,
    () => undefined
  )
  return { item, child }
}
test('retired ForkItem resolves actual exit only on the real child exit event', async () => {
  const { item, child } = fork()
  let exited = false
  void item.actualExit.then(() => {
    exited = true
  })
  item.destroy()
  await tick()
  assert.equal(child.killed, true)
  assert.equal(exited, false)
  child.emit('exit', 0)
  await tick()
  assert.equal(exited, true)
})
test('close timeout forbids replacement; forced unfinished calls return unknown', async () => {
  const { item, child } = fork()
  child.emit('spawn')
  const call = Promise.resolve(item.send('sample', 'write', {}))
  const closing = item.closeAndWait()
  assert.equal(item.closeAndWait(), closing)
  await assert.rejects(closing, /exit_timeout/)
  const result: any = await call
  assert.equal(result.outcome, 'unknown')
  await assert.rejects(Promise.resolve(item.send('sample', 'read')), /destroyed|closing/)
  child.emit('exit', 1)
  await item.actualExit
})

// Use the actual Application method with only its service-registration boundary replaced.
test('host stop waits for a dedicated worker even without a registered service PID', async () => {
  const source = await readFile(new URL('../src/main/Application.ts', import.meta.url), 'utf8')
  const ast = ts.createSourceFile('Application.ts', source, ts.ScriptTarget.Latest, true)
  const application = ast.statements.find(ts.isClassDeclaration)!
  const method = application.members.find(
    (member) =>
      ts.isMethodDeclaration(member) && member.name.getText(ast) === 'stopPluginServicesImpl'
  )!
  const js = ts.transpileModule(`class Probe { ${method.getText(ast)} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  }).outputText
  const service = {
    servicePID: {},
    stopRegisteredInstances: () => {
      throw new Error('should not stop absent services')
    }
  }
  const probe = new Function('ServiceProcessManager', `${js}; return new Probe()`)(service)
  const exit = deferred()
  const closed: string[] = []
  probe.forkManager = {
    closePluginWorker: (module: string) => {
      closed.push(module)
      return exit.promise
    }
  }
  let done = false
  const stop = probe.stopPluginServicesImpl('sample').then(() => {
    done = true
  })
  await tick()
  assert.deepEqual(closed, ['sample'])
  assert.equal(done, false)
  exit.resolve()
  await stop
  assert.equal(done, true)
})
test('a close while canonicalization is pending closes the entry gate before any worker can start', async () => {
  const f = await fixture()
  try {
    const opening = f.registry.capture('sample')
    const rejected = assert.rejects(opening, /closed|stopping/)
    await f.registry.close('sample')
    await rejected
    assert.equal(f.workers.length, 0)
  } finally {
    await f.clean()
  }
})

test('unsolicited ready acknowledgement cannot resolve a missing initialization', () => {
  const { item, child } = fork()
  assert.doesNotThrow(() => child.emit('message', { type: 'plugin-worker-ready' }))
  item.destroy()
  child.emit('exit', 0)
})

test('the worker registry executes caller authorization immediately before sending to its owner', async () => {
  const f = await fixture()
  try {
    const capturing = f.registry.capture('sample')
    const worker = await waitWorker(f)
    worker.ready.resolve()
    const descriptor = await capturing
    const call = f.registry.dispatch('sample', 'write', [], descriptor, () => {
      throw new Error('tool_disabled')
    })
    await assert.rejects(Promise.resolve(call), /tool_disabled/)
    assert.equal(worker.calls.length, 0)
    const close = f.registry.close('sample')
    worker.exited.resolve()
    await close
  } finally {
    await f.clean()
  }
})
