import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { loadBundle, pluginRoot } from './harness'
test('redownload replaces catalogue identity and metadata retry never downloads twice', async () => {
  const old: any = {
    repoId: 'a/b',
    revision: 'main',
    path: 'main.gguf',
    localPath: '/models/main.gguf',
    size: 8,
    sha256: 'a'.repeat(64),
    standalone: true
  }
  const state: any = { data: new Map([['flyenv-llama-cpp-models', [old]]]), fail: false, count: 0 }
  ;(globalThis as any).__llamaDownload = state
  const sources = {
    '@/util/Index': `export const reactiveBind=x=>x`,
    '@/util/Storage': `export const StorageGetAsync=async k=>globalThis.__llamaDownload.data.get(k);export const StorageSetAsync=async(k,v)=>{const h=globalThis.__llamaDownload;if(h.fail&&k==='flyenv-llama-cpp-models')throw Error('disk');h.data.set(k,JSON.parse(JSON.stringify(v)))}`,
    '@/util/Element': `export const MessageError=()=>{};export const MessageSuccess=()=>{}`,
    '@/util/NodeFn': `export const dialog={}`,
    '@lang/index': `export const AppI18n=()=>({global:{locale:'en'}});export const I18nT=x=>x`,
    '@/store/brew': `export const BrewStore=()=>({module:()=>({installed:[]})})`,
    '@/util/IPC': `const ipc={send(_c,method,...args){return {then(cb){const h=globalThis.__llamaDownload;if(method==='downloadHubModelFile')h.count++;queueMicrotask(()=>cb('key',{code:0,data:method==='inspectLocalModelFiles'?args[0].map(path=>({path,status:'available'})):{...h.data.get('flyenv-llama-cpp-models')[0],sha256:'b'.repeat(64)}}))}}},off(){}};ipc.sendSensitive=ipc.send;export default ipc`
  }
  const { LlamaCppManager: manager } = await loadBundle(
    join(pluginRoot, 'render/controller.ts'),
    sources
  )
  await manager.init()
  state.fail = true
  const result = await manager.downloadModel(old)
  assert.equal(result.sha256, 'b'.repeat(64))
  assert.equal(manager.localModels[0].sha256, 'b'.repeat(64))
  assert.equal(manager.modelOperation.status, 'partial')
  state.fail = false
  await manager.retryModelRegistration()
  assert.equal(state.count, 1)
  assert.equal(manager.modelOperation.status, 'success')
  assert.equal(state.data.get('flyenv-llama-cpp-models')[0].sha256, 'b'.repeat(64))
})
