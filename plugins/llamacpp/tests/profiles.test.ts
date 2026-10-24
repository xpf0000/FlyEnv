import { test } from 'node:test'
import assert from 'node:assert/strict'
import { migrateSettings, ProfilesRepository, SETTINGS_KEY } from '../render/profiles'
const file = (name: string) => ({
  repoId: 'test/model',
  revision: 'main',
  path: name,
  localPath: '/models/' + name,
  size: 8,
  downloadedAt: 1,
  downloadUrl: '',
  standalone: !name.includes('mmproj')
})
const files = [file('a.gguf'), file('b.gguf'), file('mmproj.gguf')]
test('migration isolates model settings and never associates auxiliary files', () => {
  const s = migrateSettings(
    {
      profile: {
        host: '127.0.0.1',
        port: 8080,
        contextSize: 8192,
        threads: 4,
        gpuLayers: 0,
        backend: 'cpu'
      },
      selectedModel: files[0]
    },
    files
  )
  const ps = Object.values(s.modelProfiles)
  assert.equal(ps.length, 2)
  assert.equal(ps[0].base.contextSize, 8192)
  assert.equal(ps[0].multimodal.mode, 'unset')
  ps[0].extraArgsText = '--no-mmap'
  assert.equal(ps[1].extraArgsText, '')
  assert.equal(s.service.port, 8080)
})
test('failed persistence never publishes and concurrent model commits preserve siblings', async () => {
  const data = new Map<string, unknown>()
  let fail = false
  const repo = new ProfilesRepository({
    get: async (k) => data.get(k),
    set: async (k, v) => {
      if (fail) throw Error('disk')
      data.set(k, v)
    }
  })
  await repo.load(files)
  const before = structuredClone(repo.current)
  const [a, b] = Object.values(repo.current.modelProfiles)
  fail = true
  await assert.rejects(repo.commitProfile({ ...a, extraArgsText: '--no-mmap' }, a.revision))
  assert.deepEqual(repo.current, before)
  fail = false
  await Promise.all([
    repo.commitProfile({ ...a, extraArgsText: '--no-mmap' }, a.revision),
    repo.commitProfile({ ...b, extraArgsText: '--offline' }, b.revision)
  ])
  assert.equal(repo.current.modelProfiles[a.modelKey].extraArgsText, '--no-mmap')
  assert.equal(repo.current.modelProfiles[b.modelKey].extraArgsText, '--offline')
  await assert.rejects(repo.commitProfile(a, a.revision), /stale/i)
  assert.ok(data.has(SETTINGS_KEY))
})
test('service models directory persists and is restored on reload', async () => {
  const data = new Map<string, unknown>()
  const storage = {
    get: async (key: string) => data.get(key),
    set: async (key: string, value: unknown) => data.set(key, value)
  }
  const repo = new ProfilesRepository(storage)
  await repo.load(files)
  await repo.commitService(
    { ...repo.current.service, modelsDirectory: 'D:/AI/llama-models' },
    repo.current.service.revision
  )
  const reopened = new ProfilesRepository(storage)
  await reopened.load(files)
  assert.equal(reopened.current.service.modelsDirectory, 'D:/AI/llama-models')
})
test('shared projector references remain visible after switching selected models', async () => {
  const { collectModelReferences } = await import('../render/profiles')
  const s = migrateSettings(undefined, files)
  const [a, b] = Object.values(s.modelProfiles)
  a.multimodal = { mode: 'projector', projector: { kind: 'managed', fileKey: 'projector' } }
  b.multimodal = { ...a.multimodal }
  assert.equal(collectModelReferences(s, 'projector', files).length, 2)
  a.multimodal.mode = 'text'
  assert.equal(collectModelReferences(s, 'projector', files).length, 1)
})
