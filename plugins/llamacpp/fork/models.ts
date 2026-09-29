import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm, access, writeFile, stat } from 'node:fs/promises'
import { basename, join, relative, resolve, sep, isAbsolute } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import axios from 'axios'
import { getAxiosProxy } from '@fork/util/Axios'
import type { HubModel, HubModelFile, LocalModel } from '../shared/types'

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
  download(url: string, target: string, signal: AbortSignal, progress: (downloaded: number, total?: number) => void): Promise<void>
  digest(path: string): Promise<string>
  exists(path: string): Promise<boolean>
  size(path: string): Promise<number>
  rename(from: string, to: string): Promise<void>
  remove(path: string): Promise<void>
  write(path: string, content: string): Promise<void>
}

const sha256 = (value?: string): string | undefined => {
  if (!value) return undefined
  const digest = value.replace(/^sha256:/i, '').toLowerCase()
  return /^[a-f\d]{64}$/.test(digest) ? digest : undefined
}

const productionDeps: ModelDownloadDeps = {
  requestJson: async (url) => {
    try {
      const response = await axios.get(url, { headers: { Accept: 'application/json' }, timeout: 30_000, proxy: getAxiosProxy() })
      return response.data
    } catch (error: any) {
      if (error?.response?.status === 429) throw new Error('Hugging Face Hub rate limit reached (HTTP 429); retry later')
      throw new Error(`Hugging Face Hub request failed${error?.response?.status ? ` (${error.response.status})` : ''}: ${error?.message ?? error}`)
    }
  },
  mkdir: async (path) => mkdir(path, { recursive: true }).then(() => undefined),
  download: async (url, target, signal, progress) => {
    const response = await axios.get(url, { responseType: 'stream', signal, timeout: 0, proxy: getAxiosProxy(), maxRedirects: 5 })
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
  digest: async (path) => {
    const hash = createHash('sha256')
    await pipeline((await import('node:fs')).createReadStream(path), hash)
    return hash.digest('hex')
  },
  exists: (path) => access(path).then(() => true, () => false),
  size: async (path) => (await stat(path)).size,
  rename,
  remove: (path) => rm(path, { force: true, recursive: true }),
  write: async (path, content) => { await writeFile(path, content, { flag: 'wx' }) }
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
  const url = `https://huggingface.co/api/models/${encodeRepoPath(repoId)}/tree/${encodeURIComponent(revision)}?recursive=true&expand=true`
  const payload = await deps.requestJson(url)
  if (!Array.isArray(payload)) throw new Error('Unexpected Hugging Face file listing response')
  return (payload as HubTreeItem[])
    .filter((item) => item.type === 'file' && item.path.toLowerCase().endsWith('.gguf') && !/-\d{5}-of-\d{5}\.gguf$/i.test(item.path) && !/mmproj/i.test(item.path))
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
  if (!validRepoId(file.repoId) || !/^[\w.-]+$/.test(file.revision) || !file.path.toLowerCase().endsWith('.gguf') || /-\d{5}-of-\d{5}\.gguf$/i.test(file.path) || /mmproj/i.test(file.path) || file.path.split('/').some((part) => !part || part === '.' || part === '..' || part.includes('\\') || part.includes('\0'))) {
    throw new Error('Only public single-file GGUF downloads are supported')
  }
  const safeOperationId = operationId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'download'
  const fileName = basename(file.path)
  if (!fileName || fileName === '.' || fileName === '..') throw new Error('Invalid model filename')
  const finalPath = join(modelsRoot, fileName)
  const partialPath = join(modelsRoot, `.${fileName}.${safeOperationId}.part`)
  await deps.mkdir(modelsRoot)
  if (await deps.exists(finalPath)) throw new Error(`Model already exists: ${fileName}`)
  let finalized = false
  try {
    const resolverUrl = `https://huggingface.co/${encodeRepoPath(file.repoId)}/resolve/${encodeURIComponent(file.revision)}/${encodeRepoPath(file.path)}?download=true`
    await deps.download(resolverUrl, partialPath, signal, (downloaded, total) => onProgress({ downloaded, total: total ?? file.size }))
    const actualSize = await deps.size(partialPath)
    if (file.size > 0 && actualSize !== file.size) throw new Error(`Model size verification failed: expected ${file.size}, received ${actualSize}`)
    if (file.sha256 && (await deps.digest(partialPath)).toLowerCase() !== file.sha256.toLowerCase()) throw new Error('Model SHA-256 verification failed')
    const local: LocalModel = { ...file, localPath: finalPath, downloadedAt: Date.now() }
    const metadataPartial = `${partialPath}.flyenv.json`
    await deps.write(metadataPartial, JSON.stringify(local, null, 2))
    await deps.rename(partialPath, finalPath)
    finalized = true
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
