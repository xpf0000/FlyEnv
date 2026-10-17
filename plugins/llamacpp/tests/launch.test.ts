import { test } from 'node:test'
import assert from 'node:assert/strict'
import { prepareLaunch } from '../fork/prepareLaunch'
import { parseRuntimeHelp } from '../fork/capabilities'
import { createModelProfile } from '../render/profiles'
const model: any = {
  repoId: 'a/b',
  revision: 'main',
  path: 'main.gguf',
  localPath: '/models/main.gguf',
  size: 8,
  standalone: true
}
const runtime: any = {
  bin: '/runtime/llama-server',
  path: '/runtime',
  version: 'test',
  flag: 'cpu'
}
const help =
  '--model FILE  model\n--host HOST  host\n--port N  port\n--ctx-size N  ctx\n--threads N  threads\n--n-gpu-layers N  layers\n--mmproj FILE  projector'
const deps: any = {
  modelsRoot: '/models',
  environment: async () => ({}),
  capabilities: async () => parseRuntimeHelp(help),
  resolve: async (ref: any, role: string) => ({
    path: role === 'main' ? '/models/main.gguf' : '/models/mmproj.gguf',
    role,
    fingerprint: { size: 8 }
  })
}
test('preview and executable launch contain a single explicit projector, with no silent fallback', async () => {
  const profile = createModelProfile(model, { contextSize: 8192, threads: 4 })
  profile.multimodal = {
    mode: 'projector',
    projector: { kind: 'external', path: '/models/mmproj.gguf' }
  }
  const input = {
    service: { host: '127.0.0.1', port: 8080, revision: 0 },
    profile,
    model,
    files: [model]
  }
  const report = await prepareLaunch(input, runtime, deps)
  assert.equal(report.prepared?.args.filter((x) => x === '--mmproj').length, 1)
  assert.equal(report.prepared?.args.at(-1), '/models/mmproj.gguf')
  const failed = await prepareLaunch(input, runtime, {
    ...deps,
    resolve: async () => {
      throw Error('missing file')
    }
  })
  assert.equal(failed.prepared, undefined)
  assert.equal(failed.issues[0].severity, 'blocking')
})
test('inherited projector cannot bypass explicit text mode and inherited sources remain visible', async () => {
  const profile = createModelProfile(model, {})
  const input = {
    service: { host: '127.0.0.1', port: 8080, revision: 0 },
    profile,
    model,
    files: [model]
  }
  profile.multimodal.mode = 'text'
  const blocked = await prepareLaunch(input, runtime, {
    ...deps,
    environment: async () => ({ LLAMA_ARG_MMPROJ: '/models/mmproj.gguf' })
  })
  assert.equal(blocked.prepared, undefined)
  assert.match(blocked.issues[0].message, /inherited|environment/i)
  const visible = await prepareLaunch(input, runtime, {
    ...deps,
    environment: async () => ({
      LLAMA_ARG_THREADS: '8',
      LLAMA_ARG_API_KEY: 'secret',
      MTMD_TEST: '1'
    })
  })
  assert.deepEqual(visible.prepared?.environmentSources, { LLAMA_ARG_THREADS: '8', MTMD_TEST: '1' })
  assert.equal(visible.prepared?.env.LLAMA_ARG_THREADS, '8')
})
test('explicit projector cannot be silently disabled through extra aliases', async () => {
  const profile = createModelProfile(model, {})
  profile.multimodal = {
    mode: 'projector',
    projector: { kind: 'external', path: '/models/mmproj.gguf' }
  }
  profile.extraArgsText = '--no-mmproj'
  const r = await prepareLaunch(
    { service: { host: '127.0.0.1', port: 8080, revision: 0 }, profile, model, files: [model] },
    runtime,
    {
      ...deps,
      capabilities: async () =>
        parseRuntimeHelp(help + '\n--mmproj-auto, --no-mmproj, --no-mmproj-auto  auto')
    }
  )
  assert.equal(r.prepared, undefined)
  assert.match(r.issues.at(-1)!.message, /conflict/i)
})
