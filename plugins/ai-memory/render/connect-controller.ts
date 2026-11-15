import type { MCPHttpClientFlag } from '../../../src/shared/mcpClientConfig'
export type ConnectClient = MCPHttpClientFlag | 'generic'
export type ConnectTransport = 'http' | 'stdio'
export type ConnectSettings = { serverUrl: string; token: string }
export type ConnectStep = 'idle' | 'running' | 'done' | 'failed' | 'unknown' | 'manual'
export type ConnectOperation = {
  status: 'running' | 'complete' | 'partial' | 'failed'
  steps: ConnectStep[]
  errorCode?: string
  rulesPath?: string
}
export interface ConnectDeps {
  prepareService(): Promise<ConnectSettings>
  readStatus(): Promise<boolean>
  readSettings(): Promise<ConnectSettings>
  configure(
    client: MCPHttpClientFlag,
    settings: ConnectSettings
  ): Promise<{ success: boolean; errorCode?: string }>
  installRules(
    client: MCPHttpClientFlag,
    projectPath?: string
  ): Promise<{ path: string; unchanged?: boolean }>
  snippet(transport: ConnectTransport, settings: ConnectSettings): Promise<string>
  copy(text: string): Promise<void>
  rules(): string
  notify(type: 'success' | 'error', key: string): void
}
function errorCode(error: unknown) {
  return error instanceof Error && /^[a-z_]+$/.test(error.message) ? error.message : 'connectFailed'
}
/** Owns the whole connection operation across page changes; view selection never changes its target. */
export class MemoryConnectController {
  operations: Partial<Record<ConnectClient, ConnectOperation>> = {}
  projectOperations: Record<
    string,
    { status: 'running' | 'complete' | 'failed'; path?: string; errorCode?: string }
  > = {}
  snippets: Partial<Record<ConnectTransport, string>> = {}
  feedback: Record<string, string> = {}
  snippetBusy = false
  snippetErrors: Partial<Record<ConnectTransport, string>> = {}
  private snippetsFlight?: Promise<void>
  serviceReady = false
  busy = false
  private statusSequence = 0
  private flight?: Promise<void>
  private statusFlight?: Promise<void>
  private readonly projectFlights = new Map<string, Promise<void>>()
  private readonly configured = new Map<MCPHttpClientFlag, ConnectSettings>()
  constructor(private readonly deps: ConnectDeps) {}
  refreshStatus() {
    if (this.busy) return Promise.resolve()
    if (this.statusFlight) return this.statusFlight
    const sequence = ++this.statusSequence
    this.statusFlight = this.deps
      .readStatus()
      .then((ready) => {
        if (sequence === this.statusSequence) this.serviceReady = ready
      })
      .catch(() => {
        if (sequence === this.statusSequence) this.serviceReady = false
      })
      .finally(() => {
        this.statusFlight = undefined
      })
    return this.statusFlight
  }
  connect(client: MCPHttpClientFlag) {
    if (this.flight) return this.flight
    this.busy = true
    this.statusSequence++
    this.operations[client] = { status: 'running', steps: ['running', 'idle', 'idle'] }
    const operation = this.operations[client]!
    this.flight = Promise.resolve()
      .then(async () => {
        let stage = 0
        try {
          const settings = await this.deps.prepareService()
          this.serviceReady = true
          operation.steps[0] = 'done'
          stage = 1
          operation.steps[1] = 'running'
          const prior = this.configured.get(client)
          if (!prior || prior.serverUrl !== settings.serverUrl || prior.token !== settings.token) {
            const result = await this.deps.configure(client, settings)
            if (!result.success) throw new Error(result.errorCode ?? 'client_config_failed')
            this.configured.set(client, { ...settings })
          }
          operation.steps[1] = 'done'
          stage = 2
          operation.steps[2] = 'running'
          const result = await this.deps.installRules(client)
          operation.rulesPath = result.path
          operation.steps[2] = 'done'
          operation.status = 'complete'
        } catch (error) {
          operation.errorCode = errorCode(error)
          operation.steps[stage] = operation.errorCode.includes('unknown') ? 'unknown' : 'failed'
          operation.status = stage === 2 ? 'partial' : 'failed'
          if (stage === 0) this.serviceReady = false
        }
        this.notice(
          operation.status === 'complete' ? 'success' : 'error',
          operation.status === 'complete'
            ? 'connectComplete'
            : operation.status === 'partial'
              ? 'connectPartial'
              : 'connectFailed'
        )
      })
      .finally(() => {
        this.busy = false
        this.flight = undefined
      })
    return this.flight
  }
  loadSnippets() {
    if (this.snippetsFlight) return this.snippetsFlight
    this.snippetBusy = true
    this.snippetsFlight = Promise.resolve()
      .then(async () => {
        try {
          const settings = await this.deps.readSettings()
          await Promise.all(
            (['http', 'stdio'] as const).map(async (transport) => {
              try {
                this.snippets[transport] = await this.deps.snippet(transport, settings)
                delete this.snippetErrors[transport]
              } catch (error) {
                delete this.snippets[transport]
                this.snippetErrors[transport] = errorCode(error)
              }
            })
          )
        } catch (error) {
          this.snippets = {}
          this.snippetErrors = { http: errorCode(error), stdio: errorCode(error) }
        }
      })
      .finally(() => {
        this.snippetBusy = false
        this.snippetsFlight = undefined
      })
    return this.snippetsFlight
  }
  copyConfig(transport: ConnectTransport) {
    const snippet = this.snippets[transport]
    if (!snippet) {
      this.feedback[`config:${transport}`] = 'config_unavailable'
      return Promise.resolve()
    }
    return this.copy(`config:${transport}`, snippet)
  }
  installProjectRules(client: MCPHttpClientFlag, path: string) {
    const key = `${client}:${path}`
    const prior = this.projectFlights.get(key)
    if (prior) return prior
    this.projectOperations[key] = { status: 'running' }
    const flight = Promise.resolve()
      .then(async () => {
        try {
          const result = await this.deps.installRules(client, path)
          this.projectOperations[key] = { status: 'complete', path: result.path }
        } catch (error) {
          this.projectOperations[key] = { status: 'failed', errorCode: errorCode(error) }
        }
      })
      .finally(() => this.projectFlights.delete(key))
    this.projectFlights.set(key, flight)
    return flight
  }
  copyRules() {
    return this.copy('rules', this.deps.rules())
  }
  private async copy(key: string, text: string) {
    try {
      await this.deps.copy(text)
      this.feedback[key] = 'connectCopied'
    } catch {
      this.feedback[key] = 'copyFailed'
    }
  }
  private notice(type: 'success' | 'error', key: string) {
    try {
      this.deps.notify(type, key)
    } catch {
      /* supplementary notice */
    }
  }
}
