import { getMcpServerUrl } from '../../../src/shared/mcpClientConfig'
import type { ConnectSettings } from './connect-controller'
export const MEMORY_CONNECT_TOOLS = ['search', 'get', 'store', 'update', 'forget'].map(
  (name) => `flyenv_memory_${name}`
)
export type MCPRequest = <T = any>(
  command: string,
  args?: unknown[],
  timeoutMs?: number
) => Promise<T>
export async function prepareMemoryService(request: MCPRequest): Promise<ConnectSettings> {
  let config = await request('mcp:getConfig')
  if (!config?.transport || !Array.isArray(config.enabledTools))
    throw new Error('service_unavailable')
  if (!MEMORY_CONNECT_TOOLS.every((name) => config.enabledTools.includes(name))) {
    await request('mcp:setToolsEnabled', [MEMORY_CONNECT_TOOLS, true])
  }
  if (!config.transport.http) {
    await request('mcp:setConfig', [{ transport: { ...config.transport, http: true } }])
  }
  let status = await request('mcp:status')
  if (!status?.running) await request('mcp:start', [], 90_000)
  ;[config, status] = await Promise.all([request('mcp:getConfig'), request('mcp:status')])
  if (
    !status?.running ||
    !config?.transport?.http ||
    !MEMORY_CONNECT_TOOLS.every((name) => config.enabledTools?.includes(name))
  )
    throw new Error('service_unavailable')
  return { serverUrl: getMcpServerUrl(config), token: config.token }
}
