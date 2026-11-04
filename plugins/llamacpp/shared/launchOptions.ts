export interface FlagCapability {
  canonicalName: string
  aliases: string[]
  arity: 0 | 1 | 2 | 'optional'
  values?: string[]
  negative?: boolean
  repeatable?: boolean
  helpLine?: string
}
export interface RuntimeCapabilities {
  status: 'known' | 'unknown'
  byAlias: Record<string, FlagCapability>
  help: string
}
export interface DeviceInfo {
  name: string
  description: string
}
export const controlledOptions = new Set([
  'model',
  'model-url',
  'mmproj-url',
  'hf-repo',
  'hf-file',
  'hf-token',
  'docker-repo',
  'host',
  'port',
  'api-key',
  'api-key-file',
  'log-file',
  'log-disable',
  'log-prompts-dir',
  'models-dir',
  'models-preset',
  'models-max',
  'models-autoload',
  'help',
  'usage',
  'version',
  'list-devices',
  'cache-list',
  'completion-bash',
  'api-prefix',
  'ssl-key-file',
  'ssl-cert-file'
])

export interface SettingField {
  path: string
  flag: string
  negative?: string
  type: 'number' | 'text' | 'enum' | 'boolean' | 'layers' | 'ratios'
  group: 'base' | 'performance' | 'multimodal' | 'chat' | 'sampling'
  en: string
  zh: string
  values?: string[]
  min?: number
  max?: number
  integer?: boolean
}
export const settingFields: SettingField[] = [
  {
    path: 'base.contextSize',
    flag: '--ctx-size',
    type: 'number',
    group: 'base',
    en: 'Context size',
    zh: '上下文长度',
    min: 0,
    max: 1048576,
    integer: true
  },
  {
    path: 'base.threads',
    flag: '--threads',
    type: 'number',
    group: 'base',
    en: 'Generation threads',
    zh: '生成线程',
    min: 1,
    max: 512,
    integer: true
  },
  {
    path: 'backend.gpuLayers',
    flag: '--n-gpu-layers',
    type: 'layers',
    group: 'base',
    en: 'GPU layers',
    zh: 'GPU 层数',
    min: 0,
    max: 999,
    integer: true,
    values: ['auto', 'all']
  },
  {
    path: 'backend.gpuDevice',
    flag: '--device',
    type: 'text',
    group: 'base',
    en: 'GPU devices',
    zh: 'GPU 设备'
  },
  {
    path: 'base.threadsBatch',
    flag: '--threads-batch',
    type: 'number',
    group: 'base',
    en: 'Prompt processing threads',
    zh: '提示处理线程',
    min: 1,
    max: 512,
    integer: true
  },
  {
    path: 'base.batchSize',
    flag: '--batch-size',
    type: 'number',
    group: 'base',
    en: 'Batch size',
    zh: '批处理大小',
    min: 1,
    integer: true
  },
  {
    path: 'base.ubatchSize',
    flag: '--ubatch-size',
    type: 'number',
    group: 'base',
    en: 'Micro-batch size',
    zh: '微批处理大小',
    min: 1,
    integer: true
  },
  {
    path: 'base.parallel',
    flag: '--parallel',
    type: 'number',
    group: 'base',
    en: 'Parallel slots',
    zh: '并发槽数',
    min: 1,
    integer: true
  },
  {
    path: 'base.alias',
    flag: '--alias',
    type: 'text',
    group: 'base',
    en: 'API model alias',
    zh: 'API 模型别名'
  },
  {
    path: 'performance.flashAttention',
    flag: '--flash-attn',
    type: 'enum',
    group: 'performance',
    en: 'Flash Attention',
    zh: 'Flash Attention',
    values: ['auto', 'on', 'off']
  },
  {
    path: 'performance.cacheTypeK',
    flag: '--cache-type-k',
    type: 'enum',
    group: 'performance',
    en: 'K cache type',
    zh: 'K cache 类型',
    values: ['f32', 'f16', 'bf16', 'q8_0', 'q4_0', 'q4_1', 'iq4_nl', 'q5_0', 'q5_1']
  },
  {
    path: 'performance.cacheTypeV',
    flag: '--cache-type-v',
    type: 'enum',
    group: 'performance',
    en: 'V cache type',
    zh: 'V cache 类型',
    values: ['f32', 'f16', 'bf16', 'q8_0', 'q4_0', 'q4_1', 'iq4_nl', 'q5_0', 'q5_1']
  },
  {
    path: 'performance.kvOffload',
    flag: '--kv-offload',
    negative: '--no-kv-offload',
    type: 'boolean',
    group: 'performance',
    en: 'KV cache GPU offload',
    zh: 'KV cache GPU 卸载'
  },
  {
    path: 'performance.loadMode',
    flag: '--load-mode',
    type: 'enum',
    group: 'performance',
    en: 'Model loading mode',
    zh: '模型加载方式',
    values: ['auto', 'none', 'mmap', 'mlock', 'mmap+mlock', 'dio']
  },
  {
    path: 'performance.continuousBatching',
    flag: '--cont-batching',
    negative: '--no-cont-batching',
    type: 'boolean',
    group: 'performance',
    en: 'Continuous batching',
    zh: '连续批处理'
  },
  {
    path: 'performance.contextShift',
    flag: '--context-shift',
    negative: '--no-context-shift',
    type: 'boolean',
    group: 'performance',
    en: 'Context shift',
    zh: '上下文移位'
  },
  {
    path: 'backend.splitMode',
    flag: '--split-mode',
    type: 'enum',
    group: 'performance',
    en: 'Multi-GPU split mode',
    zh: '多 GPU 分配方式',
    values: ['none', 'layer', 'row', 'tensor']
  },
  {
    path: 'backend.tensorSplit',
    flag: '--tensor-split',
    type: 'ratios',
    group: 'performance',
    en: 'GPU split proportions',
    zh: 'GPU 分配比例'
  },
  {
    path: 'backend.mainGpu',
    flag: '--main-gpu',
    type: 'number',
    group: 'performance',
    en: 'Primary GPU index',
    zh: '主 GPU 编号',
    min: 0,
    integer: true
  },
  {
    path: 'backend.projectorOffload',
    flag: '--mmproj-offload',
    negative: '--no-mmproj-offload',
    type: 'boolean',
    group: 'multimodal',
    en: 'Projector GPU offload',
    zh: '投影 GPU 卸载'
  },
  {
    path: 'backend.projectorDevice',
    flag: '--mmproj-device',
    type: 'text',
    group: 'multimodal',
    en: 'Projector device',
    zh: '投影设备'
  },
  {
    path: 'multimodal.imageMinTokens',
    flag: '--image-min-tokens',
    type: 'number',
    group: 'multimodal',
    en: 'Minimum tokens per image',
    zh: '每图最少 token',
    min: 0,
    integer: true
  },
  {
    path: 'multimodal.imageMaxTokens',
    flag: '--image-max-tokens',
    type: 'number',
    group: 'multimodal',
    en: 'Maximum tokens per image',
    zh: '每图最多 token',
    min: 1,
    integer: true
  },
  {
    path: 'multimodal.batchMaxTokens',
    flag: '--mtmd-batch-max-tokens',
    type: 'number',
    group: 'multimodal',
    en: 'Encoding batch tokens',
    zh: '多模态编码批次 token',
    min: 1,
    integer: true
  }
]
export const getSetting = (profile: any, path: string, backend: string): any =>
  path.startsWith('backend.')
    ? profile.backendOverrides?.[backend]?.[path.slice(8)]
    : path.split('.').reduce((o, k) => o?.[k], profile)
export const setSetting = (profile: any, path: string, backend: string, value: unknown) => {
  const parts = path.split('.')
  const target =
    parts[0] === 'backend'
      ? (profile.backendOverrides[backend] ?? (profile.backendOverrides[backend] = {}))
      : profile[parts[0]]
  if (value === undefined || value === '') delete target[parts[1]]
  else target[parts[1]] = value
}
settingFields.push(
  {
    path: 'chat.reasoning',
    flag: '--reasoning',
    type: 'enum',
    group: 'chat',
    en: 'Thinking mode',
    zh: '思考模式',
    values: ['auto', 'on', 'off']
  },
  {
    path: 'chat.reasoningBudget',
    flag: '--reasoning-budget',
    type: 'number',
    group: 'chat',
    en: 'Thinking budget (-1 unlimited, 0 off)',
    zh: '思考预算（-1 不限，0 关闭）',
    min: -1,
    integer: true
  },
  {
    path: 'chat.reasoningEffort',
    flag: '--reasoning-effort',
    type: 'enum',
    group: 'chat',
    en: 'Thinking effort',
    zh: '思考强度',
    values: ['default', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
  },
  {
    path: 'chat.reasoningFormat',
    flag: '--reasoning-format',
    type: 'enum',
    group: 'chat',
    en: 'Thinking output format',
    zh: '思考输出格式',
    values: ['auto', 'none', 'deepseek', 'deepseek-legacy']
  },
  {
    path: 'chat.jinja',
    flag: '--jinja',
    negative: '--no-jinja',
    type: 'boolean',
    group: 'chat',
    en: 'Jinja template processing',
    zh: 'Jinja 模板处理'
  },
  {
    path: 'sampling.temperature',
    flag: '--temp',
    type: 'number',
    group: 'sampling',
    en: 'Temperature',
    zh: '温度',
    min: 0
  },
  {
    path: 'sampling.topP',
    flag: '--top-p',
    type: 'number',
    group: 'sampling',
    en: 'Top P',
    zh: 'Top P',
    min: 0,
    max: 1
  },
  {
    path: 'sampling.topK',
    flag: '--top-k',
    type: 'number',
    group: 'sampling',
    en: 'Top K (0 off)',
    zh: 'Top K（0 关闭）',
    min: 0,
    integer: true
  },
  {
    path: 'sampling.minP',
    flag: '--min-p',
    type: 'number',
    group: 'sampling',
    en: 'Min P',
    zh: 'Min P',
    min: 0,
    max: 1
  },
  {
    path: 'sampling.repeatPenalty',
    flag: '--repeat-penalty',
    type: 'number',
    group: 'sampling',
    en: 'Repeat penalty (>0)',
    zh: '重复惩罚（>0）',
    min: 0
  },
  {
    path: 'sampling.presencePenalty',
    flag: '--presence-penalty',
    type: 'number',
    group: 'sampling',
    en: 'Presence penalty',
    zh: '存在惩罚'
  },
  {
    path: 'sampling.frequencyPenalty',
    flag: '--frequency-penalty',
    type: 'number',
    group: 'sampling',
    en: 'Frequency penalty',
    zh: '频率惩罚'
  },
  {
    path: 'sampling.seed',
    flag: '--seed',
    type: 'number',
    group: 'sampling',
    en: 'Random seed (-1 random)',
    zh: '随机种子（-1 随机）',
    min: -1,
    max: 4294967295,
    integer: true
  },
  {
    path: 'sampling.maxTokens',
    flag: '--n-predict',
    type: 'number',
    group: 'sampling',
    en: 'Default output tokens (-1 unlimited)',
    zh: '默认输出 token（-1 不限）',
    min: -1,
    integer: true
  }
)
export const knownTemplateThinkingKeys = (template: { kind: string; name?: string }): string[] =>
  template.kind === 'builtin' && ['qwen3', 'qwen3.5'].includes(template.name ?? '')
    ? ['enable_thinking']
    : []
