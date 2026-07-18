import { LazyRuntime } from './lazy/LazyRuntime'

type MCPConfigReader = {
  getConfig: (key?: string, defaultValue?: any) => any
}

type MCPServerController = {
  start: () => Promise<any>
  stop: () => Promise<any>
  status: () => Record<string, any>
}

export class MCPRuntime {
  private readonly runtime: LazyRuntime<MCPServerController>

  constructor(
    private readonly config: MCPConfigReader,
    factory: () => Promise<MCPServerController>
  ) {
    this.runtime = new LazyRuntime(factory)
  }

  load() {
    return this.runtime.load()
  }

  peek() {
    return this.runtime.peek()
  }

  async start() {
    return (await this.load()).start()
  }

  async startOnLaunch() {
    if (!this.config.getConfig('autoStart', false)) return false
    try {
      await this.start()
      return true
    } catch (error) {
      console.log('mcp auto-start error: ', error)
      return false
    }
  }

  async stopLoaded() {
    const server = this.peek()
    if (!server) return { running: false }
    return server.stop()
  }

  status() {
    const server = this.peek()
    if (server) return server.status()
    return { ...(this.config.getConfig() ?? {}), running: false }
  }
}
