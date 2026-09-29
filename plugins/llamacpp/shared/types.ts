export type RuntimeBackend = 'cpu' | 'cuda' | 'vulkan' | 'metal'

export interface RuntimeIdentity {
  release: string
  platform: 'windows' | 'macos' | 'linux'
  arch: 'x64' | 'arm64'
  backend: RuntimeBackend
  cudaVersion?: string
}
