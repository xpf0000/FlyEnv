import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, symlink, realpath, writeFile, rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  downloadHubModelFile,
  createModelDownloadDeps,
  scanModelsDirectory,
  deleteLocalModel
} from '../fork/models'
import { resolveModelReference } from '../fork/modelReferences'
import { modelFileKey } from '../shared/modelFile'

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
const bytes = Buffer.concat([
  Buffer.from('GGUF'),
  u32(3),
  u64(2),
  u64(1),
  str('general.architecture'),
  u32(8),
  str('llama'),
  ...['token_embd.weight', 'blk.0.attn.weight'].map((n) =>
    Buffer.concat([str(n), u32(1), u64(1), u32(0), u64(0)])
  )
])
const file = {
  repoId: 'test/model',
  revision: 'main',
  path: "Nested/My model's $(literal) & 中文.gguf",
  size: bytes.length,
  downloadUrl: ''
}

test('download, sidecar, scan and managed launch agree through a linked models directory', async (t) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'llama-paths-')))
  t.after(() => rm(root, { recursive: true, force: true }))
  const actual = join(root, 'Actual Models 中文'),
    link = join(root, "Models Link O'Brien & Spaces")
  await mkdir(actual)
  // Junctions exercise Windows aliases without requiring symlink privileges.
  await symlink(actual, link, process.platform === 'win32' ? 'junction' : 'dir')
  const downloaded = await downloadHubModelFile(
    'paths',
    file,
    link,
    new AbortController().signal,
    () => {},
    {
      ...createModelDownloadDeps(),
      download: async (_url, path) => {
        await writeFile(path, bytes)
      }
    }
  )
  assert.equal(downloaded.localPath, await realpath(downloaded.localPath))
  assert.equal(downloaded.managedRoot, actual)
  assert.equal(
    JSON.parse(await readFile(downloaded.localPath + '.flyenv.json', 'utf8')).localPath,
    downloaded.localPath
  )
  const scan = await scanModelsDirectory(link + '/')
  assert.equal(scan.models.length, 1)
  assert.equal(scan.models[0].localPath, downloaded.localPath)
  assert.equal(modelFileKey(scan.models[0]), modelFileKey(downloaded))
  const dependency = await resolveModelReference(
    { kind: 'managed', fileKey: modelFileKey(downloaded) },
    'main',
    { files: scan.models, modelsRoot: link }
  )
  assert.equal(dependency.path, downloaded.localPath)
  const sibling = join(root, 'Actual Models 中文 sibling', 'outside.gguf')
  await assert.rejects(deleteLocalModel(sibling, actual, undefined), /child/)
  // Use its canonical owner root, as the controller does.
  await deleteLocalModel(downloaded.localPath, downloaded.managedRoot!, undefined)
  await assert.rejects(readFile(downloaded.localPath), { code: 'ENOENT' })
})

test('an escaped hub-files link is rejected before any model download', async (t) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'llama-path-escape-')))
  t.after(() => rm(root, { recursive: true, force: true }))
  const models = join(root, 'Models'),
    outside = join(root, 'Outside')
  await mkdir(models)
  await mkdir(outside)
  await symlink(
    outside,
    join(models, 'hub-files'),
    process.platform === 'win32' ? 'junction' : 'dir'
  )
  let downloads = 0
  await assert.rejects(
    downloadHubModelFile('escape', file, models, new AbortController().signal, () => {}, {
      ...createModelDownloadDeps(),
      download: async () => {
        downloads++
        throw Error('Unexpected download')
      }
    }),
    /inside the managed models directory/
  )
  assert.equal(downloads, 0)
})
