import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { archiveExtensionFromUrl } from '../src/fork/module/Ollama'
import { unpack, unpackCommand } from '../src/fork/util/Zip'

assert.equal(
  archiveExtensionFromUrl(
    'https://github.com/ollama/ollama/releases/download/v0.32.5/ollama-linux-amd64.tar.zst',
    '.tgz'
  ),
  '.tar.zst'
)
assert.equal(
  archiveExtensionFromUrl(
    'https://github.com/ollama/ollama/releases/download/v0.32.5/ollama-darwin.tgz?download=1',
    '.tgz'
  ),
  '.tgz'
)
assert.equal(archiveExtensionFromUrl('not-a-url', '.tgz'), '.tgz')

assert.equal(
  unpackCommand('/tmp/ollama-linux-amd64.tar.zst', '/tmp/ollama'),
  'zstd -dc "/tmp/ollama-linux-amd64.tar.zst" | tar -xf - -C "/tmp/ollama" > /dev/null'
)

const tempDir = await mkdtemp(join(tmpdir(), 'flyenv-ollama-zstd-'))
const sourceDir = join(tempDir, 'source')
const destinationDir = join(tempDir, 'destination')
const tarFile = join(tempDir, 'ollama.tar')
const zstdFile = `${tarFile}.zst`

try {
  await mkdir(sourceDir)
  await mkdir(destinationDir)
  await writeFile(join(sourceDir, 'ollama'), 'binary')
  execFileSync('tar', ['-cf', tarFile, '-C', sourceDir, 'ollama'])
  execFileSync('zstd', ['-q', '-o', zstdFile, tarFile])

  await unpack(zstdFile, destinationDir)
  assert.equal(await readFile(join(destinationDir, 'ollama'), 'utf8'), 'binary')
} finally {
  await rm(tempDir, { recursive: true, force: true })
}

console.log('ALL CHECKS PASSED')
