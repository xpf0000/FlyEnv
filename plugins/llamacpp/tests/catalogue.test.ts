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
  request: (method: string, args: any[]) => Promise<any>
) => {
  ;(globalThis as any).__llamaCatalogue = { data }
  const { LlamaCppController } = await loadBundle(join(pluginRoot, 'render/controller.ts'), {
    '@/util/Index': `export const reactiveBind=x=>x`,
    '@/util/Storage': `export const StorageGetAsync=async k=>globalThis.__llamaCatalogue.data.get(k);export const StorageSetAsync=async(k,v)=>globalThis.__llamaCatalogue.data.set(k,JSON.parse(JSON.stringify(v)))`,
    '@/util/Element': `export const MessageError=()=>{};export const MessageSuccess=()=>{}`,
    '@/util/NodeFn': `export const dialog={}`,
    '@lang/index': `export const AppI18n=()=>({global:{locale:'en'}});export const I18nT=x=>x`,
    '@/store/brew': `export const BrewStore=()=>({module:()=>({installed:[]})})`,
    '@/util/IPC': `export default {}`
  })
  return new LlamaCppController({ request: (method: string, args: any[]) => request(method, args) })
}

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
