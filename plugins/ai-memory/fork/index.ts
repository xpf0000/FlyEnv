import { Base } from '@fork/module/Base'
import { ForkPromise } from '@shared/ForkPromise'
import type { PluginRuntimeDescriptor } from '../../../src/shared/plugin/PluginRuntime'
import { MEMORY_METHODS, memoryToolResult } from './MemoryEngine'
import { MemoryWorkspace } from './MemoryWorkspace'
import type { MemoryMethod } from '../shared'
import { MemoryRulesInstaller } from './rules-installer'
import { readFile } from 'node:fs/promises'

class AIMemory extends Base {
  private workspace?: MemoryWorkspace
  private readonly rulesInstaller = new MemoryRulesInstaller()
  constructor() {
    super()
    this.type = 'ai-memory'
  }
  async initialize(descriptor: PluginRuntimeDescriptor) {
    if (this.workspace) throw new Error('plugin_already_initialized')
    this.workspace = await MemoryWorkspace.open(descriptor.dataRoot)
  }
  exec(method: string, ...args: any[]) {
    return new ForkPromise<any>(async (resolve) => {
      try {
        const workspace = this.workspace
        if (!workspace) {
          resolve({ outcome: 'failed', error_code: 'plugin_not_ready', isError: true })
          return
        }
        if (MEMORY_METHODS.includes(method as MemoryMethod)) {
          resolve(
            memoryToolResult(
              method as MemoryMethod,
              await workspace.run((engine) => engine.call(method as MemoryMethod, args[0]))
            )
          )
        } else if (method === 'installRules') {
          try {
            const rules = await readFile(
              new URL(`../assets/memory-rules${args[1] === 'zh' ? '.zh' : ''}.md`, import.meta.url),
              'utf8'
            )
            resolve({
              outcome: 'success',
              data: await this.rulesInstaller.install(args[0], rules, args[2])
            })
          } catch (error) {
            const code =
              error instanceof Error && /^rules_[a-z_]+$/.test(error.message)
                ? error.message
                : 'rules_unavailable'
            resolve({ outcome: 'failed', error_code: code })
          }
        } else if (method === 'backup' || method === 'restoreBackup')
          resolve(
            await (method === 'backup'
              ? workspace.backup(args[0], args[1])
              : workspace.restore(args[0], args[1]))
          )
        else if (method === 'maintenanceResult') resolve(await workspace.result(args[0]))
        else if (method === 'universe')
          resolve(await workspace.run((engine) => engine.universe(args[0])))
        else if (method === 'universeForProject')
          resolve(await workspace.run((engine) => engine.universeForProject(args[0], args[1])))
        else if (method === 'runtimeInfo')
          resolve({ outcome: 'success', data: { dataRoot: workspace.dataRoot } })
        else if (method === 'listProjects')
          resolve(await workspace.run((engine) => engine.listProjects()))
        else if (method === 'relinkProject') resolve(await workspace.relinkProject(args[0]))
        else if (method === 'inspectRecovery')
          resolve(await workspace.run((engine) => engine.inspectRecovery()))
        else if (method === 'callForProject')
          resolve(await workspace.run((engine) => engine.callForProject(args[0], args[1], args[2])))
        else resolve({ outcome: 'failed', error_code: 'invalid_method', isError: true })
      } catch (error) {
        resolve({
          outcome: 'failed',
          error_code:
            error instanceof Error &&
            ['engine_closed', 'restore_recovery_required'].includes(error.message)
              ? error.message
              : 'operation_failed',
          isError: true
        })
      }
    })
  }
  async close() {
    await this.workspace?.close()
  }
}
export default new AIMemory()
