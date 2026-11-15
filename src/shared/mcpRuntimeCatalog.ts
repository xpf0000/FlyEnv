import { MCP_ALL_TOOLS, MCP_RISKY_TOOLS } from './mcpToolCatalog'
import type { PluginMCPDeclaration, PluginMCPTool } from './plugin/PluginMCP'

export type MCPRuntimeTool = {
  name: string
  description: string
  descriptionI18n?: PluginMCPTool['descriptionI18n']
  risky: boolean
  readOnly: boolean
  pluginId?: string
  pluginName?: string
  inputSchema?: Record<string, unknown>
}
export type PluginMCPRegistration = {
  pluginId: string
  pluginName?: string
  moduleId: string
  installGeneration: string
  declaration: PluginMCPDeclaration
}
export const MCP_BUILTIN_RUNTIME_TOOLS: MCPRuntimeTool[] = MCP_ALL_TOOLS.map((name) => ({
  name,
  description: '',
  risky: (MCP_RISKY_TOOLS as readonly string[]).includes(name),
  readOnly: !(MCP_RISKY_TOOLS as readonly string[]).includes(name)
}))
