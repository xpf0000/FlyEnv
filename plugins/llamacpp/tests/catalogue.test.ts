import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadBundle, pluginRoot } from './harness'
import { inspectLocalModelFiles } from '../fork/localModelFiles'
import { createModelProfile, SETTINGS_KEY } from '../render/profiles'
import { modelFileKey } from '../shared/modelFile'

const loadController = async (
  data: Map<string, any>,
  request: (method: string, args: any[]) => Promise<any>,
  discover = async (): Promise<any> => ({ models: [], skipped: [] }),
  write = async (key: string, value: any) => {
    data.set(key, JSON.parse(JSON.stringify(value)))
  }
) => {
  ;(globalThis as any).__llamaCatalogue = { data, write }
  const { LlamaCppController } = await loadBundle(join(pluginRoot, 'render/controller.ts'), {
    '@/util/Index': `export const reactiveBind=x=>x`,
    '@/util/Storage': `export const StorageGetAsync=async k=>globalThis.__llamaCatalogue.data.get(k);export const StorageSetAsync=(k,v)=>globalThis.__llamaCatalogue.write(k,v)`,
    '@/util/Element': `export const MessageError=()=>{};export const MessageSuccess=()=>{}`,
    '@/util/NodeFn': `export const dialog={}`,
    '@lang/index': `export const AppI18n=()=>({global:{locale:'en'}});export const I18nT=x=>x`,
    '@/store/brew': `export const BrewStore=()=>({module:()=>({installed:[]})})`,
    '@/util/IPC': `export default {}`
  })
  return new LlamaCppController({
    request: (method: string, args: any[]) =>
      method === 'scanModelsDirectory' ? discover() : request(method, args)
  })
}

test('failed file inspection retains the original error and leaves checking state', async () => {
  const manager = await loadController(
    new Map(),
    async () => {
      throw Error('file checks unavailable')
    },
    async () => ({
      models: [{ repoId: 'a/b', revision: 'main', path: 'a.gguf', localPath: '/models/a.gguf' }],
      skipped: []
    })
  )
  await manager.init()
  await assert.rejects(manager.refreshLocalModels(), /file checks unavailable/)
  assert.equal(manager.localModelScan.status, 'failed')
  assert.match(manager.localModelScan.error, /file checks unavailable/)
  assert.equal(manager.localModels.length, 0)
})

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}
const catalogueModel = (name: string, downloadedAt = 1) => ({
  repoId: 'test/model',
  revision: 'main',
  path: `${name}.gguf`,
  localPath: `/models/${name}.gguf`,
  size: 8,
  standalone: true,
  downloadedAt,
  downloadUrl: ''
})

test('late discovery preserves completed downloads and replacements in memory and storage', async () => {
  const old = catalogueModel('old'),
    added = catalogueModel('added', 3)
  const data = new Map<string, any>([['flyenv-llama-cpp-models', [old]]])
  const started = deferred<void>(),
    result = deferred<any>()
  let hold = false
  const manager = await loadController(
    data,
    async (method, args) => {
      if (method === 'downloadHubModelFile')
        return { ...args[1], downloadedAt: args[1].path === 'old.gguf' ? 2 : 3 }
      assert.equal(method, 'inspectLocalModelFiles')
      return args[0].map((path: string) => ({ path, status: 'available' }))
    },
    async () => {
      if (!hold) return { models: [], skipped: [] }
      started.resolve()
      return result.promise
    }
  )
  await manager.init()
  hold = true
  const scan = manager.refreshLocalModels()
  await started.promise
  await manager.downloadModel(old)
  await manager.downloadModel(added)
  result.resolve({ models: [old], skipped: [] })
  await scan
  assert.deepEqual(
    manager.localModels.map((model: any) => [model.path, model.downloadedAt]),
    [
      ['old.gguf', 2],
      ['added.gguf', 3]
    ]
  )
  assert.deepEqual(
    data.get('flyenv-llama-cpp-models').map((model: any) => [model.path, model.downloadedAt]),
    [
      ['old.gguf', 2],
      ['added.gguf', 3]
    ]
  )
})

test('late discovery cannot restore a file deleted during the scan', async () => {
  const file = catalogueModel('deleted')
  const data = new Map<string, any>([['flyenv-llama-cpp-models', [file]]])
  const started = deferred<void>(),
    result = deferred<any>()
  let hold = false
  const manager = await loadController(
    data,
    async (method, args) => {
      if (method === 'deleteLocalModel') return true
      assert.equal(method, 'inspectLocalModelFiles')
      return args[0].map((path: string) => ({ path, status: 'available' }))
    },
    async () => {
      if (!hold) return { models: [], skipped: [] }
      started.resolve()
      return result.promise
    }
  )
  await manager.init()
  hold = true
  const scan = manager.refreshLocalModels()
  await started.promise
  await manager.deleteModel(file)
  result.resolve({ models: [file], skipped: [] })
  await scan
  assert.deepEqual(manager.localModels, [])
  assert.deepEqual(data.get('flyenv-llama-cpp-models'), [])
})

test('a delayed scan write cannot overwrite a later download registration', async () => {
  const file = catalogueModel('found'),
    added = catalogueModel('downloaded')
  const data = new Map<string, any>()
  const writing = deferred<void>(),
    release = deferred<void>(),
    downloaded = deferred<void>()
  let hold = false,
    activeWrites = 0,
    maxWrites = 0
  const manager = await loadController(
    data,
    async (method, args) => {
      if (method === 'downloadHubModelFile') {
        downloaded.resolve()
        return added
      }
      assert.equal(method, 'inspectLocalModelFiles')
      return args[0].map((path: string) => ({ path, status: 'available' }))
    },
    async () => ({ models: hold ? [file] : [], skipped: [] }),
    async (key, value) => {
      if (key === 'flyenv-llama-cpp-models') {
        activeWrites++
        maxWrites = Math.max(maxWrites, activeWrites)
        if (hold && value.length === 1 && value[0].path === 'found.gguf') {
          writing.resolve()
          await release.promise
        }
        data.set(key, JSON.parse(JSON.stringify(value)))
        activeWrites--
      } else data.set(key, JSON.parse(JSON.stringify(value)))
    }
  )
  await manager.init()
  hold = true
  const scan = manager.refreshLocalModels()
  await writing.promise
  const download = manager.downloadModel(added)
  await downloaded.promise
  await new Promise((r) => setImmediate(r))
  release.resolve()
  await Promise.all([scan, download])
  assert.equal(maxWrites, 1)
  assert.deepEqual(
    data.get('flyenv-llama-cpp-models').map((model: any) => model.path),
    ['found.gguf', 'downloaded.gguf']
  )
  assert.deepEqual(
    manager.localModels.map((model: any) => model.path),
    ['found.gguf', 'downloaded.gguf']
  )
})

test('failed directory discovery still inspects registered files and reports a partial scan', async () => {
  const file = {
    repoId: 'a/b',
    revision: 'main',
    path: 'a.gguf',
    localPath: '/models/a.gguf',
    size: 8,
    standalone: true
  }
  const data = new Map<string, any>([['flyenv-llama-cpp-models', [file]]])
  const manager = await loadController(
    data,
    async (_method, args) => args[0].map((path: string) => ({ path, status: 'available' })),
    async () => {
      throw Error('selected folder unavailable')
    }
  )
  await manager.init()
  assert.equal(manager.localModels[0]?.localPath, file.localPath)
  assert.equal(manager.localModelScan.status, 'partial')
  assert.match(manager.localModelScan.error, /selected folder unavailable/)
  assert.deepEqual(data.get('flyenv-llama-cpp-models'), [file])
})

test('missing model files disappear from available models while records and profiles survive restoration', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'llama-catalogue-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const files = ['Q3.gguf', 'Q4.gguf'].map((path) => ({
    repoId: 'test/model',
    revision: 'main',
    path,
    localPath: join(root, path),
    size: 8,
    standalone: true,
    downloadedAt: 1,
    downloadUrl: ''
  }))
  await writeFile(files[0].localPath, 'GGUFdata')
  const profiles = Object.fromEntries(
    files.map((f) => [modelFileKey(f), createModelProfile(f, {})])
  )
  const settings = {
    schemaVersion: 2,
    revision: 0,
    service: { host: '127.0.0.1', port: 8080, revision: 0 },
    initialBase: {},
    selectedModelKey: modelFileKey(files[1]),
    modelProfiles: profiles
  }
  const data = new Map<string, any>([
    ['flyenv-llama-cpp-models', files],
    [SETTINGS_KEY, settings]
  ])
  const manager = await loadController(data, async (method, args) => {
    assert.equal(method, 'inspectLocalModelFiles')
    return inspectLocalModelFiles(args[0])
  })
  await manager.init()
  assert.deepEqual(
    manager.localModels.map((f: any) => f.path),
    ['Q3.gguf']
  )
  assert.equal(manager.selectedModel, undefined)
  assert.deepEqual(data.get(SETTINGS_KEY), settings)
  assert.deepEqual(data.get('flyenv-llama-cpp-models'), files)
  await writeFile(files[1].localPath, 'GGUFdata')
  await manager.refreshLocalModels()
  assert.equal(manager.selectedModel.localPath, files[1].localPath)
  await rm(files[0].localPath)
  await manager.refreshLocalModels()
  assert.deepEqual(
    manager.localModels.map((f: any) => f.path),
    ['Q4.gguf']
  )
  assert.deepEqual(data.get(SETTINGS_KEY), settings)
})

test('one unverifiable file does not discard valid siblings or pretend the file is missing', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'llama-catalogue-items-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const good = join(root, 'good.gguf'),
    denied = join(root, 'denied.gguf'),
    missing = join(root, 'missing.gguf')
  await writeFile(good, 'GGUFdata')
  await writeFile(denied, 'GGUFdata')
  const result = await inspectLocalModelFiles([denied, missing, good], {
    stat: async (path) => {
      if (path === denied) throw Object.assign(Error('denied'), { code: 'EACCES' })
      return stat(path)
    }
  })
  assert.deepEqual(
    result.map((r) => r.status),
    ['unverified', 'missing', 'available']
  )
  assert.match(result[0].reason!, /denied/)
})

test('catalogue refresh coalesces and a late missing result cannot hide a completed redownload', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'llama-catalogue-race-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const file: any = {
    repoId: 'test/model',
    revision: 'main',
    path: 'main.gguf',
    localPath: join(root, 'main.gguf'),
    size: 8,
    standalone: true,
    downloadedAt: 1
  }
  const data = new Map<string, any>([['flyenv-llama-cpp-models', [file]]])
  let hold = false,
    fail = false,
    checks = 0,
    release!: (r: any) => void
  const manager = await loadController(data, async (method, args) => {
    if (method === 'downloadHubModelFile') {
      await writeFile(file.localPath, 'GGUFdata')
      return { ...file, downloadedAt: 2 }
    }
    assert.equal(method, 'inspectLocalModelFiles')
    checks++
    if (fail) throw Error('scan unavailable')
    const result = await inspectLocalModelFiles(args[0])
    return hold
      ? new Promise((r) => {
          release = () => r(result)
        })
      : result
  })
  await manager.init()
  hold = true
  const scan = manager.refreshLocalModels(),
    again = manager.refreshLocalModels()
  while (!release) await new Promise((r) => setImmediate(r))
  assert.equal(checks, 2)
  await manager.downloadModel(file)
  release(undefined)
  await Promise.all([scan, again])
  assert.equal(manager.localModels.length, 1)
  assert.equal(manager.localModels[0].downloadedAt, 2)
  hold = false
  fail = true
  await assert.rejects(manager.refreshLocalModels(), /scan unavailable/)
  assert.equal(manager.localModels.length, 0)
  assert.equal(data.get('flyenv-llama-cpp-models')[0].downloadedAt, 2)
  fail = false
  await manager.refreshLocalModels()
  assert.equal(manager.localModels.length, 1)
})
