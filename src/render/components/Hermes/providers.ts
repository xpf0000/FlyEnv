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
  maxOutputTokens: number
  pricingUsdPerMillionTokens: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number | null
  }
  pricingTiers?: {
    inputTokenCondition: '<=512k' | '>512k'
    input: number
    output: number
    cacheRead: number
  }[]
  priorityPriceMultiplier?: number
  inputModalities: ('text' | 'image' | 'video')[]
  thinking: ('adaptive' | 'disabled')[]
  thinkingDefaults: Record<ProviderProtocol, 'adaptive' | 'disabled'>
  reasoningEffort: ('low' | 'medium' | 'high' | 'xhigh' | 'max')[]
  reasoningEffortDefault: 'max' | null
  serviceTierSupported: boolean
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
    models: ['MiniMax-M3.1-Flash', 'MiniMax-M3'],
    modelDetails: [
      {
        id: 'MiniMax-M3.1-Flash',
        contextWindow: 1000000,
        maxOutputTokens: 524288,
        pricingUsdPerMillionTokens: {
          input: 0.15,
          output: 0.6,
          cacheRead: 0.015,
          cacheWrite: null
        },
        inputModalities: ['text', 'image', 'video'],
        thinking: ['adaptive'],
        thinkingDefaults: { openai: 'adaptive', anthropic: 'adaptive' },
        reasoningEffort: ['low', 'medium', 'high', 'xhigh', 'max'],
        reasoningEffortDefault: 'max',
        serviceTierSupported: false
      },
      {
        id: 'MiniMax-M3',
        contextWindow: 1000000,
        maxOutputTokens: 524288,
        // The flat baseline is Standard <=512k; retain the published threshold verbatim.
        pricingUsdPerMillionTokens: { input: 0.3, output: 1.2, cacheRead: 0.06, cacheWrite: null },
        pricingTiers: [
          { inputTokenCondition: '<=512k', input: 0.3, output: 1.2, cacheRead: 0.06 },
          { inputTokenCondition: '>512k', input: 0.6, output: 2.4, cacheRead: 0.12 }
        ],
        priorityPriceMultiplier: 1.5,
        inputModalities: ['text', 'image', 'video'],
        thinking: ['adaptive', 'disabled'],
        thinkingDefaults: { openai: 'adaptive', anthropic: 'disabled' },
        reasoningEffort: [],
        reasoningEffortDefault: null,
        serviceTierSupported: true
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
