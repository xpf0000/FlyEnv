import { readFile } from 'node:fs/promises'
import JSON5 from 'json5'
/** Mutation callers must never replace an unreadable/invalid config with an empty object. */
export function validateMcpConfig(data: any, field: string): Record<string, any> {
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new Error('Invalid MCP configuration')
  const servers = data[field]
  if (servers !== undefined && (!servers || typeof servers !== 'object' || Array.isArray(servers)))
    throw new Error('Invalid MCP server map')
  return data
}
export async function readMcpClientConfig(
  file: string,
  field: string,
  jsonc = false
): Promise<Record<string, any>> {
  let bytes: Buffer
  try {
    bytes = await readFile(file)
  } catch (error: any) {
    if (error?.code === 'ENOENT') return {}
    throw error
  }
  const raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  return validateMcpConfig(jsonc ? JSON5.parse(raw) : JSON.parse(raw), field)
}
