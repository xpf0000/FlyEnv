import assert from 'node:assert/strict'
import { test } from 'node:test'
const api = await import('../render/dbgateController').catch(() => ({}) as any)

function fixture() {
  const state: any = {
    running: true,
    node: { bin: '/node/bin/node', version: '24.0.0' },
    requests: [],
    urls: [],
    notices: [],
    closed: 0,
    errors: []
  }
  let finish!: (value: any) => void
  let progress!: (value: any) => void
  const deps = {
    available: () => state.running,
    node: () => state.node,
    request: (node: any, onProgress: any) => {
      state.requests.push(node)
      progress = onProgress
      return new Promise((resolve) => {
        finish = resolve
      })
    },
    openBrowser: async (url: string) => {
      state.urls.push(url)
    },
    installNotice: () => {
      state.notices.push('install')
      return {
        close: () => {
          state.closed++
        }
      }
    },
    error: (message: string) => {
      state.errors.push(message)
    },
    runtimeRequired: () => 'Select NodeJS',
    unavailable: () => 'Start an instance',
    browserFailed: () => 'Browser failed'
  }
  const controller = new api.MariadbClusterDbGateController(deps)
  return {
    state,
    deps,
    controller,
    finish: (value: any) => finish(value),
    progress: (value: any) => progress(value)
  }
}
test('DbGate open snapshots Node, shares duplicate clicks and retains loading through install progress and browser open', async () => {
  const f = fixture(),
    one = f.controller.open()
  assert.equal(f.controller.open(), one)
  f.state.node.bin = '/changed/node'
  await Promise.resolve()
  assert.equal(f.state.requests[0].bin, '/node/bin/node')
  f.progress({ code: 200, msg: { type: 'web-panel-install', service: 'DbGate' } })
  assert.equal(f.controller.opening, true)
  assert.deepEqual(f.state.notices, ['install'])
  f.finish({ url: 'http://login:synthetic@127.0.0.1:3000' })
  await one
  assert.equal(f.controller.opening, false)
  assert.equal(f.state.closed, 1)
  assert.equal(f.state.urls.length, 1)
})
test('missing runtime or stopped instances admit no DbGate request', async () => {
  const f = fixture()
  f.state.node = undefined
  await f.controller.open()
  f.state.node = { bin: '/node' }
  f.state.running = false
  await f.controller.open()
  assert.deepEqual(f.state.errors, ['Select NodeJS', 'Start an instance'])
  assert.equal(f.state.requests.length, 0)
})
test('stopping instances while opening suppresses the late browser navigation', async () => {
  const f = fixture(),
    pending = f.controller.open()
  await Promise.resolve()
  f.state.running = false
  f.finish({ url: 'http://127.0.0.1:3000' })
  await pending
  assert.deepEqual(f.state.urls, [])
  assert.equal(f.controller.opening, false)
})
test('notice failure is supplementary and browser failure releases opening without replaying the request or exposing URL credentials', async () => {
  const f = fixture()
  f.deps.installNotice = () => {
    throw new Error('notice unavailable')
  }
  f.deps.openBrowser = async (url) => {
    throw new Error(url)
  }
  const pending = f.controller.open()
  await Promise.resolve()
  f.progress({ code: 200, msg: { type: 'web-panel-install', service: 'DbGate' } })
  f.finish({ url: 'http://login:synthetic@127.0.0.1:3000' })
  await pending
  assert.equal(f.controller.opening, false)
  assert.equal(f.state.requests.length, 1)
  assert.deepEqual(f.state.errors, ['Browser failed'])
})

test('cold Node inventory is loaded once independently of sidebar visibility and remains busy until terminal', async () => {
  const f = fixture()
  f.state.node = undefined
  let loaded!: (node: any) => void,
    loads = 0
  ;(f.deps as any).loadNode = () => {
    loads++
    return new Promise((resolve) => {
      loaded = resolve
    })
  }
  const pending = f.controller.open()
  assert.equal(f.controller.opening, true)
  assert.equal(f.controller.open(), pending)
  await Promise.resolve()
  assert.equal(loads, 1)
  loaded({ bin: '/hidden-node/bin/node' })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(f.state.requests[0].bin, '/hidden-node/bin/node')
  f.finish({ url: 'http://127.0.0.1:3000' })
  await pending
  assert.equal(f.controller.opening, false)
})
test('failed discovery releases busy for retry and stopped parents prevent a late panel request', async () => {
  const f = fixture()
  f.state.node = undefined
  ;(f.deps as any).loadNode = async () => {
    throw Error('Node scan failed')
  }
  await f.controller.open()
  assert.equal(f.controller.opening, false)
  assert.deepEqual(f.state.errors, ['Node scan failed'])
  ;(f.deps as any).loadNode = async () => {
    f.state.running = false
    return { bin: '/node' }
  }
  await f.controller.open()
  assert.equal(f.state.requests.length, 0)
})
