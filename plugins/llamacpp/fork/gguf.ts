import { open } from 'node:fs/promises'
import type { GGUFDescription } from '../shared/modelFile'
const widths = [1, 1, 2, 2, 4, 4, 4, 1, 0, 0, 8, 8, 8]
export const inspectGGUF = async (
  path: string,
  limits = { bytes: 16 * 1024 * 1024, timeMs: 2000 }
): Promise<GGUFDescription> => {
  const file = await open(path, 'r')
  const start = Date.now()
  let offset = 0,
    read = 0
  try {
    const size = (await file.stat()).size
    const check = () => {
      if (Date.now() - start > limits.timeMs) throw Error('GGUF metadata inspection time limit')
    }
    const skip = (n: number) => {
      check()
      if (!Number.isSafeInteger(n) || n < 0 || offset + n > size)
        throw Error('Invalid GGUF metadata length')
      offset += n
    }
    let cache = Buffer.alloc(0),
      cacheStart = 0
    const bytes = async (n: number) => {
      check()
      if (n < 0 || n > 65536 || offset + n > size) throw Error('Truncated GGUF metadata')
      if (offset < cacheStart || offset + n > cacheStart + cache.length) {
        cacheStart = offset
        const length = Math.min(size - offset, 65536)
        read += length
        if (read > limits.bytes) throw Error('GGUF inspection budget exceeded')
        cache = Buffer.alloc(length)
        const result = await file.read(cache, 0, length, offset)
        cache = cache.subarray(0, result.bytesRead)
      }
      if (offset + n > cacheStart + cache.length) throw Error('Truncated GGUF metadata')
      const b = cache.subarray(offset - cacheStart, offset - cacheStart + n)
      offset += n
      return b
    }
    const u32 = async () => (await bytes(4)).readUInt32LE()
    const u64 = async () => {
      const n = (await bytes(8)).readBigUInt64LE()
      if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('Invalid GGUF integer')
      return Number(n)
    }
    const string = async () => {
      const n = await u64()
      if (n > 65536) throw Error('GGUF string too long')
      return (await bytes(n)).toString('utf8')
    }
    const skipValue = async (type: number) => {
      if (type === 8) {
        skip(await u64())
        return
      }
      if (type === 9) {
        const t = await u32(),
          n = await u64()
        if (n > 10000000 || (!widths[t] && t !== 8)) throw Error('Invalid GGUF array')
        if (t === 8) {
          for (let i = 0; i < n; i++) skip(await u64())
        } else skip(n * widths[t])
        return
      }
      if (!widths[type]) throw Error('Invalid GGUF value')
      skip(widths[type])
    }
    if ((await bytes(4)).toString() !== 'GGUF') throw Error('Not a GGUF file')
    const version = await u32()
    if (version < 2 || version > 3) throw Error('Unsupported GGUF version')
    const tensors = await u64(),
      count = await u64()
    if (tensors > 1000000 || count > 1000000) throw Error('Invalid GGUF counts')
    const metadata: Record<string, string | number | boolean> = {}
    for (let i = 0; i < count; i++) {
      const key = await string(),
        type = await u32()
      if (
        type === 8 &&
        ['general.architecture', 'general.type', 'general.name', 'tokenizer.ggml.model'].includes(
          key
        )
      )
        metadata[key] = await string()
      else if (type === 7 && (key.startsWith('clip.') || key.includes('mtp')))
        metadata[key] = !!(await bytes(1))[0]
      else await skipValue(type)
    }
    let embedding = false,
      block = false,
      vision = false,
      draft = false
    for (let i = 0; i < tensors; i++) {
      const name = await string()
      embedding ||= name === 'token_embd.weight'
      block ||= name.startsWith('blk.0.')
      vision ||= /^(v\.|a\.|mm\.|audio\.|vision\.)/.test(name)
      draft ||= /mtp|draft|dflash/.test(name)
      const dims = await u32()
      if (dims > 4) throw Error('Invalid tensor dimensions')
      skip(dims * 8 + 12)
    }
    const architecture = String(metadata['general.architecture'] ?? '')
    const role =
      architecture === 'clip' || vision
        ? 'projector'
        : architecture === 'dflash' || metadata['general.type'] === 'adapter'
          ? 'draft-or-mtp'
          : embedding && block
            ? 'main'
            : draft
              ? 'draft-or-mtp'
              : 'unknown'
    return { role, architecture, metadata, valid: true }
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e)
    return { role: 'unknown', valid: /limit|budget/.test(reason), reason }
  } finally {
    await file.close()
  }
}
export const isStandaloneGGUFFile = async (path: string): Promise<boolean> =>
  (await inspectGGUF(path)).role === 'main'
