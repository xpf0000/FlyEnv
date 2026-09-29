import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { access, mkdir, readdir, rename, rm, chmod, writeFile, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import { spawn } from 'node:child_process'
import axios from 'axios'
import { unpack } from '@fork/util/Zip'
import { getAxiosProxy } from '@fork/util/Axios'
import type { SoftInstalled } from '@shared/app'
import type { RuntimeAsset, RuntimeVariant } from '../shared/types'

export interface RuntimePaths {
  cacheDir: string
  runtimeRoot: string
  stagingRoot: string
}

export interface RuntimeInstallDeps {
  mkdir(path: string): Promise<void>
  download(url: string, target: string, progress?: (downloaded: number, total?: number) => void): Promise<void>
  digest(path: string): Promise<string>
  size(path: string): Promise<number>
  extract(archive: string, target: string): Promise<void>
  exists(path: string): Promise<boolean>
  rename(from: string, to: string): Promise<void>
  remove(path: string): Promise<void>
  write(path: string, content: string): Promise<void>
  probe(bin: string): Promise<string>
  findExecutable?(root: string, name: string): Promise<string | undefined>
}

const defaultDeps: RuntimeInstallDeps = {
  mkdir: async (path) => mkdir(path, { recursive: true }).then(() => undefined),
  download: async (url, target, progress) => {
    if (!url.startsWith('https://')) throw new Error('Runtime downloads require HTTPS')
    const response = await axios.get(url, { responseType: 'stream', timeout: 0, proxy: getAxiosProxy(), maxRedirects: 5 })
    await mkdir(dirname(target), { recursive: true })
    const total = Number(response.headers['content-length']) || undefined
    let downloaded = 0
    const meter = new Transform({
      transform(chunk, _encoding, callback) {
        downloaded += chunk.length
        progress?.(downloaded, total)
        callback(null, chunk)
      }
    })
    await pipeline(response.data, meter, createWriteStream(target, { flags: 'wx' }))
  },
  digest: async (path) => {
    const hash = createHash('sha256')
    await pipeline((await import('node:fs')).createReadStream(path), hash)
    return hash.digest('hex')
  },
  size: async (path) => (await stat(path)).size,
  extract: (archive, target) => unpack(archive, target),
  exists: async (path) => access(path).then(() => true, () => false),
  rename,
  remove: (path) => rm(path, { recursive: true, force: true }),
  write: async (path, content) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, content) },
  probe: (bin) => new Promise((resolveProbe, reject) => {
    const child = spawn(bin, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let output = ''
    child.stdout?.on('data', (chunk) => { output += chunk.toString() })
    child.stderr?.on('data', (chunk) => { output += chunk.toString() })
    child.once('error', reject)
    child.once('close', (code) => code === 0 ? resolveProbe(output.trim()) : reject(new Error(`llama-server version probe failed (${code})`)))
  }),
  findExecutable: async (root, name) => {
    const visit = async (dir: string): Promise<string | undefined> => {
      for (const item of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, item.name)
        if (item.isDirectory()) {
          const nested = await visit(path)
          if (nested) return nested
        } else if (item.name.toLowerCase() === name.toLowerCase()) return path
      }
      return undefined
    }
    return visit(root).catch(() => undefined)
  }
}

export const runtimeDirectoryName = (variant: RuntimeVariant): string => [
  variant.release,
  variant.platform,
  variant.arch,
  variant.backend,
  variant.cudaVersion && variant.backend === 'cuda' && variant.cudaVersion
].filter(Boolean).join('-').replace(/[^a-zA-Z0-9._-]/g, '_')

export const validateRuntimeVariant = (variant: RuntimeVariant): void => {
  const allowed = (candidate: RuntimeVariant) =>
    (candidate.platform === 'windows' && candidate.arch === 'x64' && ['cpu', 'cuda', 'vulkan'].includes(candidate.backend)) ||
    (candidate.platform === 'macos' && candidate.arch === 'arm64' && candidate.backend === 'metal') ||
    (candidate.platform === 'linux' && candidate.arch === 'x64' && ['cpu', 'cuda', 'vulkan'].includes(candidate.backend)) ||
    (candidate.platform === 'linux' && candidate.arch === 'arm64' && ['cpu', 'vulkan'].includes(candidate.backend))
  const validateAsset = (asset: RuntimeAsset) => {
    if (!asset.assetName || asset.assetName !== asset.assetName.split(/[\\/]/).pop()) throw new Error('Invalid runtime asset name')
    let url: URL
    try { url = new URL(asset.assetUrl) } catch { throw new Error('Invalid runtime asset URL') }
    const segments = url.pathname.split('/').map((segment) => decodeURIComponent(segment))
    if (url.origin !== 'https://github.com' || segments[1] !== 'ggml-org' || segments[2] !== 'llama.cpp' || segments[3] !== 'releases' || segments[4] !== 'download' || segments.at(-1) !== asset.assetName || url.username || url.password) {
      throw new Error('Runtime assets must come from official llama.cpp GitHub releases')
    }
    if (asset.sha256 && !/^[a-f\d]{64}$/i.test(asset.sha256)) throw new Error('Invalid runtime SHA-256 digest')
    return segments.at(-2)
  }
  if (!allowed(variant) || !variant.release || !Number.isFinite(variant.size) || variant.size < 0) throw new Error('Unsupported llama.cpp runtime variant')
  if (variant.backend === 'cuda' ? !/^\d+(?:\.\d+)?$/.test(variant.cudaVersion ?? '') : variant.cudaVersion !== undefined) throw new Error('Invalid CUDA runtime identity')
  if (validateAsset(variant) !== variant.release) throw new Error('Runtime asset tag does not match the selected release')
  if (variant.companion && (variant.companion.assetName !== `cudart-${variant.assetName}` || validateAsset(variant.companion) !== variant.release)) {
    throw new Error('CUDA companion must match the selected release archive')
  }
}

const verifyAsset = async (asset: RuntimeAsset, archive: string, deps: RuntimeInstallDeps) => {
  if (asset.size > 0 && await deps.size(archive) !== asset.size) throw new Error(`Size verification failed for ${asset.assetName}`)
  if (!asset.sha256) return
  const actual = (await deps.digest(archive)).toLowerCase()
  if (actual !== asset.sha256.toLowerCase()) throw new Error(`SHA-256 verification failed for ${asset.assetName}`)
}

const resolveServer = async (root: string, platform: RuntimeVariant['platform'], deps: RuntimeInstallDeps) => {
  const name = platform === 'windows' ? 'llama-server.exe' : 'llama-server'
  const found = deps.findExecutable ? await deps.findExecutable(root, name) : (await deps.exists(join(root, name)) ? join(root, name) : undefined)
  if (!found) throw new Error(`Runtime archive does not contain ${name}`)
  return found
}

export const installRuntime = async (
  variant: RuntimeVariant,
  paths: RuntimePaths,
  deps: RuntimeInstallDeps = defaultDeps,
  onProgress?: (assetName: string, downloaded: number, total?: number) => void
): Promise<SoftInstalled> => {
  validateRuntimeVariant(variant)
  const id = runtimeDirectoryName(variant)
  const finalDir = join(paths.runtimeRoot, id)
  const stageDir = join(paths.stagingRoot, `${id}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const runtimeStage = join(stageDir, 'runtime')
  const backupDir = `${finalDir}.previous-${Date.now()}`
  await deps.mkdir(paths.runtimeRoot)
  await deps.mkdir(paths.stagingRoot)
  await deps.mkdir(stageDir)
  let movedOld = false
  try {
    const mainArchive = join(stageDir, variant.assetName.split(/[\\/]/).pop()!)
    await deps.download(variant.assetUrl, mainArchive, (downloaded, total) => onProgress?.(variant.assetName, downloaded, total))
    await verifyAsset(variant, mainArchive, deps)
    await deps.mkdir(runtimeStage)
    await deps.extract(mainArchive, runtimeStage)
    if (variant.companion) {
      const companionArchive = join(stageDir, variant.companion.assetName.split(/[\\/]/).pop()!)
      await deps.download(variant.companion.assetUrl, companionArchive, (downloaded, total) => onProgress?.(variant.companion!.assetName, downloaded, total))
      await verifyAsset(variant.companion, companionArchive, deps)
      await deps.extract(companionArchive, runtimeStage)
    }
    const stagedBin = await resolveServer(runtimeStage, variant.platform, deps)
    const probeResult = await deps.probe(stagedBin)
    const bin = join(finalDir, relative(runtimeStage, stagedBin))
    if (variant.platform !== 'windows') await chmod(stagedBin, 0o755).catch(() => {})
    await deps.write(join(runtimeStage, 'flyenv-runtime.json'), JSON.stringify({ ...variant, executable: relative(runtimeStage, stagedBin) }, null, 2))
    if (await deps.exists(finalDir)) {
      await deps.rename(finalDir, backupDir)
      movedOld = true
    }
    await deps.rename(runtimeStage, finalDir)
    if (movedOld) await deps.remove(backupDir)
    await deps.remove(stageDir)
    return {
      typeFlag: 'llama-cpp' as SoftInstalled['typeFlag'],
      version: variant.release,
      bin,
      path: finalDir,
      num: null,
      enable: false,
      run: false,
      running: false,
      flag: variant.backend,
      note: JSON.stringify({ platform: variant.platform, arch: variant.arch, backend: variant.backend, cudaVersion: variant.cudaVersion, probe: probeResult })
    }
  } catch (error) {
    await deps.remove(stageDir).catch(() => {})
    if (movedOld && !(await deps.exists(finalDir)) && await deps.exists(backupDir)) {
      await deps.rename(backupDir, finalDir).catch(() => {})
    }
    throw error
  }
}

export const removeRuntime = async (target: string, runtimeRoot: string, deps: RuntimeInstallDeps = defaultDeps): Promise<void> => {
  const root = resolve(runtimeRoot)
  const resolved = resolve(target)
  const child = relative(root, resolved)
  if (!child || child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) {
    throw new Error('Selected runtime path must be a child of the plugin runtime root')
  }
  if (await deps.exists(resolved)) await deps.remove(resolved)
}

export const runtimePathsForHost = (baseDir: string): RuntimePaths => {
  const root = join(baseDir, 'llama-cpp')
  return { cacheDir: join(root, 'cache'), runtimeRoot: join(root, 'runtimes'), stagingRoot: join(root, 'staging') }
}
