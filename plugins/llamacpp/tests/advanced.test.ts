import { test } from 'node:test'
import assert from 'node:assert/strict'
import { prepareLaunch } from '../fork/prepareLaunch'
import { createModelProfile } from '../render/profiles'
import { parseRuntimeHelp } from '../fork/capabilities'
const model: any = {
  repoId: 'a/b',
  revision: 'main',
  path: 'a.gguf',
  localPath: '/models/a.gguf',
  size: 8,
  standalone: true
}
const runtime: any = { bin: '/server', path: '/runtime', version: 'x', flag: 'cuda' }
const basic =
  '--model FILE  model\n--host HOST  host\n--port N  port\n--n-gpu-layers N  layers (auto, all)\n--ctx-size N  size (0=model)\n--threads N  threads\n'
const help =
  basic +
  '--flash-attn [on|off|auto]  attention\n--cache-type-k TYPE  cache\n--cache-type-v TYPE  cache\n--batch-size N  batch\n--ubatch-size N  micro\n--no-kv-offload  offload\n--kv-offload  on\n'
const deps: any = {
  modelsRoot: '/models',
  environment: async () => ({}),
  capabilities: async () => parseRuntimeHelp(help),
  resolve: async (_r: any, role: string) => ({
    path: '/models/a.gguf',
    role,
    fingerprint: { size: 8 }
  })
}
export const fixture = () => ({
  service: { host: '127.0.0.1', port: 8080, revision: 0 },
  profile: createModelProfile(model, { contextSize: 8192, threads: 4 }),
  model,
  files: [model]
})
test('emits explicit performance values and preserves false while omitting defaults', async () => {
  const i = fixture()
  i.profile.performance = {
    flashAttention: 'on',
    cacheTypeK: 'q8_0',
    cacheTypeV: 'f16',
    kvOffload: false
  }
  i.profile.base.batchSize = 512
  i.profile.base.ubatchSize = 128
  const r = await prepareLaunch(i, runtime, deps)
  assert.ok(r.prepared, r.issues.map((x) => x.message).join())
  const a = r.prepared.args
  assert.equal(a[a.indexOf('--cache-type-k') + 1], 'q8_0')
  assert.ok(a.includes('--no-kv-offload'))
  assert.equal(a[a.indexOf('--flash-attn') + 1], 'on')
  const d = await prepareLaunch(fixture(), runtime, deps)
  assert.equal(d.prepared?.args.includes('--cache-type-k'), false)
})
test('rejects invalid batch relationships instead of silently dropping values', async () => {
  const i = fixture()
  i.profile.base.batchSize = 64
  i.profile.base.ubatchSize = 128
  const r = await prepareLaunch(i, runtime, deps)
  assert.equal(r.prepared, undefined)
  assert.ok(r.issues.some((x) => x.severity === 'input'))
})
test('reasoning budget zero, JSON kwargs and seed zero survive command encoding', async () => {
  const i = fixture()
  i.profile.chat = {
    template: { kind: 'builtin', name: 'chatml' },
    jinja: true,
    reasoning: 'off',
    reasoningBudget: 0,
    templateKwargs: { enable_thinking: false }
  }
  i.profile.sampling = { temperature: 0, seed: 0, maxTokens: -1 }
  const more =
    '--jinja  enable\n--no-jinja  disable\n--reasoning [on|off|auto]  thinking\n--reasoning-budget N  budget\n--chat-template STRING  template\n--chat-template-kwargs STRING  kwargs\n--temp N  temperature\n--seed N  seed\n--n-predict N  output'
  const r = await prepareLaunch(i, runtime, {
    ...deps,
    capabilities: async () => parseRuntimeHelp(help + more)
  })
  assert.ok(r.prepared, r.issues.map((x) => x.message).join())
  const a = r.prepared.args
  assert.equal(a[a.indexOf('--reasoning-budget') + 1], '0')
  assert.equal(a[a.indexOf('--seed') + 1], '0')
  assert.equal(a[a.indexOf('--chat-template-kwargs') + 1], '{"enable_thinking":false}')
  assert.ok(a.indexOf('--jinja') < a.indexOf('--chat-template'))
})
test('MTP is distinct from a projector and a draft service', async () => {
  const i = fixture()
  i.profile.speculation = { mode: 'mtp', maxTokens: 3 }
  const r = await prepareLaunch(i, runtime, {
    ...deps,
    capabilities: async () =>
      parseRuntimeHelp(help + '--spec-type TYPE  strategy\n--spec-draft-n-max N  tokens')
  })
  assert.ok(r.prepared, r.issues.map((x) => x.message).join())
  assert.equal(r.prepared.args[r.prepared.args.indexOf('--spec-type') + 1], 'draft-mtp')
  assert.equal(r.prepared.args.includes('--mmproj'), false)
})
test('CPU launch keeps saved GPU settings dormant and older runtimes block unsupported explicit settings', async () => {
  const i = fixture()
  i.profile.backendOverrides.cuda = { gpuLayers: 30, gpuDevice: 'CUDA0,CUDA1', tensorSplit: [1, 1] }
  i.profile.multimodal.imageMinTokens = 16
  const cpu = await prepareLaunch(i, { ...runtime, flag: 'cpu' }, deps)
  assert.ok(cpu.prepared)
  assert.equal(cpu.prepared.args.includes('--device'), false)
  assert.equal(cpu.prepared.args.includes('--image-min-tokens'), false)
  assert.equal(i.profile.backendOverrides.cuda.gpuLayers, 30)
  i.profile.performance.loadMode = 'dio'
  const old = await prepareLaunch(i, runtime, deps)
  assert.equal(old.prepared, undefined)
  assert.equal(i.profile.performance.loadMode, 'dio')
})
test('MTP and projector can coexist, while clearly different draft tokenizer types block launch', async () => {
  const i = fixture()
  i.profile.multimodal = {
    mode: 'projector',
    projector: { kind: 'external', path: '/mmproj.gguf' }
  }
  i.profile.speculation = { mode: 'mtp' }
  const d = {
    ...deps,
    capabilities: async () =>
      parseRuntimeHelp(
        help +
          '\n--mmproj FILE  projector\n--spec-type TYPE  strategy\n--spec-draft-model FILE  draft'
      )
  }
  const mtp = await prepareLaunch(i, runtime, d)
  assert.ok(mtp.prepared)
  assert.ok(mtp.prepared.args.includes('--mmproj'))
  assert.ok(mtp.prepared.args.includes('draft-mtp'))
  i.profile.speculation = { mode: 'draft', file: { kind: 'external', path: '/draft.gguf' } }
  const failed = await prepareLaunch(i, runtime, {
    ...d,
    resolve: async (_r: any, role: any) => ({
      path: '/test.gguf',
      role,
      fingerprint: { size: 8 },
      description: {
        valid: true,
        role: role === 'projector' ? 'projector' : 'main',
        metadata: { 'tokenizer.ggml.model': role === 'draft' ? 'gpt2' : 'llama' }
      }
    })
  })
  assert.equal(failed.prepared, undefined)
  assert.match(failed.issues.at(-1)!.message, /tokenizer/)
})
