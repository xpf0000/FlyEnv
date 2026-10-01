import assert from 'node:assert/strict'
import axios from 'axios'
import localForage from 'localforage'
import { computed, reactive } from 'vue'
import {
  fetchRuntimeReleases,
  parseReleaseAssets,
  type GitHubRelease
} from '../plugins/llamacpp/fork/release'
import { installRuntime, removeRuntime, validateRuntimeVariant, type RuntimeInstallDeps, type RuntimePaths } from '../plugins/llamacpp/fork/runtime'
import type { RuntimeVariant } from '../plugins/llamacpp/shared/types'
import { createModelDownloadDeps, deleteLocalModel, downloadHubModelFile, formatHubRequestError, getHubModelFiles, searchHubModels, type ModelDownloadDeps } from '../plugins/llamacpp/fork/models'
import type { HubModel, HubModelFile } from '../plugins/llamacpp/shared/types'
import { isStandaloneGGUFPath } from '../plugins/llamacpp/shared/modelFile'
import { isStandaloneGGUFFile } from '../plugins/llamacpp/fork/gguf'
import { assertInvocationSupported, assertServerStopped, buildServerInvocation, createApiKeyFile, readServerHelp, validateLaunchProfile, validateManagedModelPath, waitForServerHealth, waitForServerStopped } from '../plugins/llamacpp/fork/config'
import { LlamaCppModule, isManagedModelActive } from '../plugins/llamacpp/fork/LlamaCpp'
import type { LaunchProfile } from '../plugins/llamacpp/shared/types'
import { createControllerTransport, LlamaCppController, LlamaCppManager, modelFileKey, type ControllerTransport, type ModelService } from '../plugins/llamacpp/render/controller'
import { getModelSizeColorForHardware, modelHardwareFromReport } from '../src/render/util/ModelSize'
import { generateApiKey } from '../plugins/llamacpp/render/settings/key'
import { escapeNoticeText } from '../plugins/llamacpp/render/notice'
import { setStopProcessListProvider } from '../src/shared/StopProcessList'

const testReleaseAssetParsing = () => {
  const release: GitHubRelease = {
    tag_name: 'b4000',
    prerelease: false,
    assets: [
      { name: 'llama-bin-win-cpu-x64.zip', size: 100, browser_download_url: 'https://example.test/cpu.zip' },
      { name: 'llama-bin-win-cuda-12.8-x64.zip', size: 200, browser_download_url: 'https://example.test/cuda.zip' },
      { name: 'cudart-llama-bin-win-cuda-12.8-x64.zip', size: 20, browser_download_url: 'https://example.test/cudart.zip' },
      { name: 'llama-b4000-bin-win-vulkan-x64.zip', size: 300, browser_download_url: 'https://example.test/vulkan.zip' },
      { name: 'llama-b4000-bin-macos-arm64.tar.gz', size: 400, browser_download_url: 'https://example.test/mac.tar.gz' },
      { name: 'llama-b4000-bin-ubuntu-x64.tar.gz', size: 500, browser_download_url: 'https://example.test/linux.tar.gz' }
    ]
  }
  const win = parseReleaseAssets(release, { platform: 'windows', arch: 'x64' })
  assert.deepEqual(win.map((variant) => variant.backend), ['cpu', 'cuda', 'vulkan'])
  assert.equal(win[0].release, 'b4000')
  assert.equal(win[1].cudaVersion, '12.8')
  assert.equal(parseReleaseAssets(release, { platform: 'macos', arch: 'arm64' })[0].backend, 'metal')
}

const testStableRuntimeFetchPaginatesPastRecentPrereleases = async () => {
  const originalGet = axios.get
  const requests: Array<{ page: number; perPage: number }> = []
  const stableRelease: GitHubRelease = {
    tag_name: 'v0.5.0', prerelease: false,
    assets: [{ name: 'llama-bin-win-cpu-x64.zip', size: 10, browser_download_url: 'https://example.test/stable.zip' }]
  }
  ;(axios as any).get = async (_url: string, config?: any) => {
    const page = (config?.params?.page ?? 1) as number
    requests.push({ page, perPage: config?.params?.per_page ?? 30 })
    return { data: page === 1 ? Array.from({ length: 100 }, (_, index) => ({ tag_name: `b${index}`, prerelease: true, assets: [] })) : [stableRelease] }
  }
  try {
    const variants = await fetchRuntimeReleases('stable', { platform: 'windows', arch: 'x64' })
    assert.equal(variants.length, 1)
    assert.equal(variants[0].release, 'v0.5.0')
    assert.deepEqual(requests, [{ page: 1, perPage: 100 }, { page: 2, perPage: 100 }])
  } finally {
    axios.get = originalGet
  }
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

const testCudaCompanionWithoutTagPairsAndMissingCompanionIsFiltered = () => {
  const release: GitHubRelease = {
    tag_name: 'b10293', prerelease: false,
    assets: [
      { name: 'llama-b10293-bin-win-cuda-12.4-x64.zip', size: 200, browser_download_url: 'https://example.test/cuda.zip' },
      { name: 'cudart-llama-bin-win-cuda-12.4-x64.zip', size: 50, browser_download_url: 'https://example.test/cudart.zip' },
      { name: 'llama-b10293-bin-win-cuda-11.8-x64.zip', size: 100, browser_download_url: 'https://example.test/cuda-old.zip' },
      { name: 'cudart-llama-bin-win-cuda-12.8-x64.zip', size: 50, browser_download_url: 'https://example.test/cudart-other.zip' }
    ]
  }
  const variants = parseReleaseAssets(release, { platform: 'windows', arch: 'x64' })
  assert.equal(variants.length, 1)
  assert.equal(variants[0].cudaVersion, '12.4')
  assert.equal(variants[0].companion?.assetName, 'cudart-llama-bin-win-cuda-12.4-x64.zip')
}

const testUnknownAssetRejected = () => {
  const release: GitHubRelease = {
    tag_name: 'b4000', prerelease: false,
    assets: [{ name: 'llama-b4000-bin-openvino-linux-x64.tar.gz', size: 10, browser_download_url: 'https://example.test/unknown.tar.gz' }]
  }
  assert.deepEqual(parseReleaseAssets(release, { platform: 'linux', arch: 'x64' }), [])
}

const fakeRuntime = (options: { digest?: string; executable?: boolean; archive?: string } = {}) => {
  const files = new Map<string, string>()
  const dirs = new Set<string>()
  const deps: RuntimeInstallDeps = {
    mkdir: async (path) => { dirs.add(path) },
    download: async (url, target) => { files.set(target, url.includes('cudart') ? 'cu' : (options.archive ?? 'archive')) },
    digest: async (path) => path.includes('cudart') ? 'companion-digest' : (options.digest ?? 'a'.repeat(64)),
    extract: async (archive, target) => {
      if (archive.includes('cudart')) files.set(`${target}/libcudart.so`, 'cuda')
      else if (options.executable !== false) files.set(`${target}/llama-server`, 'binary')
    },
    exists: async (path) => files.has(path) || dirs.has(path),
    size: async (path) => files.get(path)?.length ?? 0,
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
    assetName: 'llama-b4000-bin-ubuntu-cuda-12.4-x64.tar.gz', assetUrl: 'https://github.com/ggml-org/llama.cpp/releases/download/b4000/llama-b4000-bin-ubuntu-cuda-12.4-x64.tar.gz', size: 7,
    sha256: 'a'.repeat(64), companion: { assetName: 'cudart-llama-b4000-bin-ubuntu-cuda-12.4-x64.tar.gz', assetUrl: 'https://github.com/ggml-org/llama.cpp/releases/download/b4000/cudart-llama-b4000-bin-ubuntu-cuda-12.4-x64.tar.gz', size: 2 }
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

const testRuntimeInstallSizeFailurePreservesActiveVersion = async () => {
  const fixture = fakeRuntime({ archive: 'short' })
  const active = '/data/runtimes/b4000-linux-x64-cuda-12.4'
  fixture.dirs.add(active)
  await assert.rejects(installRuntime(fixture.variant, fixture.paths, fixture.deps), /Size verification/)
  assert.equal(fixture.dirs.has(active), true)
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

const testRuntimeRejectsUntrustedAssetUrl = () => {
  assert.throws(() => validateRuntimeVariant({ ...launchVariant, assetUrl: 'http://127.0.0.1/payload.tar.gz' }), /official llama.cpp GitHub releases/)
}

const testRuntimeRejectsMissingOrMismatchedCudaCompanion = () => {
  const variant = fakeRuntime().variant
  assert.throws(() => validateRuntimeVariant({ ...variant, companion: undefined }), /requires its matching companion/)
  assert.throws(() => validateRuntimeVariant({
    ...variant,
    companion: {
      ...variant.companion!,
      assetName: 'cudart-llama-b4000-bin-ubuntu-cuda-11.8-x64.tar.gz',
      assetUrl: 'https://github.com/ggml-org/llama.cpp/releases/download/b4000/cudart-llama-b4000-bin-ubuntu-cuda-11.8-x64.tar.gz'
    }
  }), /runtime identity/)
}

const fakeModelDeps = (config: { payload?: unknown; bytes?: string; digest?: string; failDownload?: boolean; standalone?: boolean } = {}) => {
  const files = new Map<string, string>()
  let requestedUrl = ''
  const deps: ModelDownloadDeps = {
    requestJson: async (url) => {
      if (url.includes('models?')) return config.payload ?? []
      return config.payload ?? []
    },
    mkdir: async () => {},
    realPath: async (path) => path,
    download: async (url, target, signal, progress) => {
      requestedUrl = url
      if (config.failDownload || signal.aborted) throw new Error('aborted')
      const content = config.bytes ?? 'model-data'
      files.set(target, content)
      progress(content.length, content.length)
    },
    digest: async () => config.digest ?? 'digest',
    exists: async (path) => files.has(path),
    size: async (path) => files.get(path)?.length ?? 0,
    rename: async (from, to) => { const value = files.get(from); if (value !== undefined) { files.delete(from); files.set(to, value) } },
    remove: async (path) => { files.delete(path) },
    write: async (path, content) => { files.set(path, content) },
    inspect: async () => config.standalone ?? true
  }
  return { deps, files, get requestedUrl() { return requestedUrl } }
}

const testHubSearchAnonymousPaginationAnd429 = async () => {
  let requested = ''
  const fixture = fakeModelDeps({ payload: [{ id: 'org/model-GGUF', downloads: 12, cardData: { license: 'apache-2.0' } }] })
  fixture.deps.requestJson = async (url) => { requested = url; return [{ id: 'org/model-GGUF', downloads: 12, cardData: { license: 'apache-2.0' } }] }
  const results = await searchHubModels('tiny gguf', 2, fixture.deps)
  assert.match(requested, /skip=40/)
  assert.equal(results[0].license, 'apache-2.0')
  fixture.deps.requestJson = async () => { throw new Error('Hugging Face Hub rate limit reached (HTTP 429); retry later') }
  await assert.rejects(searchHubModels('model', 0, fixture.deps), /429/)
}

const testHubModelCatalogLoadsPopularGGUFModelsWithoutQuery = async () => {
  let requested = ''
  const fixture = fakeModelDeps({ payload: [{ id: 'Qwen/Qwen3-8B-GGUF', downloads: 321, cardData: { license: 'apache-2.0' } }] })
  fixture.deps.requestJson = async (url) => {
    requested = url
    return [{ id: 'Qwen/Qwen3-8B-GGUF', downloads: 321, cardData: { license: 'apache-2.0' } }]
  }

  const models = await searchHubModels('', 0, fixture.deps)

  assert.equal(models[0].id, 'Qwen/Qwen3-8B-GGUF')
  assert.match(requested, /filter=gguf/)
  assert.match(requested, /sort=downloads/)
  assert.match(requested, /limit=20/)
  assert.match(requested, /skip=0/)
  assert.doesNotMatch(requested, /(?:\?|&)search=/)
}

const testHubFileMetadata = async () => {
  const fixture = fakeModelDeps({ payload: [{ type: 'file', path: 'Q4/model.gguf', size: 10, lfs: { size: 10, oid: 'a'.repeat(64) } }, { type: 'file', path: 'Q4/model-imatrix-Q4_K_M.gguf', size: 10 }, { type: 'file', path: 'imatrix_unsloth.gguf', size: 2 }, { type: 'file', path: 'MTP/mtp-model.gguf', size: 10 }, { type: 'file', path: 'mmproj-F16.gguf', size: 10 }, { type: 'file', path: 'model-00001-of-00002.gguf', size: 10 }, { type: 'file', path: 'README.md', size: 2 }] })
  const files = await getHubModelFiles('org/model', 'main', fixture.deps)
  assert.deepEqual(files.map((file) => file.path), ['Q4/model.gguf', 'Q4/model-imatrix-Q4_K_M.gguf', 'imatrix_unsloth.gguf', 'MTP/mtp-model.gguf', 'mmproj-F16.gguf', 'model-00001-of-00002.gguf'])
  assert.equal(files[0].sha256, 'a'.repeat(64))
  assert.match(files[0].downloadUrl, /org\/model\/resolve\/main\/Q4\/model.gguf/)
}

const testHubFileListingFollowsPagination = async () => {
  const fixture = fakeModelDeps()
  const urls: string[] = []
  fixture.deps.requestJson = async (url) => {
    urls.push(url)
    return urls.length === 1
      ? { items: [{ type: 'file', path: 'first.gguf', size: 10 }], next: 'https://huggingface.co/api/models/org/model/tree/main?recursive=true&cursor=next' }
      : { items: [{ type: 'file', path: 'second.gguf', size: 20 }], next: undefined }
  }
  assert.deepEqual((await getHubModelFiles('org/model', 'main', fixture.deps)).map((file) => file.path), ['first.gguf', 'second.gguf'])
  assert.equal(urls.length, 2)
}

const testSupportingGGUFDownloadIsAllowedButUnsafePathsAreRejected = async () => {
  const fixture = fakeModelDeps({ bytes: 'model-data' })
  for (const path of ['imatrix_unsloth.gguf', 'MTP/mtp-model.gguf', 'mmproj-F16.gguf', 'model-00001-of-00002.gguf']) {
    const file: HubModelFile = { repoId: 'org/model', revision: 'main', path, size: 10, downloadUrl: 'https://example.test/model' }
    const local = await downloadHubModelFile(`file-${path}`, file, '/models', new AbortController().signal, () => {}, fixture.deps)
    assert.equal(local.path, path)
    assert.equal(fixture.files.has(local.localPath), true)
  }
  for (const path of ['README.md', '../outside.gguf']) {
    const file: HubModelFile = { repoId: 'org/model', revision: 'main', path, size: 10, downloadUrl: 'https://example.test/model' }
    await assert.rejects(downloadHubModelFile('invalid', file, '/models', new AbortController().signal, () => {}, fixture.deps), /GGUF model downloads/)
  }
}

const testDownloadedGGUFRoleIsReturnedToRenderer = async () => {
  const fixture = fakeModelDeps({ bytes: 'model-data', standalone: false })
  const file: HubModelFile = { repoId: 'org/model', revision: 'main', path: 'ambiguous.gguf', size: 10, downloadUrl: 'https://example.test/ambiguous.gguf' }
  const local = await downloadHubModelFile('draft', file, '/models', new AbortController().signal, () => {}, fixture.deps)
  assert.equal(local.standalone, false)
  assert.equal(JSON.parse(fixture.files.get(`${local.localPath}.flyenv.json`) ?? '{}').standalone, false)
}

const testMainModelFilenameHintsAvoidKnownSidecars = () => {
  assert.equal(isStandaloneGGUFPath('Llama-3.2-Vision-Instruct-Q4_K_M.gguf'), true)
  assert.equal(isStandaloneGGUFPath('model-imatrix-Q4_K_M.gguf'), true)
  assert.equal(isStandaloneGGUFPath('Qwen3.6-27B-NVFP4-Q4_K_M-mtp.gguf'), true)
  assert.equal(isStandaloneGGUFPath('Step-3.7-Flash-MTP-Q6_K.gguf', 'notSnix/Step-3.7-Flash-MTP-Draft-GGUF'), false)
  for (const path of ['imatrix_unsloth.gguf', 'MTP/mtp-model.gguf', 'model-MTP-draft.gguf', 'qwen3.5-9b-dflash-Q4_K_M.gguf', 'Millie-1.1-35B-A3B-vision.gguf', 'mmproj-F16.gguf', 'model-00001-of-00002.gguf']) {
    assert.equal(isStandaloneGGUFPath(path), false, path)
  }
}

const testGGUFContentsDistinguishDraftFromMainModel = async () => {
  const fs = await import('node:fs/promises')
  const os = await import('node:os')
  const path = await import('node:path')
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'llama-gguf-role-'))
  const u32 = (value: number) => { const bytes = Buffer.alloc(4); bytes.writeUInt32LE(value); return bytes }
  const u64 = (value: number) => { const bytes = Buffer.alloc(8); bytes.writeBigUInt64LE(BigInt(value)); return bytes }
  const str = (value: string) => Buffer.concat([u64(Buffer.byteLength(value)), Buffer.from(value)])
  const fixture = (architecture: string, tensors: string[]) => Buffer.concat([
    Buffer.from('GGUF'), u32(3), u64(tensors.length), u64(1),
    str('general.architecture'), u32(8), str(architecture),
    ...tensors.flatMap((name) => [str(name), u32(1), u64(1), u32(0), u64(0)])
  ])
  try {
    const main = path.join(root, 'main.gguf')
    const mtp = path.join(root, 'draft.gguf')
    const dflash = path.join(root, 'dflash.gguf')
    await fs.writeFile(main, fixture('qwen35', ['token_embd.weight', 'blk.0.attn_norm.weight']))
    await fs.writeFile(mtp, fixture('qwen35', ['blk.64.attn_norm.weight']))
    await fs.writeFile(dflash, fixture('dflash', ['blk.0.attn_norm.weight']))
    assert.equal(await isStandaloneGGUFFile(main), true)
    assert.equal(await isStandaloneGGUFFile(mtp), false)
    assert.equal(await isStandaloneGGUFFile(dflash), false)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}

const testModelDownloadDigestAndAtomicRename = async () => {
  const fixture = fakeModelDeps({ bytes: '1234567890', digest: 'a'.repeat(64) })
  const file: HubModelFile = { repoId: 'org/model', revision: 'main', path: 'Q4/model.gguf', size: 10, sha256: 'a'.repeat(64), license: 'apache-2.0', downloadUrl: 'https://example.test/model' }
  const model = await downloadHubModelFile('op-1', file, '/models', new AbortController().signal, () => {}, fixture.deps)
  assert.ok(model.localPath.startsWith('/models/'))
  assert.ok(model.localPath.endsWith('/model.gguf'))
  assert.equal(model.license, 'apache-2.0')
  assert.equal(fixture.files.has(model.localPath), true)
  assert.match(fixture.requestedUrl, /^https:\/\/huggingface\.co\/org\/model\/resolve\/main\/Q4\/model\.gguf/)
  assert.equal([...fixture.files.keys()].some((path) => path.endsWith('.part')), false)
}

const testSameNamedGGUFFilesKeepSeparateManagedPaths = async () => {
  const fixture = fakeModelDeps({ bytes: 'model-data' })
  const base: HubModelFile = { repoId: 'org/model', revision: 'main', path: 'Q4/model.gguf', size: 10, downloadUrl: 'https://example.test/model' }
  const first = await downloadHubModelFile('q4', base, '/models', new AbortController().signal, () => {}, fixture.deps)
  const second = await downloadHubModelFile('q8', { ...base, path: 'Q8/model.gguf' }, '/models', new AbortController().signal, () => {}, fixture.deps)
  assert.notEqual(first.localPath, second.localPath)
  assert.equal(fixture.files.has(first.localPath), true)
  assert.equal(fixture.files.has(second.localPath), true)
  const shardOne = await downloadHubModelFile('shard1', { ...base, path: 'split/model-00001-of-00002.gguf' }, '/models', new AbortController().signal, () => {}, fixture.deps)
  const shardTwo = await downloadHubModelFile('shard2', { ...base, path: 'split/model-00002-of-00002.gguf' }, '/models', new AbortController().signal, () => {}, fixture.deps)
  assert.equal((await import('node:path')).dirname(shardOne.localPath), (await import('node:path')).dirname(shardTwo.localPath))
}

const testDownloadRejectsRedirectedManagedDirectory = async () => {
  const fixture = fakeModelDeps({ bytes: 'model-data' })
  const file: HubModelFile = { repoId: 'org/model', revision: 'main', path: 'model.gguf', size: 10, downloadUrl: 'https://example.test/model' }
  fixture.deps.realPath = async (path) => path.includes('/hub-files/') ? '/outside' : path
  await assert.rejects(downloadHubModelFile('redirected', file, '/models', new AbortController().signal, () => {}, fixture.deps), /managed models directory/)
  assert.equal(fixture.files.size, 0)
}

const testModelDownloadFailureCleansPartial = async () => {
  const fixture = fakeModelDeps({ failDownload: true })
  const file: HubModelFile = { repoId: 'org/model', revision: 'main', path: 'model.gguf', size: 10, downloadUrl: 'https://example.test/model' }
  await assert.rejects(downloadHubModelFile('op-2', file, '/models', new AbortController().signal, () => {}, fixture.deps), /aborted/)
  assert.equal([...fixture.files.keys()].some((path) => path.endsWith('.part')), false)
}

const testModelDeleteRejectsOutsideRoot = async () => {
  const fixture = fakeModelDeps()
  await assert.rejects(deleteLocalModel('/private/model.gguf', '/models', undefined, fixture.deps), /model root/)
  await assert.rejects(deleteLocalModel('/models/active.gguf', '/models', '/models/active.gguf', fixture.deps), /active server/)
}

const launchVariant: RuntimeVariant = {
  release: 'b4000', platform: 'linux', arch: 'x64', backend: 'cuda', cudaVersion: '12.4',
  assetName: 'llama.tar.gz', assetUrl: 'https://example.test/llama.tar.gz', size: 10
}
const launchProfile: LaunchProfile = {
  modelPath: '/models/test.gguf', backend: 'cuda', host: '127.0.0.1', port: 8080,
  contextSize: 4096, threads: 8, gpuLayers: 20, gpuDevice: '0'
}

const testBuildServerInvocationUsesArgv = () => {
  const validated = validateLaunchProfile(launchProfile, launchVariant)
  const invocation = buildServerInvocation(validated, { bin: '/runtime/llama-server', path: '/runtime', version: 'b4000' } as any, { localPath: '/models/test.gguf' } as any)
  assert.deepEqual(invocation.args.slice(0, 2), ['--model', '/models/test.gguf'])
  assert.ok(invocation.args.includes('--port'))
  assert.equal(invocation.args.some((arg) => arg.includes(';')), false)
}

const testLaunchRejectsUnsupportedRuntimeFlags = () => {
  assert.throws(() => assertInvocationSupported('--model --host --port', ['--model', 'x.gguf', '--host', '127.0.0.1', '--ctx-size', '4096']), /--ctx-size/)
  assert.throws(() => assertInvocationSupported('--model-dir --host --port --ctx-size --threads --n-gpu-layers', ['--model', 'x.gguf']), /--model/)
}

const testLaunchProfileRejectsUnknownBackendDevice = () => {
  assert.throws(() => validateLaunchProfile({ ...launchProfile, gpuDevice: 'cuda:any arbitrary' }, launchVariant), /GPU device/)
}

const testLoopbackDoesNotRequireApiKey = () => {
  assert.doesNotThrow(() => validateLaunchProfile(launchProfile, launchVariant))
}

const testNonLoopbackRequiresApiKeyFile = () => {
  assert.throws(() => validateLaunchProfile({ ...launchProfile, host: '0.0.0.0' }, launchVariant), /API key file/)
}

const testApiKeyNeverAppearsInArgsOrLogs = async () => {
  const secret = 'secret-value-12345'
  const keyFile = await createApiKeyFile(secret, '/tmp/llama-test-secret', 'linux')
  const profile = validateLaunchProfile({ ...launchProfile, host: '0.0.0.0', apiKeyFile: keyFile }, launchVariant)
  const invocation = buildServerInvocation(profile, { bin: '/runtime/llama-server', path: '/runtime', version: 'b4000' } as any, { localPath: '/models/test.gguf' } as any)
  assert.equal(invocation.args.includes(secret), false)
  assert.equal(invocation.args.includes(keyFile), true)
  await (await import('node:fs/promises')).rm('/tmp/llama-test-secret', { recursive: true, force: true })
}

const testHealthTimeoutCleansProcess = async () => {
  let cleaned = false
  await assert.rejects(waitForServerHealth(async () => false, async () => { cleaned = true }, { timeoutMs: 5, intervalMs: 1 }), /health check timed out/)
  assert.equal(cleaned, true)
}

const testColdServerHelpCanTakeLongerThanTenSeconds = async () => {
  if (process.platform === 'win32') return
  const fs = await import('node:fs/promises')
  const os = await import('node:os')
  const path = await import('node:path')
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'llama-help-'))
  try {
    const bin = path.join(root, 'slow-llama-server')
    await fs.writeFile(bin, '#!/usr/bin/env node\nsetTimeout(() => console.log("--model --host --port"), 10_500)\n', { mode: 0o700 })
    assert.match(await readServerHelp(bin), /--model --host --port/)
    await assert.rejects(readServerHelp(bin, 20), /Timed out while checking llama-server options/)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}

const testHealthTimeoutReportsCleanupFailureWithoutClaimingStopped = async () => {
  await assert.rejects(
    waitForServerHealth(async () => false, async () => { throw new Error('stop failed') }, { timeoutMs: 2, intervalMs: 1 }),
    /health check timed out; cleanup failed: stop failed/
  )
}

const testStopVerificationRejectsRemainingProcessesAndPidFiles = () => {
  assert.doesNotThrow(() => assertServerStopped(['1'], [], false))
  assert.throws(() => assertServerStopped(['1'], ['1'], false), /still running/)
  assert.throws(() => assertServerStopped([], [], true), /PID file remains/)
}

const testStopWaitsForExitBeforeRemovingManagedPidFile = async () => {
  const fs = await import('node:fs/promises')
  const os = await import('node:os')
  const path = await import('node:path')
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'llama-stop-'))
  const pidFile = path.join(root, 'llama-server.pid')
  try {
    await fs.writeFile(pidFile, '321')
    let checks = 0
    await waitForServerStopped(['321'], async () => (++checks < 3 ? ['321'] : []), pidFile, { timeoutMs: 100, intervalMs: 1 })
    assert.equal(checks, 3)
    await assert.rejects(fs.access(pidFile), /ENOENT/)

    await fs.writeFile(pidFile, '321')
    await assert.rejects(waitForServerStopped(['321'], async () => ['321'], pidFile, { timeoutMs: 5, intervalMs: 1 }), /still running/)
    await fs.access(pidFile)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}

const testManagedModelPathConfinement = async () => {
  const fs = await import('node:fs/promises')
  const os = await import('node:os')
  const path = await import('node:path')
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'llama-model-root-'))
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'llama-model-outside-'))
  try {
    const model = path.join(root, 'weights.gguf')
    const externalModel = path.join(outside, 'external.gguf')
    await fs.writeFile(model, 'model')
    await fs.writeFile(externalModel, 'external')
    assert.equal(await validateManagedModelPath(model, root), await fs.realpath(model))
    await assert.rejects(validateManagedModelPath(externalModel, root), /inside the managed models directory/)
    await fs.symlink(externalModel, path.join(root, 'linked.gguf'))
    await assert.rejects(validateManagedModelPath(path.join(root, 'linked.gguf'), root), /inside the managed models directory/)
    const shard = path.join(root, 'model-00001-of-00002.gguf')
    await fs.writeFile(shard, 'shard')
    await assert.rejects(validateManagedModelPath(shard, root), /standalone GGUF model/i)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
    await fs.rm(outside, { recursive: true, force: true })
  }
}

const testForkRejectsSupportingRepositoryPathBeforeLaunch = async () => {
  const fs = await import('node:fs/promises')
  const os = await import('node:os')
  const path = await import('node:path')
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llama-support-start-'))
  const savedServer = global.Server
  try {
    global.Server = { ...savedServer, BaseDir: baseDir } as typeof global.Server
    const localPath = path.join(baseDir, 'llama-cpp', 'models', 'other.gguf')
    await fs.mkdir(path.dirname(localPath), { recursive: true })
    await fs.writeFile(localPath, 'auxiliary')
    const model = { repoId: 'org/model', revision: 'main', path: 'MTP/other.gguf', size: 10, downloadUrl: 'https://example.test/other.gguf', localPath, downloadedAt: 1 }
    const version = { bin: '/runtime/llama-server', path: '/runtime', version: 'b4000', note: JSON.stringify({ platform: 'linux', arch: 'x64', backend: 'cuda' }) } as any
    await assert.rejects(Promise.resolve(new LlamaCppModule()._startServer(version, { ...launchProfile, modelPath: model.localPath }, model).on(() => {})), /standalone GGUF model/)
  } finally {
    global.Server = savedServer
    await fs.rm(baseDir, { recursive: true, force: true })
  }
}

const testActiveRuntimeMustStopBeforeMutation = async () => {
  const target = '/data/runtimes/b4000-linux-x64-cuda-12.4'
  const paths: RuntimePaths = { cacheDir: '/data/cache', runtimeRoot: '/data/runtimes', stagingRoot: '/data/staging' }
  let installs = 0
  const module = new LlamaCppModule({
    getHost: () => ({ platform: 'linux', arch: 'x64' }), getPaths: () => paths,
    fetchReleases: async () => [], install: async () => { installs++; return {} as any },
    remove: async () => {}, read: async () => '', list: async () => [], exists: () => false
  })
  const active = { path: target } as any
  ;(module as any).activeRuntime = active
  let stopped = 0
  ;(module as any)._stopServer = () => ({ on: async () => { stopped++; return true } })
  await module.installRuntimeVariant(launchVariant)
  assert.equal(stopped, 1)
  assert.equal(installs, 1)

  ;(module as any).activeRuntime = active
  ;(module as any)._stopServer = () => ({ on: async () => { throw new Error('stop failed') } })
  await assert.rejects(async () => { await module.removeRuntimeVariant(target) }, /stop failed/)
}

const testManagedServerSurvivesForkRestartForDeletionGuard = () => {
  const baseDir = '/data/FlyEnv-Data'
  const processes = [{ PID: '123', PPID: '1', USER: 'user', COMMAND: '/data/FlyEnv-Data/llama-cpp/runtimes/b1/llama-server -m /data/FlyEnv-Data/llama-cpp/models/model.gguf' }]
  assert.equal(isManagedModelActive(processes, baseDir, '/data/FlyEnv-Data/llama-cpp/models/model.gguf'), true)
  assert.equal(isManagedModelActive(processes, baseDir, '/data/FlyEnv-Data/llama-cpp/models/other.gguf'), false)
  assert.equal(isManagedModelActive([{ ...processes[0], COMMAND: '/other/llama-server -m /other/model.gguf' }], baseDir, '/data/FlyEnv-Data/llama-cpp/models/model.gguf'), false)
  assert.equal(isManagedModelActive([{ ...processes[0], COMMAND: 'llama-server.exe --model C:\\FlyEnv-Data\\llama-cpp\\models\\one.gguf' }], 'C:\\FlyEnv-Data', 'C:\\FlyEnv-Data\\llama-cpp\\models\\one.gguf', '123'), true)
  assert.equal(isManagedModelActive([{ ...processes[0], COMMAND: 'llama-server.exe --model' }], baseDir, '/data/FlyEnv-Data/llama-cpp/models/model.gguf', '123'), true)
}

const testForkDeletesOnlyInactiveModelsUsingLiveProcesses = async () => {
  const fs = await import('node:fs/promises')
  const os = await import('node:os')
  const path = await import('node:path')
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llama-delete-'))
  const savedServer = global.Server
  const modelRoot = path.join(baseDir, 'llama-cpp', 'models')
  const active = path.join(modelRoot, 'active.gguf')
  const inactive = path.join(modelRoot, 'inactive.gguf')
  const process = { PID: '123', PPID: '1', USER: 'user', COMMAND: `${path.join(baseDir, 'llama-cpp', 'runtimes', 'b1', 'llama-server')} -m ${active}` }
  try {
    global.Server = { ...savedServer, BaseDir: baseDir } as typeof global.Server
    await fs.mkdir(modelRoot, { recursive: true })
    await fs.writeFile(active, 'active')
    await fs.writeFile(inactive, 'inactive')
    const module = new LlamaCppModule()
    setStopProcessListProvider(async () => [process])
    await assert.rejects(async () => { await module.deleteLocalModel(active) }, /Stop the active server/)
    await module.deleteLocalModel(inactive)
    assert.equal(await fs.stat(active).then(() => true, () => false), true)
    assert.equal(await fs.stat(inactive).then(() => true, () => false), false)
    setStopProcessListProvider(async () => [])
    await module.deleteLocalModel(active)
    assert.equal(await fs.stat(active).then(() => true, () => false), false)
  } finally {
    setStopProcessListProvider()
    global.Server = savedServer
    await fs.rm(baseDir, { recursive: true, force: true })
  }
}

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const testControllerRejectsDuplicateRuntimeInstall = async () => {
  const pending = deferred<unknown>()
  const transport: ControllerTransport = { request: () => pending.promise as Promise<any> }
  const controller = new LlamaCppController(transport)
  const first = controller.installRuntime(launchVariant)
  await assert.rejects(controller.installRuntime(launchVariant), /already in progress/)
  pending.resolve(true)
  await first
}

const testControllerKeepsProgressUntilTerminalEvent = async () => {
  const pending = deferred<unknown>()
  const transport: ControllerTransport = { request: (_method, _args, progress) => { progress({ downloaded: 55, total: 100 }); return pending.promise as Promise<any> } }
  const controller = reactive(new LlamaCppController(transport))
  const busy = computed(() => ['starting', 'running'].includes(controller.runtimeOperation?.status ?? ''))
  const task = controller.installRuntime(launchVariant)
  assert.equal(controller.runtimeOperation?.progress?.downloaded, 55)
  assert.equal(controller.runtimeOperation?.status, 'running')
  assert.equal(busy.value, true)
  pending.resolve(true)
  await task
  assert.equal(controller.runtimeOperation?.status, 'success')
  assert.equal(busy.value, false)
}

const testRuntimeWaitsForInstalledRefresh = async () => {
  const pending = deferred<void>()
  let refreshes = 0
  const controller = reactive(new LlamaCppController(
    { request: async () => ({ path: '/data/runtime' }) } as ControllerTransport,
    async (target) => {
      assert.deepEqual(target, { path: '/data/runtime', installed: true })
      refreshes++
      await pending.promise
    }
  ))
  const task = controller.installRuntime(launchVariant)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(refreshes, 1)
  assert.equal(controller.runtimeOperation?.status, 'starting')
  await assert.rejects(controller.installRuntime(launchVariant), /already in progress/)
  pending.resolve()
  await task
  assert.equal(controller.runtimeOperation?.status, 'success')
}

const testControllerReentryRetainsOperation = () => {
  assert.equal(LlamaCppManager, LlamaCppManager)
  assert.ok(LlamaCppManager instanceof LlamaCppController)
}

const testControllerCancelClearsListener = async () => {
  const pending = deferred<unknown>()
  const calls: string[] = []
  let progress!: (data: any) => void
  const transport: ControllerTransport = {
    request: (method, _args, onProgress) => {
      calls.push(method)
      if (method === 'cancelModelDownload') return Promise.resolve(true) as Promise<any>
      progress = onProgress
      return pending.promise as Promise<any>
    }
  }
  const controller = new LlamaCppController(transport)
  const file: HubModelFile = { repoId: 'org/model', revision: 'main', path: 'm.gguf', size: 1, downloadUrl: 'https://example.test/m.gguf' }
  const task = controller.downloadModel(file, 'cancel-id').catch(() => undefined)
  assert.equal(controller.modelOperation?.targetKey, modelFileKey(file))
  await controller.cancelModelDownload('cancel-id')
  progress({ downloaded: 1, total: 2 })
  assert.equal(controller.modelOperation?.status, 'cancelling')
  pending.reject(new Error('aborted'))
  await task
  assert.equal(calls.includes('cancelModelDownload'), true)
  assert.equal(controller.modelOperation?.status, 'cancelled')
}

const testModelDownloadProgressTracksItsFileUntilTerminal = async () => {
  const originalSetItem = localForage.setItem
  localForage.setItem = async (_key, value) => value
  try {
    const pending = deferred<any>()
    let progress!: (data: any) => void
    const file: HubModelFile = { repoId: 'org/model', revision: 'main', path: 'm.gguf', size: 100, downloadUrl: 'https://example.test/m.gguf' }
    const controller = reactive(new LlamaCppController({ request: (_method, _args, onProgress) => { progress = onProgress; return pending.promise } }))
    const busy = computed(() => ['starting', 'running'].includes(controller.modelOperation?.status ?? ''))
    const task = controller.downloadModel(file, 'download-id')
    assert.equal(controller.modelOperation?.targetKey, modelFileKey(file))
    assert.deepEqual(controller.modelOperation?.targetFile, file)
    progress({ downloaded: 55, total: 100 })
    assert.equal(controller.modelOperation?.status, 'running')
    assert.equal(busy.value, true)
    assert.equal(controller.modelOperation?.progress?.downloaded, 55)
    await assert.rejects(controller.downloadModel(file), /already in progress/)
    pending.resolve({ ...file, localPath: '/data/m.gguf', downloadedAt: 1 })
    await task
    assert.equal(controller.modelOperation?.status, 'success')
    assert.equal(busy.value, false)
  } finally {
    localForage.setItem = originalSetItem
  }
}

const testTerminalEventAllowsRetry = async () => {
  let count = 0
  const controller = new LlamaCppController({ request: async () => ++count } as ControllerTransport)
  await controller.installRuntime(launchVariant)
  await controller.installRuntime(launchVariant)
  assert.equal(count, 2)
}

const testControllerPersistsPlainSnapshotsFromReactiveState = async () => {
  const originalSetItem = localForage.setItem
  const snapshots: unknown[] = []
  localForage.setItem = async (_key, value) => {
    snapshots.push(structuredClone(value))
    return value
  }
  try {
    const file: HubModelFile = { repoId: 'org/model', revision: 'main', path: 'model.gguf', size: 10, downloadUrl: 'https://example.test/model.gguf' }
    const downloaded = { ...file, localPath: '/data/models/downloaded.gguf', downloadedAt: 1 }
    const controller = reactive(new LlamaCppController({ request: async () => downloaded } as ControllerTransport))
    await controller.selectModel(reactive({ ...downloaded, localPath: '/data/models/selected.gguf' }))
    await controller.saveProfile()
    await controller.downloadModel(file)
    await controller.deleteModel(downloaded)
    assert.equal(snapshots.length, 4)
    assert.equal((snapshots[0] as any).data.selectedModel.localPath, '/data/models/selected.gguf')
    assert.deepEqual((snapshots[3] as any).data, [])
  } finally {
    localForage.setItem = originalSetItem
  }
}

const testFirstDownloadSelectsModelAndDeleteMovesSelection = async () => {
  const originalSetItem = localForage.setItem
  const saved = new Map<string, any>()
  const calls: { method: string; args: unknown[] }[] = []
  localForage.setItem = async (key, value) => {
    saved.set(key, structuredClone(value))
    return value
  }
  try {
    const firstFile: HubModelFile = {
      repoId: 'org/model',
      revision: 'main',
      path: 'one.gguf',
      size: 1,
      downloadUrl: 'https://example.test/one.gguf'
    }
    const secondFile: HubModelFile = { ...firstFile, path: 'two.gguf' }
    const controller = new LlamaCppController({
      request: async (method, args) => {
        calls.push({ method, args })
        if (method === 'downloadHubModelFile')
          return {
            ...(args[1] as HubModelFile),
            localPath: `/data/${(args[1] as HubModelFile).path}`,
            downloadedAt: 1
          }
        if (method === 'deleteLocalModel') return undefined
        throw new Error(`Unexpected ${method}`)
      }
    } as ControllerTransport)
    await controller.downloadModel(firstFile)
    assert.equal(controller.selectedModel?.localPath, '/data/one.gguf')
    assert.equal(controller.profile.modelPath, '/data/one.gguf')
    assert.equal(
      saved.get('flyenv-llama-cpp-settings')?.data.selectedModel.localPath,
      '/data/one.gguf'
    )
    await controller.downloadModel(secondFile)
    assert.equal(controller.selectedModel?.localPath, '/data/one.gguf')
    await controller.deleteModel(controller.localModels[0])
    assert.equal(controller.selectedModel?.localPath, '/data/two.gguf')
    assert.deepEqual(calls.find((call) => call.method === 'deleteLocalModel')?.args, [
      '/data/one.gguf'
    ])
    await controller.deleteModel(controller.localModels[0])
    assert.equal(controller.selectedModel, undefined)
    assert.equal(controller.profile.modelPath, '')
    assert.equal(saved.get('flyenv-llama-cpp-settings')?.data.selectedModel, undefined)
  } finally {
    localForage.setItem = originalSetItem
  }
}

const testSupportingDownloadDoesNotBecomeCurrentModel = async () => {
  const originalSetItem = localForage.setItem
  const saved = new Map<string, any>()
  localForage.setItem = async (key, value) => { saved.set(key, structuredClone(value)); return value }
  try {
    const supporting: HubModelFile = { repoId: 'org/model', revision: 'main', path: 'MTP/mtp-model.gguf', size: 10, downloadUrl: 'https://example.test/mtp.gguf' }
    const standalone: HubModelFile = { ...supporting, path: 'Qwen3.6-27B-NVFP4-Q4_K_M-mtp.gguf' }
    const controller = new LlamaCppController({ request: async (_method, args) => ({
      ...(args[1] as HubModelFile), localPath: `/data/${(args[1] as HubModelFile).path.split('/').at(-1)}`, downloadedAt: 1,
      standalone: !['MTP/mtp-model.gguf', 'ambiguous.gguf'].includes((args[1] as HubModelFile).path)
    }) } as ControllerTransport)
    await controller.downloadModel(supporting)
    assert.equal(controller.modelOperation?.status, 'success')
    assert.equal(controller.localModels.length, 1)
    assert.equal(controller.selectedModel, undefined)
    assert.equal(controller.profile.modelPath, '')
    assert.equal(saved.get('flyenv-llama-cpp-settings'), undefined)
    await controller.downloadModel({ ...supporting, path: 'ambiguous.gguf' })
    assert.equal(controller.selectedModel, undefined)
    await controller.downloadModel(standalone)
    assert.equal((controller.selectedModel as { path: string } | undefined)?.path, standalone.path)
    assert.equal(controller.profile.modelPath, '/data/Qwen3.6-27B-NVFP4-Q4_K_M-mtp.gguf')
  } finally {
    localForage.setItem = originalSetItem
  }
}

const testAuxiliaryLocalModelCannotBecomeCurrent = async () => {
  const originalGetItem = localForage.getItem
  const originalSetItem = localForage.setItem
  const originalRemoveItem = localForage.removeItem
  const auxiliary = { repoId: 'org/model', revision: 'main', path: 'imatrix_unsloth.gguf', size: 10, downloadUrl: 'https://example.test/aux', localPath: '/data/imatrix_unsloth.gguf', downloadedAt: 1 }
  const runnable = { ...auxiliary, path: 'model-Q4_K_M.gguf', localPath: '/data/model-Q4_K_M.gguf' }
  const saved = new Map<string, any>([
    ['flyenv-llama-cpp-settings', { data: { profile: { modelPath: auxiliary.localPath }, selectedModel: auxiliary } }],
    ['flyenv-llama-cpp-models', { data: [auxiliary, runnable] }]
  ])
  localForage.getItem = async (key) => saved.get(key)
  localForage.setItem = async (key, value) => { saved.set(key, value); return value }
  localForage.removeItem = async (key) => { saved.delete(key) }
  try {
    const controller = new LlamaCppController({ request: async (method) => {
      if (method === 'deleteLocalModel') return undefined
      throw new Error(`Unexpected ${method}`)
    } } as ControllerTransport)
    await controller.init()
    assert.equal(controller.selectedModel?.localPath, runnable.localPath)
    assert.equal(controller.profile.modelPath, runnable.localPath)
    assert.equal(saved.get('flyenv-llama-cpp-settings')?.data.selectedModel.localPath, runnable.localPath)
    await assert.rejects(controller.selectModel(auxiliary), /standalone GGUF model/i)
    await controller.deleteModel(runnable)
    assert.equal(controller.selectedModel, undefined)
    assert.equal(controller.localModels.length, 1)
  } finally {
    localForage.getItem = originalGetItem
    localForage.setItem = originalSetItem
    localForage.removeItem = originalRemoveItem
  }
}

const testStartArgumentsAreCloneable = async () => {
  const originalSetItem = localForage.setItem
  localForage.setItem = async (_key, value) => { structuredClone(value); return value }
  try {
    const model = reactive({ repoId: 'org/model', revision: 'main', path: 'one.gguf', size: 1, downloadUrl: 'https://example.test/one.gguf', localPath: '/data/one.gguf', downloadedAt: 1 })
    const controller = reactive(new LlamaCppController())
    controller.selectedModel = model
    const args = await controller.startParameters('metal')
    assert.doesNotThrow(() => structuredClone(args))
    assert.equal(args[0].backend, 'metal')
    assert.equal(args[0].modelPath, model.localPath)
  } finally { localForage.setItem = originalSetItem }
}

const testModelSwitchLifecycle = async () => {
  const originalSetItem = localForage.setItem
  localForage.setItem = async (_key, value) => value
  try {
    const first = { repoId: 'org/model', revision: 'main', path: 'one.gguf', size: 1, downloadUrl: 'https://example.test/one.gguf', localPath: '/data/one.gguf', downloadedAt: 1 }
    const second = { ...first, path: 'two.gguf', localPath: '/data/two.gguf' }
    const controller = new LlamaCppController()
    await controller.init()
    controller.localModels = [first, second]
    controller.selectedModel = first
    const events: string[] = []
    const service: ModelService = {
      run: true, running: false,
      stop: async () => { events.push('stop'); service.run = false; return true },
      start: async () => { events.push(`start:${controller.selectedModel?.path}`); service.run = true; return true }
    }
    await controller.switchModel(second, service)
    assert.deepEqual(events, ['stop', 'start:two.gguf'])
    assert.equal(controller.selectedModel?.path, 'two.gguf')
    assert.equal(controller.modelSwitchOperation?.status, 'success')
    await controller.switchModel(first, { ...service, run: false })
    assert.equal(controller.selectedModel?.path, 'one.gguf')
    assert.deepEqual(events, ['stop', 'start:two.gguf'])

    service.stop = async () => 'stop failed'
    await assert.rejects(controller.switchModel(second, service), /stop failed/)
    assert.equal(controller.selectedModel?.path, 'one.gguf')
    assert.equal(controller.modelSwitchOperation?.status, 'failed')

    service.stop = async () => { service.run = false; return true }
    let starts = 0
    service.start = async () => { starts++; if (starts === 1) return 'start failed'; service.run = true; return true }
    await assert.rejects(controller.switchModel(second, service), /start failed/)
    assert.equal(controller.selectedModel?.path, 'one.gguf')
    assert.equal(service.run, true)
    assert.equal(starts, 2)
    service.start = async () => { service.run = true; return true }
    await controller.switchModel(second, service)
    assert.equal(controller.selectedModel?.path, 'two.gguf')

    const pendingStop = deferred<string | boolean>()
    service.stop = () => pendingStop.promise
    const switching = controller.switchModel(first, service)
    await new Promise((resolve) => setImmediate(resolve))
    await assert.rejects(controller.switchModel(first, service), /already in progress/)
    pendingStop.resolve(true)
    await switching
    assert.equal(controller.modelSwitchOperation?.status, 'success')
  } finally { localForage.setItem = originalSetItem }
}

const testHubRequestErrorReportsProxyState = () => {
  assert.match(formatHubRequestError(new Error('socket disconnected'), false).message, /FlyEnv proxy: off/)
  assert.match(formatHubRequestError(new Error('socket disconnected'), true).message, /FlyEnv proxy: on/)
  const refused = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:7890'), { code: 'ECONNREFUSED' })
  assert.match(
    formatHubRequestError(refused, { host: '127.0.0.1', port: '7890' }).message,
    /127\.0\.0\.1:7890.*not accepting connections.*FlyEnv proxy settings/i
  )
  assert.match(
    formatHubRequestError(new Error('Client network socket disconnected before secure TLS connection was established'), { host: '127.0.0.1', port: '7890' }).message,
    /TLS.*proxy.*huggingface\.co/i
  )
}

const testHubRequestUsesFlyEnvProxy = async () => {
  const originalGet = axios.get
  const originalServer = global.Server
  const proxies: unknown[] = []
  try {
    global.Server = { ...originalServer, Proxy: { https_proxy: 'http://127.0.0.1:7890' } } as typeof global.Server
    ;(axios as any).get = async (_url: string, options: { proxy: unknown }) => {
      proxies.push(options.proxy)
      return { data: [] }
    }
    await searchHubModels('')
    assert.deepEqual(proxies[0], { protocol: 'http', host: '127.0.0.1', port: '7890' })
    delete global.Server.Proxy
    await searchHubModels('')
    assert.equal(proxies[1], false)
  } finally {
    ;(axios as any).get = originalGet
    global.Server = originalServer
  }
}

const testHubTreeReadsNextLinkFromProductionResponse = async () => {
  const originalGet = axios.get
  const originalServer = global.Server
  const urls: string[] = []
  try {
    global.Server = { ...originalServer, Proxy: { https_proxy: 'http://127.0.0.1:17891' } } as typeof global.Server
    ;(axios as any).get = async (url: string) => {
      urls.push(url)
      return urls.length === 1
        ? { data: [{ type: 'file', path: 'first.gguf', size: 10 }], headers: { link: '<https://huggingface.co/api/models/org/model/tree/main?recursive=true&cursor=next>; rel="next"' } }
        : { data: [{ type: 'file', path: 'second.gguf', size: 20 }], headers: {} }
    }
    assert.deepEqual((await getHubModelFiles('org/model')).map((file) => file.path), ['first.gguf', 'second.gguf'])
    assert.equal(urls.length, 2)
  } finally {
    ;(axios as any).get = originalGet
    global.Server = originalServer
  }
}

const testHubCatalogRetriesTransientTlsDisconnect = async () => {
  const originalGet = axios.get
  const originalServer = global.Server
  let calls = 0
  try {
    global.Server = { ...originalServer, Proxy: { https_proxy: 'http://127.0.0.1:17891' } } as typeof global.Server
    ;(axios as any).get = async () => {
      calls++
      if (calls === 1) throw Object.assign(new Error('Client network socket disconnected before secure TLS connection was established'), { code: 'ECONNRESET' })
      return { data: [{ id: 'org/model-GGUF' }] }
    }
    assert.equal((await searchHubModels(''))[0].id, 'org/model-GGUF')
    assert.equal(calls, 2)
  } finally {
    ;(axios as any).get = originalGet
    global.Server = originalServer
  }
}

const testHubDownloadRetriesTransientTlsDisconnect = async () => {
  const originalGet = axios.get
  const originalServer = global.Server
  const fs = await import('node:fs/promises')
  const os = await import('node:os')
  const path = await import('node:path')
  const { Readable } = await import('node:stream')
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'llama-retry-'))
  let calls = 0
  try {
    global.Server = { ...originalServer, Proxy: { https_proxy: 'http://127.0.0.1:17891' } } as typeof global.Server
    ;(axios as any).get = async () => {
      calls++
      if (calls === 1) throw Object.assign(new Error('Client network socket disconnected before secure TLS connection was established'), { code: 'ECONNRESET' })
      return { data: Readable.from([Buffer.from('ok')]), headers: { 'content-length': '2' } }
    }
    const target = path.join(root, 'model.gguf')
    await createModelDownloadDeps().download('https://huggingface.co/org/model/resolve/main/model.gguf', target, new AbortController().signal, () => {})
    assert.equal(await fs.readFile(target, 'utf8'), 'ok')
    assert.equal(calls, 2)
  } finally {
    ;(axios as any).get = originalGet
    global.Server = originalServer
    await fs.rm(root, { recursive: true, force: true })
  }
}

const testHubDownloadReportsProxyFailureAndPreservesCancellation = async () => {
  const originalGet = axios.get
  const originalServer = global.Server
  try {
    global.Server = { ...originalServer, Proxy: { https_proxy: 'http://127.0.0.1:7890' } } as typeof global.Server
    const refused = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:7890'), { code: 'ECONNREFUSED' })
    ;(axios as any).get = async () => { throw refused }
    await assert.rejects(createModelDownloadDeps().download('https://huggingface.co/org/model/resolve/main/model.gguf', '/unused', new AbortController().signal, () => {}), /Proxy 127\.0\.0\.1:7890 is not accepting connections/)
    const canceled = Object.assign(new Error('canceled'), { code: 'ERR_CANCELED' })
    ;(axios as any).get = async () => { throw canceled }
    await assert.rejects(createModelDownloadDeps().download('https://huggingface.co/org/model/resolve/main/model.gguf', '/unused', new AbortController().signal, () => {}), (error: unknown) => error === canceled)
  } finally {
    ;(axios as any).get = originalGet
    global.Server = originalServer
  }
}

const testControllerTransportCleansListenerAtTerminal = async () => {
  let callback: ((key: string, response: any) => void) | undefined
  let removed = false
  let sensitive = false
  const ipc = {
    send: (_command: string, ..._args: unknown[]) => ({ then: (cb: (key: string, response: any) => void) => { callback = cb } }),
    sendSensitive: (_command: string, ..._args: unknown[]) => { sensitive = true; return { then: (cb: (key: string, response: any) => void) => { callback = cb } } },
    off: () => { removed = true }
  }
  const transport = createControllerTransport(ipc)
  const task = transport.request('createApiKeyFile', ['secret-key'], () => {}, true)
  callback?.('key', { code: 200, msg: { 'APP-On-Progress': { status: 'saving' } } })
  assert.equal(removed, false)
  callback?.('key', { code: 0, data: '/secret/keyfile' })
  assert.equal(await task, '/secret/keyfile')
  assert.equal(removed, true)
  assert.equal(sensitive, true)
}

const testModelCatalogCacheRequiresExplicitRefresh = async () => {
  const originalGetItem = localForage.getItem
  const originalSetItem = localForage.setItem
  const originalRemoveItem = localForage.removeItem
  const saved = new Map<string, unknown>()
  const calls: string[] = []
  const writes: string[] = []
  const removed: string[] = []
  let failRefresh = false
  localForage.getItem = async (key) => saved.get(key) as any
  localForage.setItem = async (key, value) => {
    writes.push(key)
    saved.set(key, value)
    return value
  }
  localForage.removeItem = async (key) => {
    removed.push(key)
    saved.delete(key)
  }
  const makeController = () =>
    new LlamaCppController({
      request: async (method, args) => {
        calls.push(`${method}:${JSON.stringify(args)}`)
        if (failRefresh) throw new Error('offline')
        if (method === 'searchHubModels')
          return [{ id: `org/model-${calls.length}`, downloads: 1, likes: 0 }]
        if (method === 'getHubModelFiles')
          return [
            {
              repoId: 'org/model',
              revision: 'main',
              path: `model-${calls.length}.gguf`,
              size: 1,
              downloadUrl: 'https://example.test/model.gguf'
            }
          ]
        throw new Error(`Unexpected ${method}`)
      }
    } as ControllerTransport)
  try {
    saved.set('flyenv-llama-cpp-hub-catalog', {
      data: { pages: { '["test",0]': [{ id: 'old', downloads: 0, likes: 0 }] }, files: {} }
    })
    const controller = makeController()
    const first = await controller.searchHubModels('test', 0)
    assert.deepEqual(await controller.searchHubModels('test', 0), first)
    assert.equal(calls.length, 1)
    await controller.searchHubModels('test', 1)
    await controller.searchHubModels('other', 0)
    assert.equal(calls.length, 3)
    const files = await controller.getHubModelFiles('org/model')
    assert.deepEqual(await controller.getHubModelFiles('org/model'), files)
    assert.equal(calls.length, 4)
    assert.equal(saved.has('flyenv-llama-cpp-hub-catalog'), false)
    const reopened = makeController()
    assert.notDeepEqual(await reopened.searchHubModels('test', 0), first)
    assert.notDeepEqual(await reopened.getHubModelFiles('org/model'), files)
    assert.equal(calls.length, 6)
    failRefresh = true
    await assert.rejects(reopened.searchHubModels('test', 0, true), /offline/)
    assert.equal((await reopened.searchHubModels('test', 0))[0].id, 'org/model-5')
    failRefresh = false
    await reopened.searchHubModels('test', 0, true)
    await reopened.getHubModelFiles('org/model')
    assert.equal(calls.length, 9)
    await reopened.searchHubModels('test', 1)
    assert.equal(calls.length, 10)

    const pending = deferred<HubModel[]>()
    let concurrentRequests = 0
    const concurrent = new LlamaCppController({
      request: () => {
        concurrentRequests++
        return pending.promise
      }
    } as ControllerTransport)
    await concurrent.init()
    const one = concurrent.searchHubModels('new-query', 0)
    const two = concurrent.searchHubModels('new-query', 0)
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(concurrentRequests, 1)
    pending.resolve([{ id: 'org/concurrent', downloads: 1, likes: 0 }])
    assert.deepEqual(await one, await two)

    const staleFileRequest = deferred<HubModelFile[]>()
    let fileRequests = 0
    const staleController = new LlamaCppController({
      request: async (method) => {
        if (method === 'searchHubModels') return [{ id: 'org/stale', downloads: 1, likes: 0 }]
        fileRequests++
        return fileRequests === 1 ? staleFileRequest.promise : []
      }
    } as ControllerTransport)
    await staleController.init()
    const oldFiles = staleController.getHubModelFiles('org/stale')
    await new Promise((resolve) => setImmediate(resolve))
    await staleController.searchHubModels('new-query', 0, true)
    staleFileRequest.resolve([
      {
        repoId: 'org/stale',
        revision: 'main',
        path: 'old.gguf',
        size: 1,
        downloadUrl: 'https://example.test/old.gguf'
      }
    ])
    await oldFiles
    assert.deepEqual(await staleController.getHubModelFiles('org/stale'), [])
    assert.equal(fileRequests, 2)
    assert.deepEqual(writes, [])
    assert.ok(removed.includes('flyenv-llama-cpp-hub-catalog'))
  } finally {
    localForage.getItem = originalGetItem
    localForage.setItem = originalSetItem
    localForage.removeItem = originalRemoveItem
  }
}

const testControllerInitializationIsCoalesced = async () => {
  const originalGetItem = localForage.getItem
  const pending = deferred<any>()
  let settingsReads = 0
  localForage.getItem = async (key) => {
    if (key === 'flyenv-llama-cpp-settings') {
      settingsReads++
      return pending.promise
    }
    return undefined as any
  }
  try {
    const controller = new LlamaCppController()
    const first = controller.init()
    const second = controller.init()
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(settingsReads, 1)
    pending.resolve({ data: { profile: {} } })
    await Promise.all([first, second])
  } finally {
    localForage.getItem = originalGetItem
  }
}

const testRuntimeCatalogCacheRequiresExplicitRefresh = async () => {
  const originalGetItem = localForage.getItem
  const originalSetItem = localForage.setItem
  const originalRemoveItem = localForage.removeItem
  const saved = new Map<string, unknown>()
  const writes: string[] = []
  let requests = 0
  localForage.getItem = async (key) => saved.get(key) as any
  localForage.setItem = async (key, value) => {
    structuredClone(value)
    writes.push(key)
    saved.set(key, value)
    return value
  }
  localForage.removeItem = async (key) => {
    saved.delete(key)
  }
  const makeController = () =>
    new LlamaCppController({
      request: async (method) => {
        if (method !== 'fetchRuntimeVariants') throw new Error(`Unexpected ${method}`)
        requests++
        if (requests === 4) throw new Error('offline')
        return [{ ...launchVariant, release: `b${requests}` }]
      }
    } as ControllerTransport)
  try {
    saved.set('flyenv-llama-cpp-settings', { data: { profile: { contextSize: 4096 } } })
    saved.set('flyenv-llama-cpp-runtime-variants', {
      data: { stable: [{ ...launchVariant, release: 'old' }] }
    })
    const controller = makeController()
    await controller.init()
    assert.equal(controller.profile.contextSize, 4096)
    assert.equal(saved.has('flyenv-llama-cpp-runtime-variants'), false)
    assert.equal((await controller.fetchRuntimeVariants('stable'))[0].release, 'b1')
    assert.equal((await controller.fetchRuntimeVariants('stable'))[0].release, 'b1')
    assert.equal(requests, 1)
    assert.equal((await controller.fetchRuntimeVariants('prerelease'))[0].release, 'b2')
    assert.equal((await controller.fetchRuntimeVariants('stable', true))[0].release, 'b3')
    await assert.rejects(controller.fetchRuntimeVariants('stable', true), /offline/)
    assert.equal((await controller.fetchRuntimeVariants('stable'))[0].release, 'b3')
    const reopened = makeController()
    await reopened.init()
    assert.equal((await reopened.fetchRuntimeVariants('stable'))[0].release, 'b5')
    assert.equal(requests, 5)

    const pending = deferred<RuntimeVariant[]>()
    let concurrentRequests = 0
    const concurrent = new LlamaCppController({
      request: () => {
        concurrentRequests++
        return pending.promise
      }
    } as ControllerTransport)
    await concurrent.init()
    const first = concurrent.fetchRuntimeVariants('stable', true)
    const second = concurrent.fetchRuntimeVariants('stable', true)
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(concurrentRequests, 1)
    pending.resolve([{ ...launchVariant, release: 'b5' }])
    assert.equal((await first)[0].release, 'b5')
    assert.equal((await second)[0].release, 'b5')
    assert.deepEqual(writes, [])
  } finally {
    localForage.getItem = originalGetItem
    localForage.setItem = originalSetItem
    localForage.removeItem = originalRemoveItem
  }
}

const testReactiveRuntimeIsCloneableAtIpcBoundary = async () => {
  let callback: ((key: string, response: unknown) => void) | undefined
  const ipc = {
    send: (_command: string, _method: string, ...args: unknown[]) => {
      structuredClone(args)
      return { then: (handler: typeof callback) => { callback = handler } }
    },
    sendSensitive: () => { throw new Error('unexpected sensitive request') },
    off: () => {}
  }
  const request = createControllerTransport(ipc)
  const task = request.request('installRuntimeVariant', [reactive({ ...launchVariant, companion: { ...launchVariant.companion } })], () => {})
  callback?.('key', { code: 0, data: true })
  assert.equal(await task, true)
}

const testModelSizeFitsOllamaHardwareRules = () => {
  const hardware = { ramGB: 16, vramGB: 8, loaded: true }
  assert.equal(getModelSizeColorForHardware(4, hardware), 'success')
  assert.equal(getModelSizeColorForHardware(7, hardware), 'warning')
  assert.equal(getModelSizeColorForHardware(12, hardware), 'danger')
  assert.equal(getModelSizeColorForHardware(4, { ramGB: 16, vramGB: 0, loaded: true }), 'warning')
  assert.equal(getModelSizeColorForHardware(4, { ...hardware, loaded: false }), undefined)
  assert.deepEqual(
    modelHardwareFromReport({
      memory: [{ Capacity: 8 * 1024 ** 3 }, { Capacity: 8 * 1024 ** 3 }],
      nvidia: [{ MemoryTotalMiB: 8192 }],
      gpu: [{ AdapterRAM: 2 * 1024 ** 3 }]
    }),
    hardware
  )
}

const testGeneratedApiKeyAndContextDefault = async () => {
  const first = generateApiKey()
  const second = generateApiKey()
  assert.match(first, /^[0-9a-f]{64}$/)
  assert.notEqual(first, second)
  assert.equal(new LlamaCppController().profile.contextSize, 8192)
}

const testExternalErrorsAreSafeForHtmlMessageHelper = () => {
  assert.equal(
    escapeNoticeText(new Error('Model already exists: <img src=x onerror="alert(1)">')),
    'Model already exists: &lt;img src=x onerror=&quot;alert(1)&quot;&gt;'
  )
}

void (async () => {
  testReleaseAssetParsing()
  await testStableRuntimeFetchPaginatesPastRecentPrereleases()
  testUnsupportedVariantFiltered()
  testCudaCompanionPairing()
  testCudaCompanionWithoutTagPairsAndMissingCompanionIsFiltered()
  testUnknownAssetRejected()
  await testRuntimeInstallDigestFailurePreservesActiveVersion()
  await testRuntimeInstallSizeFailurePreservesActiveVersion()
  await testRuntimeInstallMissingExecutableCleansStaging()
  await testRuntimeInstallSuccessPairsCudaRuntime()
  await testRuntimeDeleteRejectsOutsideRoot()
  testRuntimeRejectsUntrustedAssetUrl()
  testRuntimeRejectsMissingOrMismatchedCudaCompanion()
  await testHubSearchAnonymousPaginationAnd429()
  await testHubModelCatalogLoadsPopularGGUFModelsWithoutQuery()
  await testHubFileMetadata()
  await testHubFileListingFollowsPagination()
  await testSupportingGGUFDownloadIsAllowedButUnsafePathsAreRejected()
  await testDownloadedGGUFRoleIsReturnedToRenderer()
  testMainModelFilenameHintsAvoidKnownSidecars()
  await testGGUFContentsDistinguishDraftFromMainModel()
  await testModelDownloadDigestAndAtomicRename()
  await testSameNamedGGUFFilesKeepSeparateManagedPaths()
  await testDownloadRejectsRedirectedManagedDirectory()
  await testModelDownloadFailureCleansPartial()
  await testModelDeleteRejectsOutsideRoot()
  testBuildServerInvocationUsesArgv()
  testLaunchRejectsUnsupportedRuntimeFlags()
  testLaunchProfileRejectsUnknownBackendDevice()
  testLoopbackDoesNotRequireApiKey()
  testNonLoopbackRequiresApiKeyFile()
  await testApiKeyNeverAppearsInArgsOrLogs()
  await testColdServerHelpCanTakeLongerThanTenSeconds()
  await testHealthTimeoutCleansProcess()
  await testHealthTimeoutReportsCleanupFailureWithoutClaimingStopped()
  testStopVerificationRejectsRemainingProcessesAndPidFiles()
  await testStopWaitsForExitBeforeRemovingManagedPidFile()
  await testManagedModelPathConfinement()
  await testForkRejectsSupportingRepositoryPathBeforeLaunch()
  await testActiveRuntimeMustStopBeforeMutation()
  testManagedServerSurvivesForkRestartForDeletionGuard()
  await testForkDeletesOnlyInactiveModelsUsingLiveProcesses()
  await testControllerRejectsDuplicateRuntimeInstall()
  await testControllerKeepsProgressUntilTerminalEvent()
  await testRuntimeWaitsForInstalledRefresh()
  testControllerReentryRetainsOperation()
  await testControllerCancelClearsListener()
  await testModelDownloadProgressTracksItsFileUntilTerminal()
  await testTerminalEventAllowsRetry()
  await testControllerPersistsPlainSnapshotsFromReactiveState()
  await testFirstDownloadSelectsModelAndDeleteMovesSelection()
  await testSupportingDownloadDoesNotBecomeCurrentModel()
  await testAuxiliaryLocalModelCannotBecomeCurrent()
  await testStartArgumentsAreCloneable()
  await testModelSwitchLifecycle()
  testHubRequestErrorReportsProxyState()
  await testHubRequestUsesFlyEnvProxy()
  await testHubTreeReadsNextLinkFromProductionResponse()
  await testHubCatalogRetriesTransientTlsDisconnect()
  await testHubDownloadRetriesTransientTlsDisconnect()
  await testHubDownloadReportsProxyFailureAndPreservesCancellation()
  await testControllerTransportCleansListenerAtTerminal()
  await testRuntimeCatalogCacheRequiresExplicitRefresh()
  await testModelCatalogCacheRequiresExplicitRefresh()
  await testControllerInitializationIsCoalesced()
  await testReactiveRuntimeIsCloneableAtIpcBoundary()
  testModelSizeFitsOllamaHardwareRules()
  await testGeneratedApiKeyAndContextDefault()
  testExternalErrorsAreSafeForHtmlMessageHelper()
  console.log('llama.cpp plugin contract tests passed')
})()
