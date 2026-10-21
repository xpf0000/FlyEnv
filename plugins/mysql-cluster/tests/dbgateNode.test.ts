import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { resolve } from 'node:path'

async function fixture() {
  const state: any = {
    ready: false,
    storeReads: 0,
    installed: [],
    requests: [],
    errors: [],
    loads: 0,
    selected: { path: '/preferred', version: '24' },
    available: true
  }
  ;(globalThis as any).__dbgateNode = state
  const bundle = await build({
    entryPoints: ['plugins/mysql-cluster/render/dbgate.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    plugins: [
      {
        name: 'node-boundaries',
        setup(b) {
          b.onResolve(
            {
              filter: /^(@\/|@lang\/|@shared\/|\.\/manager|\.\/notice|\.\/lang|\.\/dbgateRequest)/
            },
            (a) =>
              a.path === '@/util/Index'
                ? { path: resolve('src/render/util/Index.ts') }
                : { path: a.path, namespace: 'fixture' }
          )
          b.onLoad({ filter: /.*/, namespace: 'fixture' }, (a) => {
            const code: Record<string, string> = {
              '@/store/brew': `export const BrewStore=()=>({currentVersion(){throw Error('Must not change selected runtime')},module(flag){if(flag!=='node')throw Error(flag);return {get installed(){return globalThis.__dbgateNode.installed},async fetchInstalled(){const s=globalThis.__dbgateNode;s.loads++;if(s.fail)return false;if(s.wait)await s.wait;s.installed=s.versions??[{bin:'/node24',path:'/preferred',version:'24',enable:true}];return true}}}})`,
              '@/store/app': `export const AppStore=()=>{const s=globalThis.__dbgateNode;s.storeReads++;if(!s.ready)throw Error('FlyEnv plugin AppStore is not initialized');return {config:{server:{node:{get current(){return s.selected}}}}}}`,
              '@/util/NodeFn': 'export const shell={openExternal:async()=>{}}',
              '@lang/index': `export const I18nT=x=>x`,
              './manager': `export const MysqlClusterManager={snapshots:{a:{state:'running'}},allBusy:false,operations:{}}`,
              './dbgateRequest': `export const requestDbGate=async node=>{globalThis.__dbgateNode.requests.push(node);return {url:'http://127.0.0.1:3000'}}`,
              './notice': `export const MessageError=x=>globalThis.__dbgateNode.errors.push(x)`,
              './lang': `export const t=x=>x`,
              '@shared/WebPanelInstallNotice': `export const isWebPanelInstallNotice=()=>false`
            }
            if (!(a.path in code)) throw Error(a.path)
            return { contents: code[a.path] }
          })
        }
      }
    ],
    external: ['element-plus']
  })
  // Resolve actual external dependencies from this workspace.
  const { pathToFileURL } = await import('node:url')
  const { createRequire } = await import('node:module')
  const require = createRequire(import.meta.url)
  const text = bundle.outputFiles[0].text.replace(
    '"element-plus"',
    JSON.stringify(pathToFileURL(require.resolve('element-plus')).href)
  )
  const module = await import(
    `data:text/javascript;base64,${Buffer.from(text).toString('base64')}#${Math.random()}`
  )
  assert.equal(state.storeReads, 0, 'cold import must not read the uninitialized host store')
  state.ready = true
  return { state, controller: module.MysqlClusterDbGate }
}
test('actual singleton loads a hidden cold Node module and shares discovery without modifying its selection', async () => {
  const { state, controller } = await fixture()
  let finish!: () => void
  state.wait = new Promise<void>((r) => (finish = r))
  const pending = controller.open()
  assert.equal(controller.open(), pending)
  await Promise.resolve()
  assert.equal(state.loads, 1)
  assert.equal(controller.opening, true)
  finish()
  await pending
  assert.deepEqual(state.requests, [
    { bin: '/node24', path: '/preferred', version: '24', enable: true }
  ])
  assert.deepEqual(state.selected, { path: '/preferred', version: '24' })
})
test('failed inventory is retryable and stale selection falls back only to an enabled installed runtime', async () => {
  const { state, controller } = await fixture()
  state.fail = true
  await controller.open()
  assert.deepEqual(state.errors, ['dbgateNodeScanFailed'])
  assert.equal(controller.opening, false)
  state.fail = false
  state.selected = { path: '/removed', version: '20' }
  state.versions = [
    { bin: '/bad', enable: false },
    { bin: '/fallback', version: '24' }
  ]
  await controller.open()
  assert.equal(state.requests[0].bin, '/fallback')
  assert.equal(state.selected.path, '/removed')
})
