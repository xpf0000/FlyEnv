import { stat, realpath, access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { isAbsolute, relative, sep } from 'node:path'
import type { LocalModel } from '../shared/types'
import type { ModelFileRef, ResolvedDependency } from '../shared/settings'
import { modelFileKey, isGGUFShardPath } from '../shared/modelFile'
import { inspectGGUF } from './gguf'
export const resolveModelReference = async (
  ref: ModelFileRef,
  role: ResolvedDependency['role'],
  context: { files: LocalModel[]; modelsRoot: string }
): Promise<ResolvedDependency> => {
  const record =
    ref.kind === 'managed' ? context.files.find((m) => modelFileKey(m) === ref.fileKey) : undefined
  const original = ref.kind === 'external' ? ref.path : record?.localPath
  if (!original || !isAbsolute(original)) throw Error('Select an absolute file path')
  const path = await realpath(original)
  const info = await stat(path)
  await access(path, constants.R_OK)
  if (!info.isFile()) throw Error('Reference must be a readable file')
  let digest: string | undefined
  if (ref.kind === 'managed') {
    const root = await realpath(context.modelsRoot)
    const rel = relative(root, path)
    if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel))
      throw Error('Managed reference is outside models directory')
    const sidecar = JSON.parse(await readFile(path + '.flyenv.json', 'utf8'))
    if (modelFileKey(sidecar) !== ref.fileKey || sidecar.size !== info.size)
      throw Error('Managed file identity changed')
    digest = sidecar.sha256
  }
  const current = { size: info.size, mtimeMs: info.mtimeMs, sha256: digest }
  if (
    ref.fingerprint &&
    (ref.fingerprint.size !== info.size ||
      (ref.fingerprint.sha256 && (!digest || ref.fingerprint.sha256 !== digest)) ||
      (ref.fingerprint.mtimeMs !== undefined && ref.fingerprint.mtimeMs !== info.mtimeMs))
  )
    throw Error('File changed; select it again to confirm')
  let description: import('../shared/modelFile').GGUFDescription | undefined
  if (role !== 'template') {
    if (isGGUFShardPath(path)) throw Error('Split GGUF cannot be used alone')
    const desc = await inspectGGUF(path)
    description = desc
    if (!desc.valid) throw Error(desc.reason ?? 'Invalid GGUF')
    if (role === 'main' && desc.role !== 'main') throw Error('Select a standalone main GGUF')
    if (
      role === 'projector' &&
      desc.role !== 'projector' &&
      !(desc.role === 'unknown' && ref.kind === 'external' && ref.allowUnverified)
    )
      throw Error('Select a multimodal projector GGUF')
    if (role === 'draft' && desc.role === 'projector')
      throw Error('A projector is not a draft model')
  }
  return { path, role, fingerprint: current, description }
}
