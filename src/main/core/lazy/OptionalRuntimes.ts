import { LazyRuntime } from './LazyRuntime'

type CapturerConfigLike = {
  key: string[]
}

type ConfigurableCapturer<TConfig extends CapturerConfigLike> = {
  configUpdate(config: TConfig): void
}

export const syncCapturerConfig = async <TConfig extends CapturerConfigLike>(
  runtime: Pick<LazyRuntime<ConfigurableCapturer<TConfig>>, 'load' | 'peek'>,
  config: TConfig
): Promise<void> => {
  const capturer = runtime.peek()
  if (capturer) {
    capturer.configUpdate(config)
    return
  }
  if (config.key.length === 0) return

  const loadedCapturer = await runtime.load()
  loadedCapturer.configUpdate(config)
}

export const oauthRuntime = new LazyRuntime(async () => (await import('../OAuth')).default)
export const nodePtyRuntime = new LazyRuntime(async () => (await import('../NodePTY')).default)
export const capturerRuntime = new LazyRuntime(async () => (await import('../Capturer')).default)
export const httpServerRuntime = new LazyRuntime(
  async () => (await import('../HttpServer')).default
)
export const siteSuckerRuntime = new LazyRuntime(
  async () => (await import('../../ui/SiteSucker')).default
)
export const mcpAuditRuntime = new LazyRuntime(async () => (await import('../MCPAudit')).default)
