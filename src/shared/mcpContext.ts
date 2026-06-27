export type MCPContextSourceHint = 'runtime' | 'config' | 'default' | 'derived'

export interface ManagedPathItem {
  name: string
  path: string
  exists: boolean
}

export interface ManagedFileGroups {
  env: ManagedPathItem[]
  config: ManagedPathItem[]
  log: ManagedPathItem[]
  cert: ManagedPathItem[]
  runtime: ManagedPathItem[]
  data: ManagedPathItem[]
}

export interface DatabaseConnectionInfo {
  flag: string
  version: string | null
  running: boolean
  host: string
  port: number
  socket?: string
  user: string | null
  password: string | null
  bin?: string
  path?: string
  configFiles: ManagedPathItem[]
  logFiles: ManagedPathItem[]
  notes: string[]
  warnings: string[]
  sourceHints: Record<string, MCPContextSourceHint>
}

export interface ServiceExecInfo {
  flag: string
  version: string | null
  running: boolean
  bin?: string
  path?: string
  phpBin?: string
  phpConfig?: string
  rootPassword: string | null
  configFiles: ManagedPathItem[]
  logFiles: ManagedPathItem[]
  execHints: string[]
  warnings: string[]
}

export interface ResolveSiteUrlsResponse {
  primaryUrl: string
  urls: string[]
  ssl: {
    enabled: boolean
    autoSSL: boolean
    cert?: string
    keyMasked?: string
  }
  aliases: string[]
  ports: Record<string, number | undefined>
  reverseProxy: Array<{ path: string; url: string }>
  warnings: string[]
}

export interface ResolveSiteRuntimeResponse {
  site: {
    name: string
    root: string
    url: string
    alias: string
    envFile: string
    projectName?: string
    projectPort?: number
    startCommand?: string
    useSSL: boolean
  }
  php: {
    configuredVersion: number | null
    resolvedVersion: string | null
    bin?: string
    phpBin?: string
    phpConfig?: string
    running: boolean
  }
  webServer: {
    preferred: string | null
    running: boolean
    version: string | null
    port?: number
    sslPort?: number
  }
  projectRuntime?: {
    projectName?: string
    projectPort?: number
    startCommand?: string
  }
  managedFiles: Pick<ManagedFileGroups, 'env' | 'config' | 'log' | 'cert'>
  warnings: string[]
}

export type ManagedFileMapScope = 'site' | 'service'

export interface GetManagedFileMapInput {
  scope: ManagedFileMapScope
  name?: string
  flag?: string
  version?: string
}

export interface GetManagedFileMapResponse {
  scope: ManagedFileMapScope
  identity: Record<string, any>
  files: ManagedFileGroups
  warnings: string[]
}
