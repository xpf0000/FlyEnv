import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { access, mkdir, readdir, rename, rm, chmod, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { spawn } from 'node:child_process'
import { unpack } from '@fork/util/Zip'
import type { SoftInstalled } from '@shared/app'
import type { RuntimeAsset, RuntimeVariant } from '../shared/types'

export interface RuntimePaths {
  cacheDir: string
  runtimeRoot: string
  stagingRoot: string
}

export interface RuntimeInstallDeps {
  mkdir(path: string): Promise<void>
  download(url: string, target: string): Promise<void>
  digest(path: string): Promise<string>
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
  download: async (url, target) => {
    if (!url.startsWith('https://')) throw new Error('Runtime downloads require HTTPS')
    const response = await fetch(url)
    if (!response.ok || !response.body) throw new Error(`Runtime download failed (${response.status})`)
    await mkdir(dirname(target), { recursive: true })
    await pipeline(response.body as any, createWriteStream(target, { flags: 'wx' }))
  },
  digest: async (path) => {
    const hash = createHash('sha256')
    await pipeline((await import('node:fs')).createReadStream(path), hash)
    return hash.digest('hex')
  },
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

const verifyDigest = async (asset: RuntimeAsset, archive: string, deps: RuntimeInstallDeps) => {
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
  deps: RuntimeInstallDeps = defaultDeps
): Promise<SoftInstalled> => {
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
    await deps.download(variant.assetUrl, mainArchive)
    await verifyDigest(variant, mainArchive, deps)
    await deps.mkdir(runtimeStage)
    await deps.extract(mainArchive, runtimeStage)
    if (variant.companion) {
      const companionArchive = join(stageDir, variant.companion.assetName.split(/[\\/]/).pop()!)
      await deps.download(variant.companion.assetUrl, companionArchive)
      await verifyDigest(variant.companion, companionArchive, deps)
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
