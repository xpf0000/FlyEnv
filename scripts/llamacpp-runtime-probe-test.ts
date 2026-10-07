import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { promisify } from 'node:util'
import axios from 'axios'
import { installRuntime, runtimePathsForHost } from '../plugins/llamacpp/fork/runtime'
import type { RuntimeVariant } from '../plugins/llamacpp/shared/types'

// Removing stderr from probe failures must fail this real-process regression.
if (process.platform === 'win32') {
  console.log('Unix runtime probe regression skipped on Windows')
} else {
  const root = await mkdtemp(join(tmpdir(), 'flyenv-llamacpp-probe-'))
  const savedGet = axios.get
  try {
    const payload = join(root, 'payload')
    await mkdir(payload)
    const archive = join(root, 'runtime.tar.gz')
    const paths = runtimePathsForHost(root)
    const variant: RuntimeVariant = {
      release: 'b4000', platform: 'linux', arch: 'arm64', backend: 'cpu',
      assetName: 'llama-b4000-bin-ubuntu-arm64.tar.gz',
      assetUrl: 'https://github.com/ggml-org/llama.cpp/releases/download/b4000/llama-b4000-bin-ubuntu-arm64.tar.gz',
      size: 0
    }
    let body: Buffer
    axios.get = (async () => ({
      data: Readable.from(body), headers: { 'content-length': body.length }
    })) as typeof axios.get
    const packageServer = async (script: string) => {
      await writeFile(join(payload, 'llama-server'), `#!/bin/sh\n${script}\n`, { mode: 0o755 })
      await promisify(execFile)('tar', ['-czf', archive, '-C', payload, '.'])
      body = await readFile(archive)
      variant.size = body.length
    }
    await packageServer('printf "version: b4000\\n"; exit 0')
    const installed = await installRuntime(variant, paths)
    const originalBin = await readFile(installed.bin, 'utf8')
    const originalManifest = await readFile(join(installed.path, 'flyenv-runtime.json'), 'utf8')
    assert.match(JSON.parse(installed.note!).probe, /version: b4000/)

    await packageServer('printf "libc.so.6: version GLIBC_2.38 not found\\n" >&2; exit 1')
    let failure: unknown
    try { await installRuntime(variant, paths) } catch (error) { failure = error }
    assert.ok(failure instanceof Error)
    assert.match(failure.message, /version probe failed \(1\)/)
    assert.match(failure.message, /GLIBC_2\.38 not found/)
    assert.equal(await readFile(installed.bin, 'utf8'), originalBin)
    assert.equal(await readFile(join(installed.path, 'flyenv-runtime.json'), 'utf8'), originalManifest)
    assert.deepEqual(await readdir(paths.stagingRoot), [])

    await packageServer('printf "backend initialization failed\\n"; exit 2')
    await assert.rejects(installRuntime(variant, paths), /backend initialization failed/)
    await packageServer('exit 1')
    await assert.rejects(installRuntime(variant, paths), /version probe failed \(1\)/)
    await packageServer('kill -TERM $$')
    await assert.rejects(installRuntime(variant, paths), /version probe failed \(SIGTERM\)/)
    await packageServer('head -c 100000 /dev/zero | tr "\\000" x; printf "final diagnostic\\n" >&2; exit 1')
    await assert.rejects(installRuntime(variant, paths), (error: Error) => {
      assert.match(error.message, /final diagnostic/)
      assert.ok(error.message.length < 65_000)
      return true
    })
    console.log('Runtime probe diagnostics, success and failed replacement regressions passed')
  } finally {
    axios.get = savedGet
    await rm(root, { recursive: true, force: true })
  }
}
