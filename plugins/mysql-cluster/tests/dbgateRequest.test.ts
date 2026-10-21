import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { reactive } from 'vue'

async function fixture() {
  const state: any = { off: [], sent: [], progress: [] }
  ;(globalThis as any).__mcDbGateRequest = state
  const result = await build({
    entryPoints: ['plugins/mysql-cluster/render/dbgateRequest.ts'],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    plugins: [
      {
        name: 'sensitive-ipc',
        setup(builder) {
          builder.onResolve({ filter: /^@\/util\/IPC$/ }, () => ({
            path: 'ipc',
            namespace: 'mock'
          }))
          builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({
            contents: `const s=globalThis.__mcDbGateRequest; export default {send(){throw Error('Sensitive IPC required')},sendSensitive(...args){if(s.sendError)throw Error('send failed');s.sent.push(structuredClone(args));return {key:'request',then(cb){s.callback=cb}}},off(key){s.off.push(key)}}`
          }))
        }
      }
    ]
  })
  const module: any = { exports: {} }
  new Function(
    'require',
    'module',
    'exports',
    'setTimeout',
    'clearTimeout',
    result.outputFiles[0].text
  )(
    createRequire(import.meta.url),
    module,
    module.exports,
    (fn: () => void) => {
      state.timeout = fn
      return 1
    },
    () => {
      state.cleared = true
    }
  )
  const request = (node: any = reactive({ bin: '/node/bin/node' })) =>
    module.exports.requestDbGate(node, (info: any) => {
      state.progress.push(info)
      if (state.progressError) throw Error('progress failed')
    })
  return { state, request }
}
test('sensitive request clones reactive Node and keeps the listener until a terminal response', async () => {
  const f = await fixture(),
    pending = f.request()
  let settled = false
  pending.then(() => {
    settled = true
  })
  f.state.callback('request', { code: 200, msg: { type: 'web-panel-install', service: 'DbGate' } })
  await Promise.resolve()
  assert.equal(settled, false)
  assert.deepEqual(f.state.off, [])
  assert.deepEqual(f.state.sent, [
    ['app-fork:mysql-cluster', 'openDbGate', { bin: '/node/bin/node' }]
  ])
  f.state.callback('request', { code: 0, data: { url: 'http://127.0.0.1:3000' } })
  assert.deepEqual(await pending, { url: 'http://127.0.0.1:3000' })
  assert.deepEqual(f.state.off, ['request'])
  assert.equal(f.state.cleared, true)
  f.state.callback('request', { code: 200, msg: 'late' })
  assert.equal(f.state.progress.length, 1)
})
test('timeout removes the listener and ignores late results', async () => {
  const f = await fixture(),
    pending = f.request()
  f.state.timeout()
  await assert.rejects(pending, /timed out/)
  f.state.callback('request', { code: 0, data: { url: 'http://127.0.0.1:3000' } })
  assert.deepEqual(f.state.off, ['request'])
})
test('terminal failure and synchronous send failure settle without leaking listeners', async () => {
  const f = await fixture(),
    pending = f.request()
  f.state.callback('request', { code: 1, msg: 'package unavailable' })
  await assert.rejects(pending, /package unavailable/)
  assert.deepEqual(f.state.off, ['request'])
  f.state.sendError = true
  await assert.rejects(f.request(), /send failed/)
  assert.deepEqual(f.state.off, ['request'])
})
test('progress callback failure also releases a pending listener', async () => {
  const f = await fixture(),
    pending = f.request()
  f.state.progressError = true
  try {
    f.state.callback('request', { code: 200, msg: 'install' })
  } catch {
    /* Assert the promise contract below. */
  }
  assert.deepEqual(f.state.off, ['request'])
  await assert.rejects(pending, /progress failed/)
})
