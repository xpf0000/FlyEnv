import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { loadBundle, pluginRoot } from './harness'
test('fork snapshots stay tied to the running process and protect active dependencies', async (t) => {
  const baseDir = await mkdtemp(join(tmpdir(), 'llama-no-confirm-'))
  t.after(() => rm(baseDir, { recursive: true, force: true }))
  const h: any = {
    pid: '43210',
    live: true,
    failStop: false,
    spawnArgs: undefined,
    processReads: 0,
    prepared: {
      bin: '/runtime/llama-server',
      args: ['--model', '/models/main.gguf', '--mmproj', '/models/mmproj.gguf'],
      env: {},
      cwd: '/runtime',
      runtimeKey: 'x',
      requestKey: 'config',
      dependencies: [{ path: '/models/mmproj.gguf', role: 'projector' }],
      resolvedInput: {}
    }
  }
  ;(globalThis as any).__llamaFork = h
  ;(globalThis as any).Server = { BaseDir: baseDir }
  const sources = {
    '@fork/module/Base': `import {ForkPromise} from ${JSON.stringify(join(pluginRoot, '../../src/shared/ForkPromise.ts'))};export class Base {pidPath='';readPidFromFile(){return Promise.resolve(globalThis.__llamaFork.live?globalThis.__llamaFork.pid:'')} _stopServer(){return new ForkPromise((resolve,reject)=>{if(globalThis.__llamaFork.failStop)reject(Error('stop failed'));else {globalThis.__llamaFork.live=false;resolve(true)}})}}`,
    '@fork/Fn': `export const AppLog=(level,message)=>({level,message})`,
    '@fork/util/Zip': `export const unpack=()=>{throw Error('unexpected unpack')};export const zipUnpack=unpack`,
    '@fork/util/Axios': `export const getAxiosProxy=()=>false`,
    '@fork/util/ServiceStart': `export const serviceStartSpawn=async p=>{globalThis.__llamaFork.spawnArgs=p.execArgs;return {'APP-Service-Start-PID':globalThis.__llamaFork.pid}}`,
    '@shared/StopProcessList': `export const StopProcessListFetch=async()=>{globalThis.__llamaFork.processReads++;return globalThis.__llamaFork.live?[{PID:globalThis.__llamaFork.pid,COMMAND:globalThis.__llamaFork.command??'/runtime/llama-server --model /models/main.gguf'}]:[]};export const fetchStopProcessListLocal=StopProcessListFetch`,
    [join(pluginRoot, 'fork/prepareLaunch')]:
      `export const modelRoot=()=>'/models';export const prepareLaunch=async()=>({requestKey:'config',issues:[],prepared:globalThis.__llamaFork.prepared})`,
    [join(pluginRoot, 'fork/observation')]:
      `export const observeRuntime=async()=>({modalities:['text','image']})`,
    [join(pluginRoot, 'fork/config')]:
      `export const createApiKeyFile=async()=>'';export const formatUrlHost=x=>x;export const waitForServerHealth=async()=>{}`
  }
  const { createLlamaCppModule } = await loadBundle(
    join(pluginRoot, 'fork/LlamaCpp/index.ts'),
    sources
  )
  const module = createLlamaCppModule()
  const version: any = { bin: '/runtime/llama-server', path: '/runtime', version: 'x' }
  await module
    ._startServer(version, { service: { host: '127.0.0.1', port: 8080 }, model: { repoId: 'a/b' } })
    .on(() => {})
  assert.deepEqual(h.spawnArgs, ['--model', '/models/main.gguf', '--mmproj', '/models/mmproj.gguf'])
  assert.equal(h.processReads, 0)
  assert.deepEqual(await readdir(baseDir), [])
  const state = await module.getLaunchState()
  assert.equal(state.kind, 'running-known')
  assert.deepEqual(state.active.observation.modalities, ['text', 'image'])
  await assert.rejects(
    Promise.resolve(module.deleteLocalModel('/models/mmproj.gguf')),
    /dependencies/
  )
  const restarted = createLlamaCppModule()
  await assert.rejects(
    Promise.resolve(restarted.deleteLocalModel('/models/inactive.gguf')),
    /unconfirmed|unknown/i
  )
  h.failStop = true
  await assert.rejects(Promise.resolve(module._stopServer(version)), /stop failed/)
  assert.equal((await module.getLaunchState()).kind, 'running-known')
  h.live = false
  const exited = await module.getLaunchState()
  assert.equal(exited.kind, 'stopped')
  assert.equal(exited.active, undefined)
  assert.equal(exited.lastSuccess.launch.requestKey, 'config')
  await module.deleteLocalModel(join(baseDir, 'llama-cpp/models/nonexistent.gguf'))
  h.failStop = false
  await module._stopServer(version)
  assert.equal((await module.getLaunchState()).kind, 'stopped')
  h.live = true
  await module
    ._startServer(version, { service: { host: '127.0.0.1', port: 8080 }, model: { repoId: 'a/b' } })
    .on(() => {})
  h.command = '/bin/sleep 60'
  assert.equal((await module.getLaunchState()).kind, 'stopped')
  assert.equal((await module.getLaunchState()).active, undefined)
})
