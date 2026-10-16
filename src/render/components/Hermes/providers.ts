export type ProviderProtocol = 'openai' | 'anthropic'
export type ProviderRegion = 'global_en' | 'cn_zh'

export interface ProviderEndpoint {
  region: ProviderRegion
  protocol: ProviderProtocol
  baseUrl: string
}

export interface ProviderModel {
  id: string
  contextWindow: number
  pricingUsdPerMillionTokens: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number | null
  }
  inputModalities: ('text' | 'image' | 'video')[]
  thinking: ('adaptive' | 'disabled' | 'always_on')[]
}

export interface ProviderItem {
  name: string
  baseUrl: string
  models?: string[]
  modelDetails?: ProviderModel[]
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
    modelDetails: [
      {
        id: 'MiniMax-M3',
        contextWindow: 1000000,
        pricingUsdPerMillionTokens: { input: 0.6, output: 2.4, cacheRead: 0.12, cacheWrite: null },
        inputModalities: ['text', 'image', 'video'],
        thinking: ['adaptive', 'disabled']
      },
      {
        id: 'MiniMax-M2.7',
        contextWindow: 204800,
        pricingUsdPerMillionTokens: { input: 0.3, output: 1.2, cacheRead: 0.06, cacheWrite: 0.375 },
        inputModalities: ['text'],
        thinking: ['always_on']
      }
    ],
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
