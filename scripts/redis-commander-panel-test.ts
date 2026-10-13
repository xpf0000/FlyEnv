import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { createI18n } from 'vue-i18n'
import { pathToFileURL } from 'node:url'

const directory = await mkdtemp(join(tmpdir(), 'flyenv-redis-panel-'))
const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: { base: JSON.parse(readFileSync('src/lang/en/base.json', 'utf8')) },
    zh: { base: JSON.parse(readFileSync('src/lang/zh/base.json', 'utf8')) }
  }
})
const node = { bin: '/tmp/node' }
const redis = { version: '7.4.0', run: true }
const requests: Array<{ args: unknown[]; reply: (response: any) => void }> = []
const errors: string[] = []
const removed: string[] = []
const opened: string[] = []
let closeCount = 0
let fetchCount = 0
let finishFetch: (result: boolean) => void = () => {}
let selectedNode: typeof node | undefined
const store = {
  currentVersion: () => selectedNode,
  module: (flag: string) =>
    flag === 'node'
      ? {
          fetchInstalled: (retry: boolean) => {
            assert.equal(retry, true)
            fetchCount++
            return new Promise<boolean>((resolve) => {
              finishFetch = resolve
            })
          }
        }
      : { installed: [redis] }
}
;(globalThis as any).__redisPanel = {
  translate: (key: string, params: any) => i18n.global.t(key, params),
  store,
  requests,
  errors,
  removed,
  opened,
  close: () => closeCount++
}

try {
  const mocks: Record<string, string> = {
    '@/store/brew': 'export const BrewStore=()=>globalThis.__redisPanel.store',
    '@lang/index': 'export const I18nT=(key,params)=>globalThis.__redisPanel.translate(key,params)',
    '@/util/Element': 'export const MessageError=msg=>globalThis.__redisPanel.errors.push(msg)',
    '@/util/NodeFn': `export const shell={openExternal:url=>{
      globalThis.__redisPanel.opened.push(url);return Promise.resolve()
    }}`,
    'element-plus': `export const ElMessage=()=>({close:globalThis.__redisPanel.close})`,
    '@/util/IPC': `export default {
      sendSensitive:(...args)=>({then:cb=>{
        const f=globalThis.__redisPanel,key='request-'+f.requests.length;
        f.requests.push({args,reply:res=>cb(key,res)})
      }}),off:key=>globalThis.__redisPanel.removed.push(key)
    }`
  }
  const result = await build({
    entryPoints: ['src/render/components/Redis/RedisCommanderPanel.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    plugins: [
      {
        name: 'redis-panel-dependencies',
        setup(builder) {
          builder.onResolve({ filter: /./ }, ({ path }) =>
            mocks[path] ? { path, namespace: 'mock' } : undefined
          )
          builder.onLoad({ filter: /./, namespace: 'mock' }, ({ path }) => ({
            contents: mocks[path]
          }))
        }
      }
    ]
  })
  const output = join(directory, 'panel.mjs')
  await writeFile(output, result.outputFiles[0].text)
  const { RedisCommanderPanel } = await import(pathToFileURL(output).href)
  const panel = new RedisCommanderPanel()
  const first = panel.open()
  assert.equal(fetchCount, 1, 'opening loads NodeJS even when its module was hidden')
  assert.equal(panel.opening.value, true, 'loading covers dependency discovery')
  assert.equal(requests.length, 0, 'Commander waits for dependency discovery')
  await panel.open()
  assert.equal(fetchCount, 1, 'duplicate click during discovery is ignored')
  selectedNode = node
  finishFetch(true)
  await first
  assert.deepEqual(requests[0].args, [
    'app-fork:redis',
    'openRedisCommander',
    { bin: '/tmp/node' },
    { version: '7.4.0' }
  ])
  requests[0].reply({ code: 200, msg: { type: 'web-panel-install', service: 'Redis Commander' } })
  assert.equal(panel.opening.value, true)
  assert.equal(removed.length, 0)
  await panel.open()
  assert.equal(requests.length, 1, 'page re-entry cannot start another operation')
  requests[0].reply({ code: 0, data: { url: 'http://127.0.0.1:8081' } })
  assert.equal(panel.opening.value, false)
  assert.deepEqual(opened, ['http://127.0.0.1:8081'])
  assert.deepEqual(removed, ['request-0'])
  assert.equal(closeCount, 1)
  assert.deepEqual(errors, [])

  selectedNode = undefined
  const missing = panel.open()
  finishFetch(true)
  await missing
  assert.match(errors.at(-1)!, /Redis Commander.*requires.*NodeJS/)
  assert.match(errors.at(-1)!, /install.*select/)
  assert.equal(panel.opening.value, false)
  assert.equal(requests.length, 1)

  selectedNode = node
  const failed = panel.open()
  finishFetch(false)
  await failed
  assert.match(errors.at(-1)!, /Redis Commander.*NodeJS.*could not be loaded/)
  assert.equal(panel.opening.value, false)
  assert.equal(requests.length, 1, 'failed scan cannot send a stale NodeJS selection')

  const stopped = panel.open()
  redis.run = false
  finishFetch(true)
  await stopped
  assert.match(errors.at(-1)!, /Redis Commander.*running Redis/)
  assert.equal(panel.opening.value, false)
  assert.equal(requests.length, 1)

  i18n.global.locale.value = 'zh'
  redis.run = true
  selectedNode = undefined
  const missingChinese = panel.open()
  finishFetch(true)
  await missingChinese
  assert.match(errors.at(-1)!, /Redis Commander.*需要.*NodeJS/)
  assert.match(errors.at(-1)!, /安装.*选择/)
  assert.equal(panel.opening.value, false)
  assert.equal(requests.length, 1)

  selectedNode = node
  const retry = panel.open()
  finishFetch(true)
  await retry
  requests[1].reply({ code: 1, msg: 'startup failed' })
  assert.equal(errors.at(-1), 'startup failed')
  assert.equal(panel.opening.value, false)
  assert.deepEqual(removed, ['request-0', 'request-1'])
  console.log('Redis Commander panel lifecycle tests passed')
} finally {
  delete (globalThis as any).__redisPanel
  await rm(directory, { recursive: true, force: true })
}
