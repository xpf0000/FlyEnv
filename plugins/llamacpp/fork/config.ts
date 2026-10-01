import { randomUUID } from 'node:crypto'
import { chmod, mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { isIP } from 'node:net'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { spawn } from 'node:child_process'
import type { SoftInstalled } from '@shared/app'
import type { LaunchProfile, LocalModel, RuntimeVariant, ServerInvocation, ValidatedLaunchProfile } from '../shared/types'
import { isGGUFShardPath } from '../shared/modelFile'

const isLoopback = (host: string) => host === 'localhost' || host === '127.0.0.1' || host === '::1'
export const formatUrlHost = (host: string) => host.includes(':') && !host.startsWith('[') ? `[${host}]` : host

export const validateLaunchProfile = (profile: LaunchProfile, variant: RuntimeVariant): ValidatedLaunchProfile => {
  if (profile.backend !== variant.backend) throw new Error('Selected backend does not match the installed runtime')
  if (!profile.modelPath || !profile.modelPath.toLowerCase().endsWith('.gguf')) throw new Error('Select a local GGUF model file')
  if (isIP(profile.host) === 0 && profile.host !== 'localhost') throw new Error('Host must be localhost or an IP address')
  if (!Number.isInteger(profile.port) || profile.port < 1 || profile.port > 65535) throw new Error('Port must be between 1 and 65535')
  if (!Number.isInteger(profile.contextSize) || profile.contextSize < 128 || profile.contextSize > 1_048_576) throw new Error('Context size is outside the supported range')
  if (!Number.isInteger(profile.threads) || profile.threads < 1 || profile.threads > 512) throw new Error('Thread count is outside the supported range')
  if (!Number.isInteger(profile.gpuLayers) || profile.gpuLayers < 0 || profile.gpuLayers > 999) throw new Error('GPU layer count is outside the supported range')
  if (profile.backend === 'cpu' && (profile.gpuLayers > 0 || profile.gpuDevice)) throw new Error('CPU runtime cannot use GPU layers or devices')
  if (profile.gpuDevice !== undefined && !/^\d{1,3}$/.test(profile.gpuDevice)) throw new Error('GPU device must be a numeric device index')
  if (profile.gpuDevice && !['cuda', 'vulkan', 'metal'].includes(profile.backend)) throw new Error('GPU device is unsupported for this backend')
  if (!isLoopback(profile.host) && !profile.apiKeyFile?.trim()) throw new Error('An API key file is required for non-loopback binding')
  return { ...profile, host: profile.host.trim() }
}

export const buildServerInvocation = (profile: ValidatedLaunchProfile, runtime: SoftInstalled, model: LocalModel): ServerInvocation => {
  if (profile.modelPath !== model.localPath) throw new Error('Launch profile model path does not match the selected local model')
  const args = [
    '--model', model.localPath,
    '--host', profile.host,
    '--port', `${profile.port}`,
    '--ctx-size', `${profile.contextSize}`,
    '--threads', `${profile.threads}`,
    '--n-gpu-layers', `${profile.gpuLayers}`
  ]
  if (profile.gpuDevice !== undefined) args.push('--device', profile.gpuDevice)
  if (profile.apiKeyFile) args.push('--api-key-file', profile.apiKeyFile)
  return { bin: runtime.bin, args, env: {}, cwd: runtime.path }
}

export const assertInvocationSupported = (helpText: string, args: string[]): void => {
  const requiredFlags = Array.from(new Set(args.filter((arg) => arg.startsWith('--'))))
  const missing = requiredFlags.filter((flag) => {
    const escaped = flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return !new RegExp(`(?:^|[\\s,])${escaped}(?=$|[\\s,=])`, 'm').test(helpText)
  })
  if (missing.length) throw new Error(`This llama-server build does not support required options: ${missing.join(', ')}`)
}

export const validateManagedModelPath = async (modelPath: string, modelsRoot: string): Promise<string> => {
  if (!modelPath || !modelPath.toLowerCase().endsWith('.gguf')) throw new Error('Select a local GGUF model file')
  if (isGGUFShardPath(modelPath)) throw new Error('Select a standalone GGUF model; split files cannot start llama-server alone')
  const root = await realpath(resolve(modelsRoot))
  const model = await realpath(resolve(modelPath))
  const info = await stat(model)
  const rel = relative(root, model)
  if (!info.isFile() || !isAbsolute(model) || rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error('Model path must point to a GGUF file inside the managed models directory')
  }
  return model
}

export const readServerHelp = (bin: string, timeoutMs = 60_000): Promise<string> => new Promise((resolveHelp, reject) => {
  const child = spawn(bin, ['--help'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  let output = ''
  const timer = setTimeout(() => {
    child.kill()
    reject(new Error('Timed out while checking llama-server options'))
  }, timeoutMs)
  const append = (chunk: Buffer) => { output = `${output}${chunk.toString()}`.slice(0, 2_000_000) }
  child.stdout?.on('data', append)
  child.stderr?.on('data', append)
  child.once('error', (error) => { clearTimeout(timer); reject(error) })
  child.once('close', (code) => {
    clearTimeout(timer)
    if (code === 0 || output.includes('--model')) resolveHelp(output)
    else reject(new Error(`Could not read llama-server options (exit ${code})`))
  })
})

export const validateApiKeyFile = async (path: string, platform: NodeJS.Platform = process.platform): Promise<void> => {
  if (platform === 'win32') throw new Error('Private API key files are not supported on Windows yet')
  const { stat, readFile } = await import('node:fs/promises')
  const info = await stat(path)
  if ((info.mode & 0o077) !== 0) throw new Error('API key file permissions must be private (0600)')
  const key = (await readFile(path, 'utf8')).trim()
  if (!key) throw new Error('API key file is empty')
}

export const createApiKeyFile = async (key: string, secretRoot: string, platform: NodeJS.Platform = process.platform): Promise<string> => {
  if (platform === 'win32') throw new Error('Private API key files are not supported on Windows yet; non-loopback binding is disabled')
  if (!key || key.length < 16 || key.length > 512 || /[\x00-\x1f\x7f]/.test(key)) throw new Error('API key must contain 16–512 printable characters')
  const root = resolve(secretRoot)
  await mkdir(root, { recursive: true, mode: 0o700 })
  await chmod(root, 0o700)
  const path = join(root, `api-key-${randomUUID()}.key`)
  await writeFile(path, key, { flag: 'wx', mode: 0o600 })
  await chmod(path, 0o600)
  return path
}

export const waitForServerHealth = async (
  check: () => Promise<boolean>,
  cleanup: () => Promise<unknown>,
  options: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<void> => {
  const timeoutMs = options.timeoutMs ?? 60_000
  const intervalMs = options.intervalMs ?? 500
  const deadline = Date.now() + timeoutMs
  while (Date.now() <= deadline) {
    try { if (await check()) return } catch {}
    await delay(Math.min(intervalMs, Math.max(1, deadline - Date.now())))
  }
  try {
    await cleanup()
  } catch (error) {
    const detail = error instanceof Error ? error.message : `${error}`
    throw new Error(`llama-server health check timed out; cleanup failed: ${detail}`)
  }
  throw new Error('llama-server health check timed out; cleanup request completed')
}

export const assertServerStopped = (stoppedPids: string[], runningPids: string[], pidFileExists: boolean): void => {
  const remaining = stoppedPids.filter((pid) => runningPids.includes(`${pid}`))
  if (remaining.length || pidFileExists) {
    const suffix = remaining.length ? `; process(es) still running: ${remaining.join(', ')}` : '; PID file remains'
    throw new Error(`llama-server cleanup did not complete${suffix}`)
  }
}

export const waitForServerStopped = async (
  stoppedPids: string[],
  listRunningPids: () => Promise<string[]>,
  pidPath: string,
  options: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<void> => {
  const pidFileContent = pidPath ? await readFile(pidPath, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return ''
    throw error
  }) : ''
  const trackedPids = Array.from(new Set([...stoppedPids, pidFileContent.split(/\r?\n/)[0].trim()].filter(Boolean)))
  const deadline = Date.now() + (options.timeoutMs ?? 10_000)
  while (true) {
    const runningPids = await listRunningPids()
    if (!trackedPids.some((pid) => runningPids.includes(pid))) {
      if (pidPath) await rm(pidPath, { force: true })
      assertServerStopped(trackedPids, runningPids, false)
      return
    }
    if (Date.now() >= deadline) {
      assertServerStopped(trackedPids, runningPids, !!pidPath)
      throw new Error('llama-server did not stop in time')
    }
    await delay(Math.min(options.intervalMs ?? 200, Math.max(1, deadline - Date.now())))
  }
}

export const variantFromInstalled = (runtime: SoftInstalled): RuntimeVariant => {
  let details: Partial<RuntimeVariant> = {}
  try { details = JSON.parse(runtime.note ?? '{}') } catch {}
  const backend = (details.backend ?? runtime.flag ?? 'cpu') as RuntimeVariant['backend']
  return {
    release: runtime.version ?? 'unknown',
    platform: details.platform ?? (process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux'),
    arch: details.arch ?? (process.arch === 'arm64' ? 'arm64' : 'x64'),
    backend,
    cudaVersion: details.cudaVersion,
    assetName: '', assetUrl: '', size: 0
  }
}
