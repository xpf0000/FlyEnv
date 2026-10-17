import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LaunchController, ModuleMutationGate } from '../render/launchController'
import { ProfilesRepository } from '../render/profiles'
const model: any = {
  repoId: 'a/b',
  revision: 'main',
  path: 'a.gguf',
  localPath: '/a.gguf',
  size: 8,
  standalone: true
}
test('preflight rejects before stopping and preserves saved result when restart fails', async () => {
  const repo = new ProfilesRepository({ get: async () => undefined, set: async () => {} })
  await repo.load([model])
  let valid = false,
    restarts = 0
  const key = repo.current.selectedModelKey!
  const gate = new ModuleMutationGate()
  const c = new LaunchController({
    repository: repo,
    gate,
    input: () => ({
      service: repo.current.service,
      profile: repo.current.modelProfiles[key],
      model,
      files: [model]
    }),
    request: async (method: string) =>
      method === 'getLaunchState'
        ? { kind: 'running-unknown' }
        : valid
          ? { requestKey: 'x', issues: [], prepared: { requestKey: 'x' } }
          : { requestKey: 'x', issues: [{ severity: 'blocking', message: 'missing' }] },
    withInput: async (_i: any, _r: any, fn: any) => fn(),
    notify: () => {}
  } as any)
  const runtime: any = { bin: '/server', path: '/runtime' }
  const service: any = {
    run: true,
    running: false,
    restart: async () => {
      restarts++
      return 'stop failed'
    }
  }
  await assert.rejects(c.applyModel(repo.current.modelProfiles[key], runtime, service))
  assert.equal(restarts, 0)
  valid = true
  const result = await c.applyModel(repo.current.modelProfiles[key], runtime, service)
  assert.equal(result.saved, true)
  assert.equal(result.applied, false)
  assert.equal(restarts, 1)
})
test('admission coalesces identical commands and refuses competing mutations', async () => {
  const gate = new ModuleMutationGate()
  let release!: () => void
  const wait = new Promise<void>((r) => (release = r))
  const one = gate.run('apply', 'a', () => wait)
  assert.equal(
    gate.run('apply', 'a', () => Promise.resolve()),
    one
  )
  await assert.rejects(gate.run('delete', 'b', () => Promise.resolve()))
  release()
  await one
  await gate.run('delete', 'b', () => Promise.resolve())
})
test('late preview completion does not overwrite newer model preview', async () => {
  const pending: ((v: any) => void)[] = []
  const c = new LaunchController({ request: () => new Promise((r) => pending.push(r)) } as any)
  const a = c.preview({ profile: { modelKey: 'a' } } as any, { bin: '/server' })
  const b = c.preview({ profile: { modelKey: 'b' } } as any, { bin: '/server' })
  pending[1]({ requestKey: 'b', issues: [] })
  await b
  pending[0]({ requestKey: 'a', issues: [] })
  await a
  assert.equal(c.previewOperation?.report?.requestKey, 'b')
})
test('a later status request wins over a slow previous status response', async () => {
  const pending: ((v: any) => void)[] = []
  const gate = new ModuleMutationGate()
  const c = new LaunchController({
    gate,
    request: () => new Promise((r) => pending.push(r))
  } as any)
  const a = c.refreshState(),
    b = c.refreshState()
  pending[1]({ kind: 'running-known' })
  await b
  pending[0]({ kind: 'stopped' })
  await a
  assert.equal(c.state.kind, 'running-known')
})
test('invalid service drafts never reach durable storage', async () => {
  const repo = new ProfilesRepository({ get: async () => undefined, set: async () => {} })
  await repo.load([])
  const c = new LaunchController({
    repository: repo,
    gate: new ModuleMutationGate(),
    notify: () => {}
  } as any)
  await assert.rejects(c.saveService({ ...repo.current.service, port: 0 }))
  assert.equal(repo.current.service.port, 8080)
})
test('service apply persists the admitted snapshot even if the editor changes during preflight', async () => {
  const repo = new ProfilesRepository({ get: async () => undefined, set: async () => {} })
  const file: any = {
    repoId: 'a/b',
    revision: 'main',
    path: 'a.gguf',
    localPath: '/a',
    size: 1,
    standalone: true
  }
  await repo.load([file])
  const key = repo.current.selectedModelKey!
  let release!: (r: any) => void
  let started: any
  const c = new LaunchController({
    repository: repo,
    gate: new ModuleMutationGate(),
    input: () => ({
      service: repo.current.service,
      profile: repo.current.modelProfiles[key],
      model: file,
      files: [file]
    }),
    request: async (method: string) =>
      method === 'prepareModelLaunch'
        ? new Promise((r) => (release = r))
        : { kind: 'running-known', active: { launch: { requestKey: 'admitted' } } },
    withInput: async (i: any, _r: any, fn: any) => {
      started = i
      return fn()
    },
    notify: () => {}
  } as any)
  const draft = { ...repo.current.service, port: 9000 }
  const applied = c.applyService(
    draft,
    {} as any,
    { run: false, running: false, start: async () => true } as any
  )
  await Promise.resolve()
  draft.port = 9001
  release({ requestKey: 'admitted', issues: [], prepared: { requestKey: 'admitted' } })
  await applied
  assert.equal(repo.current.service.port, 9000)
  assert.equal(started.service.port, 9000)
})
test('late device discovery cannot replace a newer runtime selection', async () => {
  const pending: Record<string, (x: any) => void> = {}
  const c = new LaunchController({
    request: async (method: string, r: any) =>
      method === 'getRuntimeCapabilities'
        ? { byAlias: { '--list-devices': {} } }
        : new Promise((resolve) => (pending[r.bin] = resolve))
  } as any)
  const a = c.detectRuntime({ bin: 'A' })
  await Promise.resolve()
  await Promise.resolve()
  const b = c.detectRuntime({ bin: 'B' })
  await Promise.resolve()
  await Promise.resolve()
  pending.B([{ name: 'CUDA0', description: 'new' }])
  await b
  pending.A([{ name: 'CUDA1', description: 'old' }])
  await a
  assert.equal(c.runtimeCapabilities?.bin, 'B')
  assert.equal(c.runtimeCapabilities?.devices?.[0].name, 'CUDA0')
})
test('apply terminal state remains reactive after the asynchronous service boundary', async () => {
  const { reactive, watch, nextTick } = await import('vue')
  const repo = new ProfilesRepository({ get: async () => undefined, set: async () => {} })
  await repo.load([model])
  const key = repo.current.selectedModelKey!
  const seen: string[] = []
  const c = reactive(
    new LaunchController({
      repository: repo,
      gate: new ModuleMutationGate(),
      input: () => ({
        service: repo.current.service,
        profile: repo.current.modelProfiles[key],
        model,
        files: [model]
      }),
      request: async (method: string) =>
        method === 'getLaunchState'
          ? { kind: 'running-known', active: { launch: { requestKey: 'a' } } }
          : { issues: [], prepared: { requestKey: 'a' } },
      withInput: async (_i: any, _r: any, fn: any) => fn(),
      notify: () => {}
    } as any)
  )
  const unwatch = watch(
    () => c.applyOperation?.status,
    (v) => {
      if (v) seen.push(v)
    }
  )
  await c.applyModel(
    repo.current.modelProfiles[key],
    {} as any,
    { run: false, running: false, start: async () => true } as any
  )
  await nextTick()
  unwatch()
  assert.equal(seen.at(-1), 'success')
})
