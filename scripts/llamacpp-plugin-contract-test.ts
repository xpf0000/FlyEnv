import assert from 'node:assert/strict'
import {
  parseReleaseAssets,
  type GitHubRelease
} from '../plugins/llamacpp/fork/release'
import type { RuntimeHost } from '../plugins/llamacpp/shared/types'

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

void (async () => {
  testReleaseAssetParsing()
  testUnsupportedVariantFiltered()
  testCudaCompanionPairing()
  testUnknownAssetRejected()
  console.log('llama.cpp plugin contract tests passed')
})()
