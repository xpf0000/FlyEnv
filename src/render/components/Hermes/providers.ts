export type ProviderProtocol = 'openai' | 'anthropic'
export type ProviderRegion = 'global_en' | 'cn_zh'

export interface ProviderEndpoint {
  region: ProviderRegion
  protocol: ProviderProtocol
  baseUrl: string
}

export interface ProviderItem {
  name: string
  baseUrl: string
  models?: string[]
  endpoints?: ProviderEndpoint[]
}

export const HermesProviders: ProviderItem[] = [
  { name: 'Ollama', baseUrl: 'http://localhost:11434/v1' },
  { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  { name: 'Anthropic', baseUrl: 'https://api.anthropic.com' },
  {
    name: 'MiniMax',
    baseUrl: 'https://api.minimax.io/v1',
    models: ['MiniMax-M3', 'MiniMax-M2.7'],
    endpoints: [
      {
        region: 'global_en',
        protocol: 'openai',
        baseUrl: 'https://api.minimax.io/v1'
      },
      {
        region: 'global_en',
        protocol: 'anthropic',
        baseUrl: 'https://api.minimax.io/anthropic'
      },
      {
        region: 'cn_zh',
        protocol: 'openai',
        baseUrl: 'https://api.minimaxi.com/v1'
      },
      {
        region: 'cn_zh',
        protocol: 'anthropic',
        baseUrl: 'https://api.minimaxi.com/anthropic'
      }
    ]
  }
]
