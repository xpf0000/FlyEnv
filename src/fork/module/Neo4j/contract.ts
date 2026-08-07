import { createHash } from 'node:crypto'
import { normalize, resolve, join } from 'node:path'

export const NEO4J_DEFAULT_HTTP_PORT = 7474
export const NEO4J_DEFAULT_HTTPS_PORT = 7473
export const NEO4J_DEFAULT_BOLT_PORT = 7687

/** Stable key for a local installation. The path, rather than only version, is the identity. */
export function neo4jInstanceKey(installationPath: string): string {
  const canonical = normalize(resolve(`${installationPath ?? ''}`)).replace(/[\\/]+$/, '')
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16)
}

export function neo4jInstallPaths(appDir: string, version: string, windows = false) {
  const root = join(appDir, 'neo4j', version)
  return {
    appDir: root,
    bin: join(root, 'bin', windows ? 'neo4j.bat' : 'neo4j'),
    adminBin: join(root, 'bin', windows ? 'neo4j-admin.bat' : 'neo4j-admin')
  }
}

function configLineValue(content: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`^\\s*(?!#)${escaped}\\s*=\\s*(.*?)\\s*$`, 'm')
  const match = content.match(pattern)
  return match?.[1]?.trim()
}

/** Parse an address setting such as `0.0.0.0:7474`; comments are ignored. */
export function parseNeo4jListenPort(content: string, key: string, fallback: number): number {
  const value = configLineValue(content, key)
  if (!value) return fallback
  const match = value.match(/:(\d+)\s*$/) ?? value.match(/^(\d+)$/)
  const port = Number(match?.[1] ?? 0)
  return port > 0 && port < 65536 ? port : fallback
}

export function parseNeo4jHttpPort(content: string): number {
  return parseNeo4jListenPort(content, 'server.http.listen_address', NEO4J_DEFAULT_HTTP_PORT)
}

export function parseNeo4jBoltPort(content: string): number {
  return parseNeo4jListenPort(content, 'server.bolt.listen_address', NEO4J_DEFAULT_BOLT_PORT)
}

/** Add instance directory settings while retaining all user-authored config lines. */
export function upsertNeo4jDirectorySettings(
  content: string,
  settings: Record<string, string>
): string {
  let result = content.replace(/\r\n/g, '\n')
  for (const [key, value] of Object.entries(settings)) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Neo4j parses this file as Java properties, where a Windows backslash is
    // an escape character. Forward slashes work on Windows and keep paths
    // stable when an existing instance config is migrated on startup.
    const configValue = value.replace(/\\/g, '/')
    const active = new RegExp(`^([ \\t]*(?!#)${escaped}[ \\t]*=)[ \\t]*([^\\r\\n]*?)[ \\t]*$`, 'm')
    const activeMatch = result.match(active)
    if (activeMatch) {
      const existingValue = activeMatch[2]
      const normalizedExistingValue = existingValue.replace(/\\/g, '/')
      if (normalizedExistingValue !== existingValue) {
        result = result.replace(active, `${activeMatch[1]}${normalizedExistingValue}`)
      }
      continue
    }
    if (result.length > 0 && !result.endsWith('\n')) result += '\n'
    result += `${key}=${configValue}\n`
  }
  return result
}
