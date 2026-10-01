import { open } from 'node:fs/promises'

const scalarWidths = [1, 1, 2, 2, 4, 4, 4, 1, 0, 0, 8, 8, 8]

/** Read only GGUF metadata and tensor names; model weights never enter memory. */
export const isStandaloneGGUFFile = async (path: string): Promise<boolean> => {
  const file = await open(path, 'r')
  try {
    const size = (await file.stat()).size
    let offset = 0
    let cache = Buffer.alloc(0)
    let cacheStart = 0
    const skip = (length: number) => {
      if (!Number.isSafeInteger(length) || length < 0 || offset + length > size) throw new Error('Invalid GGUF metadata length')
      offset += length
    }
    const bytes = async (length: number): Promise<Buffer> => {
      if (!Number.isSafeInteger(length) || length < 0 || length > 4096 || offset + length > size) throw new Error('Invalid GGUF metadata read')
      if (offset < cacheStart || offset + length > cacheStart + cache.length) {
        cacheStart = offset
        cache = Buffer.allocUnsafe(Math.min(size - offset, Math.max(65536, length)))
        let filled = 0
        while (filled < cache.length) {
          const { bytesRead } = await file.read(cache, filled, cache.length - filled, offset + filled)
          if (!bytesRead) break
          filled += bytesRead
        }
        cache = cache.subarray(0, filled)
      }
      if (offset + length > cacheStart + cache.length) throw new Error('Truncated GGUF metadata')
      const result = cache.subarray(offset - cacheStart, offset - cacheStart + length)
      offset += length
      return result
    }
    const u32 = async () => (await bytes(4)).readUInt32LE()
    const u64 = async () => {
      const value = (await bytes(8)).readBigUInt64LE()
      if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Invalid GGUF metadata integer')
      return Number(value)
    }
    const string = async (maxLength = 4096) => {
      const length = await u64()
      if (length > maxLength) throw new Error('GGUF metadata string is too long')
      return (await bytes(length)).toString('utf8')
    }
    const skipString = async () => skip(await u64())
    const skipValue = async (type: number) => {
      if (type === 8) return skipString()
      if (type === 9) {
        const elementType = await u32()
        const count = await u64()
        if (count > 10_000_000 || elementType === 9 || !scalarWidths[elementType] && elementType !== 8) throw new Error('Invalid GGUF metadata array')
        if (elementType === 8) {
          for (let index = 0; index < count; index++) await skipString()
        } else skip(count * scalarWidths[elementType])
        return
      }
      if (!scalarWidths[type]) throw new Error('Invalid GGUF metadata type')
      skip(scalarWidths[type])
    }
    if ((await bytes(4)).toString('ascii') !== 'GGUF') return false
    const version = await u32()
    if (version < 2 || version > 3) return false
    const tensorCount = await u64()
    const metadataCount = await u64()
    if (tensorCount > 1_000_000 || metadataCount > 1_000_000) return false
    let architecture = ''
    let modelType = 'model'
    for (let index = 0; index < metadataCount; index++) {
      const key = await string()
      const type = await u32()
      if ((key === 'general.architecture' || key === 'general.type') && type === 8) {
        const value = await string()
        if (key === 'general.architecture') architecture = value
        else modelType = value
      } else await skipValue(type)
    }
    if (!architecture || architecture === 'dflash' || modelType !== 'model') return false
    let hasEmbedding = false
    let hasFirstBlock = false
    for (let index = 0; index < tensorCount; index++) {
      const name = await string()
      if (name === 'token_embd.weight') hasEmbedding = true
      if (name.startsWith('blk.0.')) hasFirstBlock = true
      const dimensions = await u32()
      if (dimensions > 4) throw new Error('Invalid GGUF tensor dimensions')
      skip(dimensions * 8 + 4 + 8)
    }
    return hasEmbedding && hasFirstBlock
  } catch {
    return false
  } finally {
    await file.close()
  }
}
