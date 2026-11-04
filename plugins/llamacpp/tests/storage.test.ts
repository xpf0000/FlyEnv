import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { loadBundle, pluginRoot } from './harness'
import { SETTINGS_KEY } from '../render/profiles'

// Keep the real host StorageGetAsync contract. Only replace localForage I/O.
const loadController = async (data: Map<string, unknown>, failRead: boolean | string = false) => {
  const boundary: { data: Map<string, unknown>; failRead: boolean | string; scanResult?: any } = {
    data,
    failRead
  }
  ;(globalThis as any).__llamaStorage = boundary
  const sources = {
    '@/util/Index': `export const reactiveBind=x=>{for(const key of Object.getOwnPropertyNames(Object.getPrototypeOf(x))){if(key!=='constructor')void x[key]}return x}`,
    '@/util/path-browserify': `export const join=(...parts)=>parts.join('/')`,
    '@/util/Storage': `export {StorageGetAsync,StorageSetAsync} from ${JSON.stringify(join(pluginRoot, '../../src/render/util/Storage.ts'))}`,
    localforage: `export default {getItem:async key=>{const h=globalThis.__llamaStorage;if(h.failRead===true||h.failRead===key)throw Error('storage unavailable');return h.data.get(key)??null},setItem:async(key,value)=>globalThis.__llamaStorage.data.set(key,value)}`,
    '@/util/Element': `export const MessageError=()=>{};export const MessageSuccess=()=>{}`,
    '@/util/NodeFn': `export const dialog={}`,
    '@lang/index': `export const AppI18n=()=>({global:{locale:'en'}});export const I18nT=x=>x`,
    '@/store/brew': `export const BrewStore=()=>({module:()=>({installed:[]})})`,
    '@/util/IPC': `export default {}`
  }
  const { LlamaCppController } = await loadBundle(join(pluginRoot, 'render/controller.ts'), sources)
  return {
    controller: new LlamaCppController({
      request: async (method: string, args: any[]) => {
        if (method === 'scanModelsDirectory') {
          return boundary.scanResult ?? { models: [], skipped: [] }
        }
        assert.equal(method, 'inspectLocalModelFiles')
        return args[0].map((path: string) => ({ path, status: 'available' }))
      }
    }),
    boundary
  }
}

test('missing V2 key migrates legacy settings through the real host storage reader', async () => {
  const file = {
    repoId: 'test/model',
    revision: 'main',
    path: 'main.gguf',
    localPath: '/models/main.gguf',
    size: 8,
    standalone: true
  }
  const legacy = {
    profile: { host: '127.0.0.1', port: 9000, threads: 6, contextSize: 4096 },
    selectedModel: file
  }
  const data = new Map<string, unknown>([
    ['flyenv-llama-cpp-models', { data: [file] }],
    ['flyenv-llama-cpp-settings', { data: legacy }]
  ])
  const { controller } = await loadController(data)
  await controller.init()
  assert.equal(controller.settings.service.port, 9000)
  assert.equal(controller.settings.initialBase.contextSize, 4096)
  assert.equal(controller.selectedModel.localPath, file.localPath)
  assert.equal((data.get(SETTINGS_KEY) as any).data.schemaVersion, 2)
  assert.deepEqual((data.get('flyenv-llama-cpp-settings') as any).data, legacy)
})

test('models root getter is safe when reactiveBind reads it before initialization', async () => {
  const { controller } = await loadController(new Map())
  assert.doesNotThrow(() => controller.modelsRoot)
  assert.equal(controller.modelsRoot, '')
})

test('initial scan loads models from the configured folder into the persistent catalogue', async () => {
  const model = {
    repoId: 'test/model',
    revision: 'main',
    path: 'nested/main.gguf',
    localPath: 'D:/custom-models/nested/main.gguf',
    managedRoot: 'D:/custom-models',
    size: 128,
    downloadUrl: '',
    downloadedAt: 10,
    standalone: true
  }
  const settings = {
    schemaVersion: 2,
    revision: 0,
    service: {
      host: '127.0.0.1',
      port: 8080,
      modelsDirectory: 'D:/custom-models',
      revision: 0
    },
    initialBase: { contextSize: 8192, threads: 4 },
    modelProfiles: {}
  }
  const data = new Map<string, unknown>([
    ['flyenv-llama-cpp-models', { data: [] }],
    [SETTINGS_KEY, { data: settings }]
  ])
  const { controller, boundary } = await loadController(data)
  boundary.scanResult = { models: [model], skipped: [] }
  await controller.init()
  assert.equal(controller.localModels[0]?.localPath, model.localPath)
  assert.equal(controller.localModels[0]?.managedRoot, model.managedRoot)
  assert.equal((data.get('flyenv-llama-cpp-models') as any).data[0].localPath, model.localPath)
})

test('fresh installation with no catalogue or settings initializes and reuses persisted V2', async () => {
  const data = new Map<string, unknown>()
  const { controller } = await loadController(data)
  await controller.init()
  assert.deepEqual(controller.localModels, [])
  assert.equal(controller.settings.service.port, 8080)
  assert.deepEqual(controller.settings.modelProfiles, {})
  const persisted = data.get(SETTINGS_KEY)
  const { controller: reopened } = await loadController(data)
  await reopened.init()
  assert.deepEqual(reopened.settings, (persisted as any).data)
  assert.deepEqual(data.get(SETTINGS_KEY), persisted)
})

test('expired records use defaults but real storage failures propagate without writing defaults', async () => {
  const expired = new Map<string, unknown>([[SETTINGS_KEY, { expire: 1, data: { invalid: true } }]])
  const { controller } = await loadController(expired)
  await controller.init()
  assert.equal(controller.settings.schemaVersion, 2)
  const data = new Map<string, unknown>()
  const { controller: broken, boundary } = await loadController(data, true)
  await assert.rejects(broken.init(), /storage unavailable/)
  assert.equal(data.size, 0)
  boundary.failRead = false
  await broken.init()
  assert.equal(broken.settings.service.port, 8080)
})

test('invalid existing V2 remains an error and its stored value is retained', async () => {
  const saved = { data: { schemaVersion: 2, revision: 0 } }
  const data = new Map<string, unknown>([
    ['flyenv-llama-cpp-models', { data: [] }],
    [SETTINGS_KEY, saved]
  ])
  const { controller } = await loadController(data)
  await assert.rejects(controller.init(), /original data retained/)
  assert.deepEqual(data.get(SETTINGS_KEY), saved)
})

test('V2 and legacy read failures are not mistaken for absent settings', async () => {
  for (const key of [SETTINGS_KEY, 'flyenv-llama-cpp-settings']) {
    const data = new Map<string, unknown>([['flyenv-llama-cpp-models', { data: [] }]])
    const { controller } = await loadController(data, key)
    await assert.rejects(controller.init(), /storage unavailable/)
    assert.equal(data.has(SETTINGS_KEY), false)
  }
})
