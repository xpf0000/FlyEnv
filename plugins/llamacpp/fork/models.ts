import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm, access, realpath, writeFile, stat } from 'node:fs/promises'
import { basename, join, relative, resolve, sep, isAbsolute } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { setTimeout as delay } from 'node:timers/promises'
import axios from 'axios'
import { getAxiosProxy } from '@fork/util/Axios'
import type { HubModel, HubModelFile, LocalModel } from '../shared/types'
import { isStandaloneGGUFFile } from './gguf'
import { isGGUFShardPath } from '../shared/modelFile'

interface HubModelApiItem {
  id: string
  downloads?: number
  likes?: number
  lastModified?: string
  cardData?: { license?: string }
  pipeline_tag?: string
}

interface HubTreeItem {
  type: string
  path: string
  size?: number
  lfs?: { oid?: string; size?: number }
  blobId?: string
}

export interface ModelDownloadDeps {
  requestJson(url: string): Promise<unknown>
  mkdir(path: string): Promise<void>
  realPath(path: string): Promise<string>
  download(url: string, target: string, signal: AbortSignal, progress: (downloaded: number, total?: number) => void): Promise<void>
  digest(path: string, signal?: AbortSignal): Promise<string>
  exists(path: string): Promise<boolean>
  size(path: string): Promise<number>
  rename(from: string, to: string): Promise<void>
  remove(path: string): Promise<void>
  write(path: string, content: string): Promise<void>
  inspect(path: string): Promise<boolean>
}

const sha256 = (value?: string): string | undefined => {
  if (!value) return undefined
  const digest = value.replace(/^sha256:/i, '').toLowerCase()
  return /^[a-f\d]{64}$/.test(digest) ? digest : undefined
}

export const formatHubRequestError = (error: unknown, proxy: boolean | { host: string; port?: string }) => {
  const detail = error as { code?: string; message?: string; response?: { status?: number } }
  const status = detail?.response?.status ? ` (${detail.response.status})` : ''
  const proxyConfigured = !!proxy
  const address = typeof proxy === 'object' ? `${proxy.host}${proxy.port ? `:${proxy.port}` : ''}` : ''
  let guidance = ''
  if (proxyConfigured && detail?.code === 'ECONNREFUSED') {
    guidance = `Proxy ${address || 'server'} is not accepting connections. Start it or update FlyEnv proxy settings. `
  } else if (proxyConfigured && /before secure TLS connection was established/i.test(detail?.message ?? '')) {
    guidance = 'TLS setup failed through the configured proxy; check whether the proxy can reach huggingface.co. '
  }
  return new Error(`Hugging Face Hub request failed${status} (FlyEnv proxy: ${proxyConfigured ? 'on' : 'off'}): ${guidance}${detail?.message ?? error}`)
}

const retryHubConnection = async <T>(request: () => Promise<T>, signal?: AbortSignal): Promise<T> => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await request()
    } catch (error: any) {
      const retryable = !error?.response && (
        ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'EPIPE'].includes(error?.code) ||
        /before secure TLS connection was established/i.test(error?.message ?? '')
      )
      if (!retryable || attempt >= 2 || signal?.aborted) throw error
      await delay(200 * (attempt + 1), undefined, { signal })
    }
  }
}

const nextHubPage = (link?: string): string | undefined =>
  link?.match(/<([^>]+)>;\s*rel="?next"?/i)?.[1]

const productionDeps: ModelDownloadDeps = {
  requestJson: async (url) => {
    const proxy = getAxiosProxy()
    try {
      const response = await retryHubConnection(() => axios.get(url, { headers: { Accept: 'application/json' }, timeout: 30_000, proxy }))
      return url.includes('/tree/')
        ? { items: response.data, next: nextHubPage(response.headers.link) }
        : response.data
    } catch (error: any) {
      if (error?.response?.status === 429) throw new Error('Hugging Face Hub rate limit reached (HTTP 429); retry later')
      throw formatHubRequestError(error, proxy)
    }
  },
  mkdir: async (path) => mkdir(path, { recursive: true }).then(() => undefined),
  realPath: realpath,
  download: async (url, target, signal, progress) => {
    const proxy = getAxiosProxy()
    const response = await retryHubConnection(() => axios.get(url, { responseType: 'stream', signal, timeout: 0, proxy, maxRedirects: 5 }), signal).catch((error) => {
      if (signal.aborted || axios.isCancel(error) || error?.code === 'ERR_CANCELED') throw error
      throw formatHubRequestError(error, proxy)
    })
    const total = Number(response.headers['content-length']) || undefined
    let downloaded = 0
    const meter = new Transform({
      transform(chunk, _encoding, callback) {
        downloaded += chunk.length
        progress(downloaded, total)
        callback(null, chunk)
      }
    })
    await pipeline(response.data, meter, createWriteStream(target, { flags: 'wx' }), { signal })
  },
  digest: async (path, signal) => {
    const hash = createHash('sha256')
    await pipeline((await import('node:fs')).createReadStream(path), hash, { signal })
    return hash.digest('hex')
  },
  exists: (path) => access(path).then(() => true, () => false),
  size: async (path) => (await stat(path)).size,
  rename,
  remove: (path) => rm(path, { force: true, recursive: true }),
  write: async (path, content) => { await writeFile(path, content, { flag: 'wx' }) },
  inspect: isStandaloneGGUFFile
}

const encodeRepoPath = (path: string) => path.split('/').map(encodeURIComponent).join('/')
const validRepoId = (repoId: string) => /^[\w.-]+\/[\w.-]+$/.test(repoId)

export const searchHubModels = async (query: string, page = 0, deps: ModelDownloadDeps = productionDeps): Promise<HubModel[]> => {
  const search = query.trim()
  if (!Number.isInteger(page) || page < 0) throw new Error('Page must be a non-negative integer')
  const searchParam = search ? `search=${encodeURIComponent(search)}&` : ''
  const url = `https://huggingface.co/api/models?${searchParam}filter=gguf&limit=20&sort=downloads&direction=-1&skip=${page * 20}`
  const payload = await deps.requestJson(url)
  if (!Array.isArray(payload)) throw new Error('Unexpected Hugging Face model search response')
  return (payload as HubModelApiItem[]).map((item) => ({
    id: item.id,
    downloads: Number(item.downloads ?? 0),
    likes: Number(item.likes ?? 0),
    lastModified: item.lastModified,
    license: item.cardData?.license,
    pipelineTag: item.pipeline_tag
  })).filter((model) => model.id)
}

export const getHubModelFiles = async (repoId: string, revision = 'main', deps: ModelDownloadDeps = productionDeps): Promise<HubModelFile[]> => {
  if (!validRepoId(repoId) || !/^[\w.-]+$/.test(revision)) throw new Error('Invalid Hub repository or revision')
  const firstUrl = `https://huggingface.co/api/models/${encodeRepoPath(repoId)}/tree/${encodeURIComponent(revision)}?recursive=true`
  const expectedPath = new URL(firstUrl).pathname
  const seen = new Set<string>()
  const items: HubTreeItem[] = []
  let url: string | undefined = firstUrl
  while (url) {
    if (seen.has(url)) throw new Error('Hugging Face file listing pagination loop')
    seen.add(url)
    const payload = await deps.requestJson(url)
    const page: { items?: unknown; next?: string } = Array.isArray(payload) ? { items: payload } : payload as { items?: unknown; next?: string }
    if (!Array.isArray(page?.items)) throw new Error('Unexpected Hugging Face file listing response')
    items.push(...page.items as HubTreeItem[])
    if (!page.next) break
    const nextUrl: URL = new URL(page.next, url)
    if (nextUrl.origin !== 'https://huggingface.co' || nextUrl.pathname !== expectedPath) {
      throw new Error('Invalid Hugging Face file listing continuation')
    }
    url = nextUrl.toString()
  }
  return items
    .filter((item) => item.type === 'file' && item.path.toLowerCase().endsWith('.gguf'))
    .map((item) => ({
      repoId,
      revision,
      path: item.path,
      size: Number(item.lfs?.size ?? item.size ?? 0),
      sha256: sha256(item.lfs?.oid),
      downloadUrl: `https://huggingface.co/${encodeRepoPath(repoId)}/resolve/${encodeURIComponent(revision)}/${encodeRepoPath(item.path)}?download=true`
    }))
}

export const downloadHubModelFile = async (
  operationId: string,
  file: HubModelFile,
  modelsRoot: string,
  signal: AbortSignal,
  onProgress: (event: { downloaded: number; total?: number }) => void,
  deps: ModelDownloadDeps = productionDeps
): Promise<LocalModel> => {
  if (!validRepoId(file.repoId) || !/^[\w.-]+$/.test(file.revision) || !file.path.toLowerCase().endsWith('.gguf') || file.path.split('/').some((part) => !part || part === '.' || part === '..' || part.includes('\\') || part.includes('\0'))) {
    throw new Error('Only public GGUF model downloads are supported')
  }
  const safeOperationId = operationId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'download'
  const fileName = basename(file.path)
  if (!fileName || fileName === '.' || fileName === '..') throw new Error('Invalid model filename')
  const group = createHash('sha256').update(JSON.stringify([file.repoId, file.revision, file.path.split('/').slice(0, -1).join('/')])).digest('hex')
  const targetDir = join(modelsRoot, 'hub-files', group)
  const finalPath = join(targetDir, fileName)
  const partialPath = join(targetDir, `.${fileName}.${safeOperationId}.part`)
  await deps.mkdir(targetDir)
  const relativeDir = relative(await deps.realPath(modelsRoot), await deps.realPath(targetDir))
  if (!relativeDir || relativeDir === '..' || relativeDir.startsWith(`..${sep}`) || isAbsolute(relativeDir)) {
    throw new Error('Download target must stay inside the managed models directory')
  }
  if (await deps.exists(finalPath)) throw new Error(`Model already exists: ${fileName}`)
  let finalized = false
  try {
    const resolverUrl = `https://huggingface.co/${encodeRepoPath(file.repoId)}/resolve/${encodeURIComponent(file.revision)}/${encodeRepoPath(file.path)}?download=true`
    await deps.download(resolverUrl, partialPath, signal, (downloaded, total) => onProgress({ downloaded, total: total ?? file.size }))
    signal.throwIfAborted()
    const actualSize = await deps.size(partialPath)
    if (file.size > 0 && actualSize !== file.size) throw new Error(`Model size verification failed: expected ${file.size}, received ${actualSize}`)
    if (file.sha256 && (await deps.digest(partialPath, signal)).toLowerCase() !== file.sha256.toLowerCase()) throw new Error('Model SHA-256 verification failed')
    signal.throwIfAborted()
    const metadataPartial = `${partialPath}.flyenv.json`
    await deps.rename(partialPath, finalPath)
    finalized = true
    const local: LocalModel = { ...file, localPath: finalPath, downloadedAt: Date.now(), standalone: !isGGUFShardPath(file.path) && await deps.inspect(finalPath) }
    signal.throwIfAborted()
    await deps.write(metadataPartial, JSON.stringify(local, null, 2))
    signal.throwIfAborted()
    await deps.rename(metadataPartial, `${finalPath}.flyenv.json`)
    return local
  } catch (error) {
    await deps.remove(partialPath).catch(() => {})
    await deps.remove(`${partialPath}.flyenv.json`).catch(() => {})
    if (finalized) {
      await deps.remove(finalPath).catch(() => {})
      await deps.remove(`${finalPath}.flyenv.json`).catch(() => {})
    }
    throw error
  }
}

export const deleteLocalModel = async (target: string, modelRoot: string, activeModelPath: string | undefined, deps: ModelDownloadDeps = productionDeps): Promise<void> => {
  const root = resolve(modelRoot)
  const resolved = resolve(target)
  const relativePath = relative(root, resolved)
  if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error('Selected model path must be a child of the plugin model root')
  }
  if (activeModelPath && resolve(activeModelPath) === resolved) throw new Error('Stop the active server before deleting its model')
  if (await deps.exists(resolved)) await deps.remove(resolved)
  await deps.remove(`${resolved}.flyenv.json`).catch(() => {})
}

export const createModelDownloadDeps = (): ModelDownloadDeps => productionDeps
