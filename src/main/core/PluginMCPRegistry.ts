import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv-provider.js'
import { validatePluginMCP, type PluginMCPTool } from '@shared/plugin/PluginMCP'
import type { MCPRuntimeTool, PluginMCPRegistration } from '@shared/mcpRuntimeCatalog'
import type { PluginRuntimeDescriptor } from '@shared/plugin/PluginRuntime'
import type { PluginWorkerRegistry } from './PluginWorkerRegistry'
import { PLUGIN_ERROR_CODES, pluginMCPAudit, type PluginMCPAudit } from './PluginMCPAudit'

type Entry = PluginMCPRegistration & {
  tool: PluginMCPTool
  validate: (input: unknown) => { valid: boolean }
}
export type PluginMCPToken = {
  name: string
  installGeneration: string
  descriptor: PluginRuntimeDescriptor
}

/** Catalog lifetime is the host's, independent of HTTP transport/server instances. */
export class PluginMCPRegistry {
  private entries = new Map<string, Entry>()
  constructor(
    private readonly workers: Pick<PluginWorkerRegistry, 'capture' | 'dispatch'>,
    private readonly config: (key: string, fallback?: any) => any,
    private readonly audit: PluginMCPAudit = pluginMCPAudit
  ) {}
  replace(registrations: PluginMCPRegistration[]) {
    const next = new Map<string, Entry>()
    // Separate validators avoid cross-plugin $id cache collisions.
    for (const registration of structuredClone(registrations)) {
      validatePluginMCP(registration.declaration)
      for (const tool of registration.declaration.tools) {
        if (next.has(tool.name)) throw new Error('duplicate_plugin_tool')
        const validate = new AjvJsonSchemaValidator().getValidator(tool.inputSchema)
        next.set(tool.name, { ...registration, tool, validate })
      }
    }
    this.entries = next
    for (const entry of next.values()) this.audit.register(entry.pluginId, [entry.tool.name])
    // Audit policy is intentionally retained when a tool disappears or is disabled.
  }
  listTools(): MCPRuntimeTool[] {
    return [...this.entries.values()].map(({ pluginId, tool }) => ({
      ...structuredClone(tool),
      pluginId
    }))
  }
  has(name: string) {
    return this.entries.has(name) || this.audit.has(name)
  }
  diagnostics(pluginId: string) {
    return this.audit.list(pluginId)
  }
  private enabled(name: string) {
    const entry = this.entries.get(name)
    if (!entry) throw new Error('tool_unavailable')
    if (!(this.config('enabledTools', []) as string[]).includes(name))
      throw new Error('tool_disabled')
    return entry
  }
  async capture(name: string): Promise<PluginMCPToken> {
    const entry = this.enabled(name)
    const descriptor = await this.workers.capture(entry.moduleId)
    if (
      this.enabled(name).installGeneration !== entry.installGeneration ||
      descriptor.installGeneration !== entry.installGeneration
    )
      throw new Error('plugin_stale_generation')
    return { name, installGeneration: entry.installGeneration, descriptor }
  }
  async dispatch(token: PluginMCPToken, args: Record<string, unknown>): Promise<any> {
    const entry = this.enabled(token.name)
    if (
      entry.installGeneration !== token.installGeneration ||
      entry.pluginId !== token.descriptor.pluginId
    )
      throw new Error('plugin_stale_generation')
    if (!entry.validate(args).valid) throw new Error('invalid_input')
    const response = await this.workers.dispatch(
      entry.moduleId,
      entry.tool.method,
      [args],
      token.descriptor,
      () => {
        const current = this.enabled(token.name)
        if (
          current.installGeneration !== token.installGeneration ||
          current.pluginId !== token.descriptor.pluginId
        )
          throw new Error('plugin_stale_generation')
      }
    )
    if (response?.code !== 0)
      return {
        outcome: response?.outcome === 'unknown' ? 'unknown' : 'failed',
        error_code:
          response?.outcome === 'unknown' ? 'plugin_result_unknown' : 'plugin_request_failed'
      }
    return response.data
  }
  async invoke(
    name: string,
    args: Record<string, unknown>,
    confirm: () => Promise<boolean>,
    client?: { name?: string; version?: string }
  ): Promise<any> {
    const started = performance.now()
    let result: any
    try {
      const input = structuredClone(args)
      const entry = this.enabled(name)
      if (!entry.validate(input).valid) throw new Error('invalid_input')
      const token = await this.capture(name)
      const approval = this.config('approval', {}) as Record<string, string>
      if (
        (entry.tool.risky || !entry.tool.readOnly) &&
        (approval[name] ?? 'confirm') !== 'auto' &&
        !(await confirm())
      )
        throw new Error('cancelled')
      result = await this.dispatch(token, input)
    } catch (error) {
      const code =
        error instanceof Error && PLUGIN_ERROR_CODES.has(error.message)
          ? error.message
          : 'operation_failed'
      result = { outcome: code === 'cancelled' ? 'cancelled' : 'failed', error_code: code }
    }
    try {
      this.audit.log(name, { args, result, durationMs: performance.now() - started, client })
    } catch {
      /* Supplementary diagnostics never change the operation result. */
    }
    return result
  }
}
