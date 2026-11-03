import { Base } from '@fork/module/Base'
import { ForkPromise } from '@shared/ForkPromise'
import type { PluginRuntimeDescriptor } from '../../../src/shared/plugin/PluginRuntime'
import { MEMORY_METHODS, MemoryEngine, memoryToolResult } from './MemoryEngine'
import type { MemoryMethod } from '../shared'

class AIMemory extends Base {
  private engine?: MemoryEngine
  constructor() {
    super()
    this.type = 'ai-memory'
  }
  async initialize(descriptor: PluginRuntimeDescriptor) {
    if (this.engine) throw new Error('plugin_already_initialized')
    this.engine = new MemoryEngine(descriptor.dataRoot)
  }
  exec(method: string, ...args: any[]) {
    return new ForkPromise<any>(async (resolve) => {
      const engine = this.engine
      if (!engine) {
        resolve({ outcome: 'failed', error_code: 'plugin_not_ready', isError: true })
        return
      }
      if (MEMORY_METHODS.includes(method as MemoryMethod)) {
        resolve(
          memoryToolResult(
            method as MemoryMethod,
            await engine.call(method as MemoryMethod, args[0])
          )
        )
      } else if (method === 'listProjects') resolve(await engine.listProjects())
      else if (method === 'inspectRecovery') resolve(await engine.inspectRecovery())
      else if (method === 'callForProject')
        resolve(await engine.callForProject(args[0], args[1], args[2]))
      else resolve({ outcome: 'failed', error_code: 'invalid_method', isError: true })
    })
  }
  async close() {
    await this.engine?.close()
  }
}
export default new AIMemory()
