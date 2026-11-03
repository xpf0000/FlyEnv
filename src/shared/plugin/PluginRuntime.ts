export type PluginRuntimeDeclaration = {
  mode: 'dedicated'
  dataAccess: 'exclusive'
}

/** Identity of one installation and its current process, never a storage key. */
export type PluginRuntimeDescriptor = {
  pluginId: string
  moduleId: string
  dataRoot: string
  installGeneration: string
  workerGeneration: string
}

export type ForkPluginSnapshot = Record<
  string,
  {
    id: string
    version: string
    module: string
    entry: string
    runtime?: PluginRuntimeDeclaration
    dataRoot?: string
    installGeneration?: string
    audit?: 'metadata-volatile'
  }
>
