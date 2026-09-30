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
import { deleteLocalModel, downloadHubModelFile, getHubModelFiles, searchHubModels, type ModelDownloadDeps } from '../plugins/llamacpp/fork/models'
import type { HubModel, HubModelFile } from '../plugins/llamacpp/shared/types'
import { assertInvocationSupported, assertServerStopped, buildServerInvocation, createApiKeyFile, validateLaunchProfile, validateManagedModelPath, waitForServerHealth } from '../plugins/llamacpp/fork/config'
import { LlamaCppModule } from '../plugins/llamacpp/fork/LlamaCpp'
import type { LaunchProfile } from '../plugins/llamacpp/shared/types'
import { createControllerTransport, LlamaCppController, LlamaCppManager, modelFileKey, type ControllerTransport } from '../plugins/llamacpp/render/controller'
import { getModelSizeColorForHardware, modelHardwareFromReport } from '../src/render/util/ModelSize'
import { generateApiKey } from '../plugins/llamacpp/render/settings/key'
import { escapeNoticeText } from '../plugins/llamacpp/render/notice'

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

const fakeModelDeps = (config: { payload?: unknown; bytes?: string; digest?: string; failDownload?: boolean } = {}) => {
  const files = new Map<string, string>()
  let requestedUrl = ''
  const deps: ModelDownloadDeps = {
    requestJson: async (url) => {
      if (url.includes('models?')) return config.payload ?? []
      return config.payload ?? []
    },
    mkdir: async () => {},
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
    write: async (path, content) => { files.set(path, content) }
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
  const fixture = fakeModelDeps({ payload: [{ type: 'file', path: 'Q4/model.gguf', size: 10, lfs: { size: 10, oid: 'a'.repeat(64) } }, { type: 'file', path: 'README.md', size: 2 }] })
  const files = await getHubModelFiles('org/model', 'main', fixture.deps)
  assert.equal(files.length, 1)
  assert.equal(files[0].sha256, 'a'.repeat(64))
  assert.match(files[0].downloadUrl, /org\/model\/resolve\/main\/Q4\/model.gguf/)
}

const testModelDownloadDigestAndAtomicRename = async () => {
  const fixture = fakeModelDeps({ bytes: '1234567890', digest: 'a'.repeat(64) })
  const file: HubModelFile = { repoId: 'org/model', revision: 'main', path: 'Q4/model.gguf', size: 10, sha256: 'a'.repeat(64), license: 'apache-2.0', downloadUrl: 'https://example.test/model' }
  const model = await downloadHubModelFile('op-1', file, '/models', new AbortController().signal, () => {}, fixture.deps)
  assert.equal(model.localPath, '/models/model.gguf')
  assert.equal(model.license, 'apache-2.0')
  assert.equal(fixture.files.has('/models/model.gguf'), true)
  assert.match(fixture.requestedUrl, /^https:\/\/huggingface\.co\/org\/model\/resolve\/main\/Q4\/model\.gguf/)
  assert.equal([...fixture.files.keys()].some((path) => path.endsWith('.part')), false)
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
  } finally {
    await fs.rm(root, { recursive: true, force: true })
    await fs.rm(outside, { recursive: true, force: true })
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
  const saved = new Map<string, unknown>()
  const calls: string[] = []
  let failRefresh = false
  localForage.getItem = async (key) => saved.get(key) as any
  localForage.setItem = async (key, value) => { structuredClone(value); saved.set(key, value); return value }
  const makeController = () => new LlamaCppController({
    request: async (method, args) => {
      calls.push(`${method}:${JSON.stringify(args)}`)
      if (failRefresh) throw new Error('offline')
      if (method === 'searchHubModels') return [{ id: `org/model-${calls.length}`, downloads: 1, likes: 0 }]
      if (method === 'getHubModelFiles') return [{ repoId: 'org/model', revision: 'main', path: `model-${calls.length}.gguf`, size: 1, downloadUrl: 'https://example.test/model.gguf' }]
      throw new Error(`Unexpected ${method}`)
    }
  } as ControllerTransport)
  try {
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
    const reopened = makeController()
    assert.deepEqual(await reopened.searchHubModels('test', 0), first)
    assert.deepEqual(await reopened.getHubModelFiles('org/model'), files)
    assert.equal(calls.length, 4)
    failRefresh = true
    await assert.rejects(reopened.searchHubModels('test', 0, true), /offline/)
    assert.deepEqual(await reopened.searchHubModels('test', 0), first)
    assert.deepEqual(await reopened.getHubModelFiles('org/model'), files)
    failRefresh = false
    await reopened.searchHubModels('test', 0, true)
    await reopened.getHubModelFiles('org/model')
    assert.equal(calls.length, 7)
    await reopened.searchHubModels('test', 1)
    assert.equal(calls.length, 8)

    const pending = deferred<HubModel[]>()
    let concurrentRequests = 0
    const concurrent = new LlamaCppController({ request: () => { concurrentRequests++; return pending.promise } } as ControllerTransport)
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
    staleFileRequest.resolve([{ repoId: 'org/stale', revision: 'main', path: 'old.gguf', size: 1, downloadUrl: 'https://example.test/old.gguf' }])
    await oldFiles
    assert.deepEqual(await staleController.getHubModelFiles('org/stale'), [])
    assert.equal(fileRequests, 2)
  } finally {
    localForage.getItem = originalGetItem
    localForage.setItem = originalSetItem
  }
}

const testControllerInitializationIsCoalesced = async () => {
  const originalGetItem = localForage.getItem
  const pending = deferred<any>()
  let hubReads = 0
  localForage.getItem = async (key) => {
    if (key === 'flyenv-llama-cpp-hub-catalog') { hubReads++; return pending.promise }
    return undefined as any
  }
  try {
    const controller = new LlamaCppController()
    const first = controller.init()
    const second = controller.init()
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(hubReads, 1)
    pending.resolve({ data: { pages: {}, files: {} } })
    await Promise.all([first, second])
  } finally {
    localForage.getItem = originalGetItem
  }
}

const testRuntimeCatalogCacheRequiresExplicitRefresh = async () => {
  const originalGetItem = localForage.getItem
  const originalSetItem = localForage.setItem
  const saved = new Map<string, unknown>()
  let requests = 0
  localForage.getItem = async (key) => saved.get(key) as any
  localForage.setItem = async (key, value) => {
    structuredClone(value)
    saved.set(key, value)
    return value
  }
  const makeController = () => new LlamaCppController({
    request: async (method) => {
      if (method !== 'fetchRuntimeVariants') throw new Error(`Unexpected ${method}`)
      requests++
      if (requests === 4) throw new Error('offline')
      return [{ ...launchVariant, release: `b${requests}` }]
    }
  } as ControllerTransport)
  try {
    saved.set('flyenv-llama-cpp-settings', { data: { profile: { contextSize: 4096 } } })
    const controller = makeController()
    await controller.init()
    assert.equal(controller.profile.contextSize, 4096)
    assert.equal((await controller.fetchRuntimeVariants('stable'))[0].release, 'b1')
    assert.equal((await controller.fetchRuntimeVariants('stable'))[0].release, 'b1')
    assert.equal(requests, 1)
    assert.equal((await controller.fetchRuntimeVariants('prerelease'))[0].release, 'b2')
    assert.equal((await controller.fetchRuntimeVariants('stable', true))[0].release, 'b3')
    await assert.rejects(controller.fetchRuntimeVariants('stable', true), /offline/)
    assert.equal((await controller.fetchRuntimeVariants('stable'))[0].release, 'b3')
    const reopened = makeController()
    await reopened.init()
    assert.equal((await reopened.fetchRuntimeVariants('stable'))[0].release, 'b3')
    assert.equal(requests, 4)

    const pending = deferred<RuntimeVariant[]>()
    let concurrentRequests = 0
    const concurrent = new LlamaCppController({
      request: () => { concurrentRequests++; return pending.promise }
    } as ControllerTransport)
    await concurrent.init()
    const first = concurrent.fetchRuntimeVariants('stable', true)
    const second = concurrent.fetchRuntimeVariants('stable', true)
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(concurrentRequests, 1)
    pending.resolve([{ ...launchVariant, release: 'b5' }])
    assert.equal((await first)[0].release, 'b5')
    assert.equal((await second)[0].release, 'b5')
  } finally {
    localForage.getItem = originalGetItem
    localForage.setItem = originalSetItem
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
  await testModelDownloadDigestAndAtomicRename()
  await testModelDownloadFailureCleansPartial()
  await testModelDeleteRejectsOutsideRoot()
  testBuildServerInvocationUsesArgv()
  testLaunchRejectsUnsupportedRuntimeFlags()
  testLaunchProfileRejectsUnknownBackendDevice()
  testLoopbackDoesNotRequireApiKey()
  testNonLoopbackRequiresApiKeyFile()
  await testApiKeyNeverAppearsInArgsOrLogs()
  await testHealthTimeoutCleansProcess()
  await testHealthTimeoutReportsCleanupFailureWithoutClaimingStopped()
  testStopVerificationRejectsRemainingProcessesAndPidFiles()
  await testManagedModelPathConfinement()
  await testActiveRuntimeMustStopBeforeMutation()
  await testControllerRejectsDuplicateRuntimeInstall()
  await testControllerKeepsProgressUntilTerminalEvent()
  await testRuntimeWaitsForInstalledRefresh()
  testControllerReentryRetainsOperation()
  await testControllerCancelClearsListener()
  await testModelDownloadProgressTracksItsFileUntilTerminal()
  await testTerminalEventAllowsRetry()
  await testControllerPersistsPlainSnapshotsFromReactiveState()
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
