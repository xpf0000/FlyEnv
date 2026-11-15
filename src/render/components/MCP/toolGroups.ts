import { resolvePluginI18nText } from '@shared/plugin/PluginManifest'
import type { MCPRuntimeTool } from '@shared/mcpRuntimeCatalog'

export type MCPToolGroup = {
  id: string
  label: string
  tools: MCPRuntimeTool[]
}

export function groupMcpTools(tools: MCPRuntimeTool[]): MCPToolGroup[] {
  const builtin: MCPToolGroup = { id: 'builtin', label: 'FlyEnv', tools: [] }
  const plugins = new Map<string, MCPToolGroup>()
  for (const tool of tools) {
    if (!tool.pluginId) {
      builtin.tools.push(tool)
      continue
    }
    const id = `plugin:${tool.pluginId}`
    if (!plugins.has(id)) {
      plugins.set(id, {
        id,
        label: tool.pluginName || tool.pluginId,
        tools: []
      })
    }
    plugins.get(id)!.tools.push(tool)
  }
  return [builtin, ...plugins.values()]
}

export function resolveMcpToolGroup(groups: MCPToolGroup[], current: string) {
  return groups.some((group) => group.id === current) ? current : 'builtin'
}

/** Display translations follow the UI locale; the protocol description remains unchanged. */
export function pluginMcpToolDescription(tool: MCPRuntimeTool, locale: string): string {
  return resolvePluginI18nText(tool.descriptionI18n, locale) || tool.description
}
