import { LazyRuntime } from './LazyRuntime'

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
