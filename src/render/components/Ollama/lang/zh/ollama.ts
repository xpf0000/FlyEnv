export default {
  OLLAMA_DEBUG: '显示其他调试信息（示例: OLLAMA_BUG=1）',
  OLLAMA_HOST: 'OLLAMA服务器的IP地址（默认127.0.0.1:11434）',
  OLLAMA_KEEP_ALIVE: '模型在内存中保持加载的持续时间（默认为"5m"）',
  OLLAMA_MAX_LOADED_MODELS: '每个GPU加载的最大模型数',
  OLLAMA_MAX_QUEUE: '排队请求的最大数量',
  OLLAMA_MODELS: '模型目录的路径',
  OLLAMA_NUM_PARALLEL: '最大并行请求数',
  OLLAMA_NOPRUNE: '不要在启动时修剪模型blob',
  OLLAMA_ORIGINS: '一个以逗号分隔的允许来源列表',
  OLLAMA_SCHED_SPREAD: '始终跨所有GPU调度模型',
  OLLAMA_FLASH_ATTENTION: '启用闪光注意力',
  OLLAMA_KV_CACHE_TYPE: 'K/V缓存的量化类型（默认值: f16）',
  OLLAMA_LLM_LIBRARY: '将LLM库设置为绕过自动检测',
  OLLAMA_GPU_OVERHEAD: '为每个GPU保留一部分VRAM（字节）',
  OLLAMA_LOAD_TIMEOUT: '在放弃之前允许模型负载停滞多长时间（默认为"5m"）'
}
