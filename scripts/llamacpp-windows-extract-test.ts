import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import axios from 'axios'
import { installRuntime, runtimePathsForHost } from '../plugins/llamacpp/fork/runtime'
import type { RuntimeVariant } from '../plugins/llamacpp/shared/types'

if (process.platform !== 'win32') {
  console.log('Windows runtime extraction regression skipped on this platform')
} else {
  const root = await mkdtemp(join(tmpdir(), 'flyenv-llamacpp-extract-'))
  const savedServer = global.Server
  const savedGet = axios.get
  try {
    global.Server = {
      ...savedServer,
      BaseDir: root,
      Cache: join(root, 'cache'),
      Static: join(root, 'static')
    } as typeof global.Server
    const source = join(root, 'payload')
    await mkdir(source)
    // Node is a real Windows executable that accepts the same --version probe.
    await copyFile(process.execPath, join(source, 'llama-server.exe'))
    await writeFile(join(source, 'ggml.dll'), 'main DLL fixture')
    const zip = join(root, 'runtime.zip')
    const companionZip = join(root, 'companion.zip')
    const companionDir = join(root, 'companion')
    await mkdir(companionDir)
    await writeFile(join(companionDir, 'cudart.dll'), 'companion DLL fixture')
    const compressing = createRequire(import.meta.url)('7zip-min-electron')
    for (const [directory, archive] of [
      [source, zip],
      [companionDir, companionZip]
    ]) {
      await new Promise<void>((resolve, reject) => {
        compressing.cmd(
          ['a', '-tzip', '-mx=0', archive, join(directory, '*')],
          (error: Error | null) => {
            if (error) reject(error)
            else resolve()
          }
        )
      })
    }
    const main = await readFile(zip)
    const companion = await readFile(companionZip)
    const assetName = 'llama-b4000-bin-win-cuda-12.4-x64.zip'
    const companionName = 'cudart-llama-b4000-bin-win-cuda-12.4-x64.zip'
    const releaseUrl = 'https://github.com/ggml-org/llama.cpp/releases/download/b4000/'
    const variant: RuntimeVariant = {
      release: 'b4000',
      platform: 'windows',
      arch: 'x64',
      backend: 'cuda',
      cudaVersion: '12.4',
      assetName,
      assetUrl: releaseUrl + assetName,
      size: main.length,
      companion: {
        assetName: companionName,
        assetUrl: releaseUrl + companionName,
        size: companion.length
      }
    }
    let mainBody = main
    const requested: string[] = []
    axios.get = (async (url: string) => {
      requested.push(url)
      const body = url === variant.assetUrl ? mainBody : companion
      return { data: Readable.from(body), headers: { 'content-length': body.length } }
    }) as typeof axios.get
    const paths = runtimePathsForHost(root)
    const installed = await installRuntime(variant, paths)
    assert.equal((await stat(installed.bin)).size, (await stat(process.execPath)).size)
    assert.equal(await readFile(join(installed.path, 'ggml.dll'), 'utf8'), 'main DLL fixture')
    assert.equal(
      await readFile(join(installed.path, 'cudart.dll'), 'utf8'),
      'companion DLL fixture'
    )
    assert.deepEqual(requested, [variant.assetUrl, variant.companion!.assetUrl])
    assert.deepEqual(await readdir(paths.stagingRoot), [])
    mainBody = Buffer.from('not a ZIP archive')
    await assert.rejects(installRuntime({ ...variant, size: mainBody.length }, paths), /7-zip/)
    assert.equal((await stat(installed.bin)).size, (await stat(process.execPath)).size)
    assert.deepEqual(await readdir(paths.stagingRoot), [])
    console.log('Windows main/companion extraction and failed replacement regressions passed')
  } finally {
    axios.get = savedGet
    global.Server = savedServer
    await rm(root, { recursive: true, force: true })
  }
}
