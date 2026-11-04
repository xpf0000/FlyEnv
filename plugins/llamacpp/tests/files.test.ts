import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm, realpath, utimes, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspectGGUF } from '../fork/gguf'
import { scanModelsDirectory } from '../fork/models'
import { rankProjectors, modelFileKey, managedReference } from '../shared/modelFile'
import { resolveModelReference } from '../fork/modelReferences'
import { prepareLaunch } from '../fork/prepareLaunch'
import { parseRuntimeHelp } from '../fork/capabilities'
import { createModelProfile } from '../render/profiles'
const u32 = (n: number) => {
  const b = Buffer.alloc(4)
  b.writeUInt32LE(n)
  return b
}
const u64 = (n: number) => {
  const b = Buffer.alloc(8)
  b.writeBigUInt64LE(BigInt(n))
  return b
}
const str = (s: string) => Buffer.concat([u64(Buffer.byteLength(s)), Buffer.from(s)])
export const gguf = (arch: string, names: string[]) =>
  Buffer.concat([
    Buffer.from('GGUF'),
    u32(3),
    u64(names.length),
    u64(1),
    str('general.architecture'),
    u32(8),
    str(arch),
    ...names.map((n) => Buffer.concat([str(n), u32(1), u64(1), u32(0), u64(0)]))
  ])
test('recognises projector metadata without accepting it as a main model and rejects corrupt references', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'llama-files-'))
  try {
    const p = join(dir, 'mmproj.gguf')
    await writeFile(p, gguf('clip', ['v.patch_embd.weight']))
    assert.equal((await inspectGGUF(p)).role, 'projector')
    const dep = await resolveModelReference({ kind: 'external', path: p }, 'projector', {
      files: [],
      modelsRoot: dir
    })
    assert.equal(dep.path, await realpath(p))
    await writeFile(p, 'broken')
    await assert.rejects(
      resolveModelReference({ kind: 'external', path: p }, 'projector', {
        files: [],
        modelsRoot: dir
      })
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
test('ranks immutable source evidence above mutable main without binding candidates', () => {
  const model: any = {
    repoId: 'test/a',
    revision: 'main',
    resolvedRevision: 'abc',
    path: 'q4.gguf'
  }
  const weak: any = { repoId: 'test/a', revision: 'main', path: 'mmproj-A.gguf' }
  const strong: any = { ...weak, path: 'mmproj-B.gguf', resolvedRevision: 'abc' }
  assert.equal(
    modelFileKey(rankProjectors(model, [weak, strong])[0].file),
    '["test/a","main","mmproj-B.gguf"]'
  )
  assert.equal(model.projector, undefined)
})
test('managed fingerprint checks current sidecar evidence even when renderer catalogue is stale', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'llama-sidecar-'))
  try {
    const path = join(dir, 'mmproj.gguf')
    await writeFile(path, gguf('clip', ['v.patch_embd.weight']))
    const size = (await import('node:fs/promises').then((fs) => fs.stat(path))).size
    const old: any = {
      repoId: 'a/b',
      revision: 'main',
      path: 'mmproj.gguf',
      localPath: path,
      size,
      sha256: 'a'.repeat(64)
    }
    await writeFile(path + '.flyenv.json', JSON.stringify({ ...old, sha256: 'b'.repeat(64) }))
    await assert.rejects(
      resolveModelReference(
        {
          kind: 'managed',
          fileKey: modelFileKey(old),
          fingerprint: { size, sha256: 'a'.repeat(64) }
        },
        'projector',
        { files: [old], modelsRoot: dir }
      ),
      /changed/i
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
test('metadata-recognised projectors with arbitrary filenames remain selectable', () => {
  const model: any = { repoId: 'a/b', revision: 'main', path: 'main.gguf' }
  const file: any = {
    ...model,
    path: 'siglip.gguf',
    standalone: false,
    description: { valid: true, role: 'projector', architecture: 'clip' }
  }
  assert.equal(rankProjectors(model, [file]).length, 1)
})
test('scans nested selected-folder GGUF files and skips invalid candidates independently', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'llama-model-folder-'))
  try {
    const nested = join(dir, 'hub-files', 'repo-a')
    await import('node:fs/promises').then(({ mkdir }) => mkdir(nested, { recursive: true }))
    const modelPath = join(nested, 'main.gguf')
    const invalidPath = join(nested, 'broken.gguf')
    await writeFile(modelPath, gguf('llama', ['token_embd.weight', 'blk.0.attn.weight']))
    await writeFile(
      `${modelPath}.flyenv.json`,
      JSON.stringify({
        repoId: 'test/model',
        revision: 'main',
        path: 'main.gguf',
        localPath: modelPath,
        downloadedAt: 1
      })
    )
    await writeFile(invalidPath, 'not a GGUF')

    const scan = await scanModelsDirectory(dir)
    assert.equal(scan.models.length, 1)
    assert.equal(scan.models[0].localPath, await realpath(modelPath))
    assert.equal(scan.models[0].managedRoot, await realpath(dir))
    assert.equal(scan.models[0].standalone, true)
    assert.equal(scan.models[0].repoId, 'test/model')
    assert.equal(scan.models[0].revision, 'main')
    assert.equal(scan.skipped.length, 1)
    assert.match(scan.skipped[0], /broken\.gguf/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('discovered local models launch without sidecars and detect same-size replacement', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'llama-local-launch-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const path = join(dir, 'main.gguf')
  await writeFile(path, gguf('llama', ['token_embd.weight', 'blk.0.attn.weight']))
  await utimes(path, 100, 100)
  const { models } = await scanModelsDirectory(dir)
  const model = models[0]
  const profile = createModelProfile(model, { contextSize: 8192, threads: 4 })
  profile.multimodal.mode = 'text'
  const input = {
    service: { host: '127.0.0.1', port: 8080, revision: 0 },
    profile,
    model,
    files: models
  }
  const deps = {
    // Changing the selected root must not invalidate files in the old root.
    modelsRoot: join(dir, 'new-root'),
    environment: async () => ({}),
    capabilities: async () =>
      parseRuntimeHelp(
        '--model FILE  model\n--host HOST  host\n--port N  port\n--ctx-size N  ctx\n--threads N  threads\n--n-gpu-layers N  layers\n--no-mmproj  text only'
      )
  }
  const runtime: any = {
    bin: '/runtime/llama-server',
    path: '/runtime',
    version: 'test',
    flag: 'cpu'
  }
  const report = await prepareLaunch(input, runtime, deps)
  assert.ok(report.prepared, report.issues.map((issue) => issue.message).join('\n'))
  assert.equal(report.prepared.dependencies[0].path, await realpath(path))
  assert.ok(report.issues.some((issue) => issue.code === 'source-unverified'))
  await assert.rejects(readFile(path + '.flyenv.json'), { code: 'ENOENT' })
  await utimes(path, 200, 200)
  const changed = await prepareLaunch(input, runtime, deps)
  assert.equal(changed.prepared, undefined)
  assert.match(changed.issues.at(-1)!.message, /changed/i)
})

test('invalid or misplaced sidecars do not prevent discovered local references from resolving', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'llama-local-sidecar-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const path = join(dir, 'projector.gguf')
  await writeFile(path, gguf('clip', ['v.patch_embd.weight']))
  for (const content of [
    '{broken',
    JSON.stringify({
      repoId: 'a/b',
      revision: 'main',
      path: 'other.gguf',
      localPath: join(dir, 'missing.gguf')
    })
  ]) {
    await writeFile(path + '.flyenv.json', content)
    const { models } = await scanModelsDirectory(dir)
    const dep = await resolveModelReference(
      { kind: 'managed', fileKey: modelFileKey(models[0]) },
      'projector',
      { files: models, modelsRoot: dir }
    )
    assert.equal(dep.path, await realpath(path))
    assert.equal(dep.fingerprint.sha256, undefined)
    assert.equal(await readFile(path + '.flyenv.json', 'utf8'), content)
  }
})

test('managed local projector references retain the fingerprint of the selected file', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'llama-projector-fingerprint-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const path = join(dir, 'projector.gguf')
  await writeFile(path, gguf('clip', ['v.patch_embd.weight']))
  await utimes(path, 100, 100)
  const { models } = await scanModelsDirectory(dir)
  const ref = managedReference(models[0])
  const context = { files: models, modelsRoot: dir }
  await resolveModelReference(ref, 'projector', context)
  await utimes(path, 200, 200)
  await assert.rejects(resolveModelReference(ref, 'projector', context), /changed/i)
})
