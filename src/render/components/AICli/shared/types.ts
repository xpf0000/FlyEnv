import type { AllAppModule } from '@/core/type'

/**
 * #712 AI Code CLI — shared types.
 */

export type ShellKind = 'cmd' | 'powershell' | 'wsl' | 'bash' | 'zsh'

export type ProviderKind =
  | 'ollama'
  | 'cliproxyapi'
  | 'anthropic'
  | 'openai'
  | 'siliconflow'
  | 'openrouter'
  | 'custom'

export type ModelsEndpoint = 'ollama' | 'openai' | 'anthropic' | 'none'

/** A model source the CLI tool talks to. */
export interface AICliProvider {
  id: string
  label: string
  kind: ProviderKind
  baseURL: string
  apiKey?: string
  defaultModel?: string
  models?: string[]
  modelsEndpoint?: ModelsEndpoint
}

/** What an adapter produces from a provider: env to inject + optional config patch. */
export interface ProviderApply {
  env?: Record<string, string>
  configPatch?: Record<string, any>
  configFormat?: 'json'
}

/** Static descriptor of one AI CLI tool. */
export interface AICliTool {
  flag: AllAppModule
  name: string
  icon: any
  docUrl: string
  /** dependency probe, e.g. 'node -v' — empty if none. */
  depCmd?: string
  depLabel?: string
  install: {
    macOS?: string[]
    Windows?: string[]
    Linux?: string[]
    versionCmd: string
    updateCmd?: string
    /** command to launch an interactive session in the terminal. */
    launchCmd: string
  }
  /** config file location per platform (used for "open config" + applyProvider). */
  configFile?: { macOS?: string; Windows?: string; Linux?: string }
  /** map a resolved provider to env/config for this specific tool. */
  applyProvider: (p: AICliProvider, model?: string) => ProviderApply
}

/** Per tool+dir run configuration. */
export interface AICliRunProfile {
  toolFlag: string
  providerId: string
  model?: string
  workDir?: string
  env?: Record<string, string>
  shell?: ShellKind
}
