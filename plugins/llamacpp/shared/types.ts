export type RuntimeBackend = 'cpu' | 'cuda' | 'vulkan' | 'metal'

export interface RuntimeIdentity {
  release: string
  platform: 'windows' | 'macos' | 'linux'
  arch: 'x64' | 'arm64'
  backend: RuntimeBackend
  cudaVersion?: string
}

export interface RuntimeHost {
  platform: RuntimeIdentity['platform']
  arch: RuntimeIdentity['arch']
}

export interface RuntimeAsset {
  assetName: string
  assetUrl: string
  size: number
  sha256?: string
}

export interface RuntimeVariant extends RuntimeIdentity, RuntimeAsset {
  companion?: RuntimeAsset
}
