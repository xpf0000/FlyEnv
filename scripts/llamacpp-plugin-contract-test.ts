import assert from 'node:assert/strict'
import {
  parseReleaseAssets,
  type GitHubRelease
} from '../plugins/llamacpp/fork/release'
import type { RuntimeHost } from '../plugins/llamacpp/shared/types'
import { installRuntime, removeRuntime, type RuntimeInstallDeps, type RuntimePaths } from '../plugins/llamacpp/fork/runtime'
import type { RuntimeVariant } from '../plugins/llamacpp/shared/types'

const testReleaseAssetParsing = () => {
  const release: GitHubRelease = {
    tag_name: 'b4000',
    prerelease: false,
    assets: [
      { name: 'llama-b4000-bin-win-cpu-x64.zip', size: 100, browser_download_url: 'https://example.test/cpu.zip' },
      { name: 'llama-b4000-bin-win-cuda-12.4-x64.zip', size: 200, browser_download_url: 'https://example.test/cuda.zip' },
      { name: 'llama-b4000-bin-win-vulkan-x64.zip', size: 300, browser_download_url: 'https://example.test/vulkan.zip' },
      { name: 'llama-b4000-bin-macos-arm64.tar.gz', size: 400, browser_download_url: 'https://example.test/mac.tar.gz' },
      { name: 'llama-b4000-bin-ubuntu-x64.tar.gz', size: 500, browser_download_url: 'https://example.test/linux.tar.gz' }
    ]
  }
  const win = parseReleaseAssets(release, { platform: 'windows', arch: 'x64' })
  assert.deepEqual(win.map((variant) => variant.backend), ['cpu', 'cuda', 'vulkan'])
  assert.equal(win[0].release, 'b4000')
  assert.equal(win[1].cudaVersion, '12.4')
  assert.equal(parseReleaseAssets(release, { platform: 'macos', arch: 'arm64' })[0].backend, 'metal')
}

const testUnsupportedVariantFiltered = () => {
  const release: GitHubRelease = {
    tag_name: 'b4000', prerelease: false,
    assets: [
      { name: 'llama-b4000-bin-win-cpu-arm64.zip', size: 10, browser_download_url: 'https://example.test/arm.zip' },
      { name: 'llama-b4000-bin-ubuntu-cuda-12.4-arm64.tar.gz', size: 10, browser_download_url: 'https://example.test/arm-cuda.tar.gz' }
    ]
  }
  assert.deepEqual(parseReleaseAssets(release, { platform: 'windows', arch: 'x64' }), [])
  assert.deepEqual(parseReleaseAssets(release, { platform: 'linux', arch: 'arm64' }), [])
}

const testCudaCompanionPairing = () => {
  const release: GitHubRelease = {
    tag_name: 'b4000', prerelease: false,
    assets: [
      { name: 'llama-b4000-bin-ubuntu-cuda-12.4-x64.tar.gz', size: 200, browser_download_url: 'https://example.test/cuda.tar.gz' },
      { name: 'cudart-llama-b4000-bin-ubuntu-cuda-12.4-x64.tar.gz', size: 50, browser_download_url: 'https://example.test/cudart.tar.gz' },
      { name: 'cudart-llama-b4000-bin-ubuntu-cuda-11.8-x64.tar.gz', size: 40, browser_download_url: 'https://example.test/cudart-other.tar.gz' }
    ]
  }
  const variants = parseReleaseAssets(release, { platform: 'linux', arch: 'x64' })
  assert.equal(variants.length, 1)
  assert.equal(variants[0].companion?.assetName, 'cudart-llama-b4000-bin-ubuntu-cuda-12.4-x64.tar.gz')
}

const testUnknownAssetRejected = () => {
  const release: GitHubRelease = {
    tag_name: 'b4000', prerelease: false,
    assets: [{ name: 'llama-b4000-bin-openvino-linux-x64.tar.gz', size: 10, browser_download_url: 'https://example.test/unknown.tar.gz' }]
  }
  assert.deepEqual(parseReleaseAssets(release, { platform: 'linux', arch: 'x64' }), [])
}

const fakeRuntime = (options: { digest?: string; executable?: boolean } = {}) => {
  const files = new Map<string, string>()
  const dirs = new Set<string>()
  const deps: RuntimeInstallDeps = {
    mkdir: async (path) => { dirs.add(path) },
    download: async (_url, target) => { files.set(target, 'archive') },
    digest: async (path) => path.includes('cudart') ? 'companion-digest' : (options.digest ?? 'expected'),
    extract: async (archive, target) => {
      if (archive.includes('cudart')) files.set(`${target}/libcudart.so`, 'cuda')
      else if (options.executable !== false) files.set(`${target}/llama-server`, 'binary')
    },
    exists: async (path) => files.has(path) || dirs.has(path),
    rename: async (from, to) => {
      if (dirs.has(from)) { dirs.delete(from); dirs.add(to) }
      for (const [path, value] of [...files]) {
        if (path === from || path.startsWith(`${from}/`)) {
          files.delete(path)
          files.set(`${to}${path.slice(from.length)}`, value)
        }
      }
    },
    remove: async (path) => {
      dirs.delete(path)
      for (const key of [...files.keys()]) if (key === path || key.startsWith(`${path}/`)) files.delete(key)
    },
    write: async (path, content) => { files.set(path, content) },
    probe: async (bin) => {
      if (!files.has(bin)) throw new Error('missing executable')
      return 'b4000'
    }
  }
  const paths: RuntimePaths = { cacheDir: '/data/cache', runtimeRoot: '/data/runtimes', stagingRoot: '/data/staging' }
  const variant: RuntimeVariant = {
    release: 'b4000', platform: 'linux', arch: 'x64', backend: 'cuda', cudaVersion: '12.4',
    assetName: 'llama.tar.gz', assetUrl: 'https://example.test/llama.tar.gz', size: 10,
    sha256: 'expected', companion: { assetName: 'cudart.tar.gz', assetUrl: 'https://example.test/cudart.tar.gz', size: 2 }
  }
  return { deps, files, dirs, paths, variant }
}

const testRuntimeInstallDigestFailurePreservesActiveVersion = async () => {
  const fixture = fakeRuntime({ digest: 'wrong' })
  const active = '/data/runtimes/b4000-linux-x64-cuda-12.4'
  fixture.dirs.add(active)
  await assert.rejects(installRuntime(fixture.variant, fixture.paths, fixture.deps), /SHA-256/)
  assert.equal(fixture.dirs.has(active), true)
  assert.equal([...fixture.dirs].some((path) => path.includes('stage')), false)
}

const testRuntimeInstallMissingExecutableCleansStaging = async () => {
  const fixture = fakeRuntime({ executable: false })
  await assert.rejects(installRuntime(fixture.variant, fixture.paths, fixture.deps), /llama-server/)
  assert.equal([...fixture.dirs].some((path) => path.includes('stage')), false)
}

const testRuntimeInstallSuccessPairsCudaRuntime = async () => {
  const fixture = fakeRuntime()
  const installed = await installRuntime(fixture.variant, fixture.paths, fixture.deps)
  assert.equal(installed.bin, '/data/runtimes/b4000-linux-x64-cuda-12.4/llama-server')
  assert.equal(installed.version, 'b4000')
  assert.equal(fixture.files.has(`${installed.path}/libcudart.so`), true)
}

const testRuntimeDeleteRejectsOutsideRoot = async () => {
  const fixture = fakeRuntime()
  await assert.rejects(removeRuntime('/data/models/important.gguf', fixture.paths.runtimeRoot, fixture.deps), /runtime root/)
}

void (async () => {
  testReleaseAssetParsing()
  testUnsupportedVariantFiltered()
  testCudaCompanionPairing()
  testUnknownAssetRejected()
  await testRuntimeInstallDigestFailurePreservesActiveVersion()
  await testRuntimeInstallMissingExecutableCleansStaging()
  await testRuntimeInstallSuccessPairsCudaRuntime()
  await testRuntimeDeleteRejectsOutsideRoot()
  console.log('llama.cpp plugin contract tests passed')
})()
