import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, mkdir, rm, writeFile, readFile, stat, chmod } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { deflateRawSync } from 'node:zlib'
import { runCommand, withOperationLock, extractPinnedIso, downloadPackage } from '../fork/runtime'

test('runner keeps stdout separate, redacts sensitive errors and rejects nonzero exit', async () => {
  const r = await runCommand(process.execPath, [
    '-e',
    'console.error("progress"); console.log("true")'
  ])
  assert.equal(r.trim(), 'true')
  await assert.rejects(
    runCommand(process.execPath, ['-e', 'console.error("SECRET");process.exit(1)'], {
      secrets: ['SECRET']
    }),
    (e: Error) => !e.message.includes('SECRET')
  )
})

test('cross-worker lock blocks duplicates and releases after known failure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dm-lock-'))
  let release!: () => void
  const barrier = new Promise<void>((resolve) => {
    release = resolve
  })
  try {
    const first = withOperationLock(root, 'install', async () => {
      await barrier
    })
    await new Promise((resolve) => setTimeout(resolve, 30))
    await assert.rejects(
      withOperationLock(root, 'install', async () => true),
      /in progress|unknown/
    )
    release()
    await first
    await assert.rejects(
      withOperationLock(root, 'install', async () => {
        throw new Error('known')
      }),
      /known/
    )
    assert.equal(await withOperationLock(root, 'install', async () => true), true)
  } finally {
    release()
    await rm(root, { recursive: true, force: true })
  }
})

test('single ISO extraction verifies pinned identity and never unpacks sibling paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dm-iso-'))
  const bytes = Buffer.from('official fixture iso payload')
  const compressed = deflateRawSync(bytes)
  const name = Buffer.from('fixture.iso')
  const header = Buffer.alloc(30)
  header.writeUInt32LE(0x04034b50)
  header.writeUInt16LE(8, 8)
  header.writeUInt16LE(name.length, 26)
  const zip = join(root, 'fixture.zip'),
    target = join(root, 'fixture.iso')
  const entry = {
    isoName: 'fixture.iso',
    localOffset: 0,
    compressedSize: compressed.length,
    isoSize: bytes.length,
    isoSha256: createHash('sha256').update(bytes).digest('hex')
  }
  try {
    await writeFile(zip, Buffer.concat([header, name, compressed]))
    await extractPinnedIso(zip, target, entry)
    assert.deepEqual(await readFile(target), bytes)
    await assert.rejects(
      extractPinnedIso(zip, target + '.bad', { ...entry, isoSha256: '0'.repeat(64) }),
      /checksum/
    )
    await writeFile(zip, Buffer.concat([header, name, compressed]))
    await assert.rejects(
      extractPinnedIso(zip, target + '.bad', { ...entry, isoName: '../evil.iso' }),
      /entry/
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function isoFixture() {
  const bytes = Buffer.from('official fixture iso payload')
  const compressed = deflateRawSync(bytes)
  const name = Buffer.from('fixture.iso')
  const header = Buffer.alloc(30)
  header.writeUInt32LE(0x04034b50)
  header.writeUInt16LE(8, 8)
  header.writeUInt16LE(name.length, 26)
  return {
    bytes,
    archive: Buffer.concat([header, name, compressed]),
    entry: {
      isoName: 'fixture.iso',
      localOffset: 0,
      compressedSize: compressed.length,
      isoSize: bytes.length,
      isoSha256: createHash('sha256').update(bytes).digest('hex')
    }
  }
}

test('invalid cached archive is discarded so an explicit retry downloads fresh bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dm-cache-retry-'))
  const { bytes, archive, entry } = isoFixture()
  const zip = join(root, 'fixture.zip'),
    target = join(root, 'fixture.iso')
  const corrupt = Buffer.from(archive)
  const otherPayload = deflateRawSync(Buffer.from('official fixture iso payloae'))
  assert.equal(otherPayload.length, entry.compressedSize)
  otherPayload.copy(corrupt, corrupt.length - entry.compressedSize)
  let requests = 0
  const request = async () => {
    requests++
    return Readable.from([archive])
  }
  try {
    await writeFile(zip, corrupt)
    await downloadPackage(zip, archive.length, request, () => {})
    assert.equal(requests, 0)
    await assert.rejects(extractPinnedIso(zip, target, entry), /checksum/)
    assert.equal(requests, 0, 'verification failure must not automatically retry a download')
    await assert.rejects(stat(zip), { code: 'ENOENT' })
    await downloadPackage(zip, archive.length, request, () => {})
    await extractPinnedIso(zip, target, entry)
    assert.equal(requests, 1)
    assert.deepEqual(await readFile(target), bytes)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('proven ZIP header, member identity, deflate and ISO size corruption discard the cache', async (t) => {
  for (const kind of ['header', 'identity', 'deflate', 'oversized', 'truncated'] as const) {
    await t.test(kind, async () => {
      const root = await mkdtemp(join(tmpdir(), 'dm-invalid-cache-'))
      const { archive, entry } = isoFixture()
      const zip = join(root, 'fixture.zip')
      if (kind === 'header') archive.writeUInt32LE(0, 0)
      if (kind === 'identity') archive[30] = '!'.charCodeAt(0)
      if (kind === 'deflate') archive.fill(0xff, archive.length - entry.compressedSize)
      if (kind === 'oversized') entry.isoSize--
      if (kind === 'truncated') entry.isoSize++
      try {
        await writeFile(zip, archive)
        await assert.rejects(extractPinnedIso(zip, join(root, 'fixture.iso'), entry))
        await assert.rejects(stat(zip), { code: 'ENOENT' })
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    })
  }
})

test('output I/O failure preserves valid cached archive for an explicit retry', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dm-cache-output-'))
  const { bytes, archive, entry } = isoFixture()
  const zip = join(root, 'fixture.zip'),
    target = join(root, 'fixture.iso')
  try {
    await writeFile(zip, archive)
    await mkdir(target)
    await assert.rejects(extractPinnedIso(zip, target, entry), { code: 'EISDIR' })
    assert.deepEqual(await readFile(zip), archive)
    await rm(target, { recursive: true })
    await extractPinnedIso(zip, target, entry)
    assert.deepEqual(await readFile(target), bytes)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('archive read permission failure preserves cached bytes', async (t) => {
  if (process.platform === 'win32' || process.getuid?.() === 0)
    return t.skip('requires POSIX permissions enforced for an ordinary user')
  const root = await mkdtemp(join(tmpdir(), 'dm-cache-read-'))
  const { archive, entry } = isoFixture()
  const zip = join(root, 'fixture.zip')
  try {
    await writeFile(zip, archive)
    await chmod(zip, 0)
    await assert.rejects(extractPinnedIso(zip, join(root, 'fixture.iso'), entry), {
      code: 'EACCES'
    })
    await chmod(zip, 0o600)
    assert.deepEqual(await readFile(zip), archive)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
