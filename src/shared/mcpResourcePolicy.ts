export type MCPResourceDef = {
  uri: 'flyenv://services' | 'flyenv://sites'
  name: string
  mimeType: 'application/json'
  requiredTool: 'list_services' | 'list_sites'
}

const RESOURCE_DEFS: MCPResourceDef[] = [
  {
    uri: 'flyenv://services',
    name: 'FlyEnv services',
    mimeType: 'application/json',
    requiredTool: 'list_services'
  },
  {
    uri: 'flyenv://sites',
    name: 'FlyEnv local sites',
    mimeType: 'application/json',
    requiredTool: 'list_sites'
  }
]

export function getResourceDef(uri: string): MCPResourceDef | undefined {
  return RESOURCE_DEFS.find((item) => item.uri === uri)
}

export function getEnabledResourceDefs(enabledTools: string[]): MCPResourceDef[] {
  const enabled = new Set(enabledTools)
  return RESOURCE_DEFS.filter((item) => enabled.has(item.requiredTool))
}

export function listEnabledResources(enabledTools: string[]): string[] {
  return getEnabledResourceDefs(enabledTools).map((item) => item.uri)
}

export function canReadResource(enabledTools: string[], uri: string): boolean {
  const def = getResourceDef(uri)
  if (!def) {
    return false
  }
  return enabledTools.includes(def.requiredTool)
}
