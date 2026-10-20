import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspectGGUF } from '../fork/gguf'
import { scanModelsDirectory } from '../fork/models'
import { rankProjectors, modelFileKey } from '../shared/modelFile'
import { resolveModelReference } from '../fork/modelReferences'
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
