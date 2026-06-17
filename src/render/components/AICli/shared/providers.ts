import type { AICliProvider, ProviderKind, ModelsEndpoint } from './types'

/**
 * #712 built-in provider presets. baseURL + modelsEndpoint are pre-filled;
 * the user only supplies an apiKey (and optionally a custom baseURL).
 */
interface ProviderPreset {
  kind: ProviderKind
  label: string
  baseURL: string
  modelsEndpoint: ModelsEndpoint
  needsKey: boolean
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    kind: 'ollama',
    label: 'Ollama (Local)',
    baseURL: 'http://127.0.0.1:11434/v1',
    modelsEndpoint: 'ollama',
    needsKey: false
  },
  {
    kind: 'anthropic',
    label: 'Anthropic',
    baseURL: 'https://api.anthropic.com/v1',
    modelsEndpoint: 'anthropic',
    needsKey: true
  },
  {
    kind: 'openai',
    label: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    modelsEndpoint: 'openai',
    needsKey: true
  },
  {
    kind: 'siliconflow',
    label: 'SiliconFlow',
    baseURL: 'https://api.siliconflow.cn/v1',
    modelsEndpoint: 'openai',
    needsKey: true
  },
  {
    kind: 'openrouter',
    label: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    modelsEndpoint: 'openai',
    needsKey: true
  },
  {
    kind: 'custom',
    label: 'Custom (OpenAI compatible)',
    baseURL: '',
    modelsEndpoint: 'openai',
    needsKey: true
  }
]

let _seq = 0
export const makeProvider = (preset: ProviderPreset): AICliProvider => {
  _seq += 1
  return {
    id: `${preset.kind}-${_seq}`,
    label: preset.label,
    kind: preset.kind,
    baseURL: preset.baseURL,
    apiKey: '',
    models: [],
    modelsEndpoint: preset.modelsEndpoint
  }
}
