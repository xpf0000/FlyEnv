import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { PluginRuntimeDescriptor } from '../../../../../src/shared/plugin/PluginRuntime'

class Counter {
  private count = 0
  private file = ''
  private tail: Promise<unknown> = Promise.resolve()
  async initialize(descriptor: PluginRuntimeDescriptor) {
    this.file = join(descriptor.dataRoot, 'counter.json')
    try {
      this.count = JSON.parse(await readFile(this.file, 'utf8')).count
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  exec(method: string, input: any = {}) {
    const operation = this.tail.then(async () => {
      if (method === 'write') {
        if (!Number.isSafeInteger(input.increment)) throw new Error('invalid_input')
        if (input.delay) await new Promise((resolve) => setTimeout(resolve, input.delay))
        this.count += input.increment
        await writeFile(this.file, JSON.stringify({ count: this.count }))
      } else if (method !== 'read') throw new Error('invalid_method')
      return {
        outcome: 'success',
        data: { count: this.count, pid: process.pid, build: 'fixture-v1' }
      }
    })
    this.tail = operation.catch(() => {})
    return operation
  }
  async close() {
    await this.tail
  }
}
export default new Counter()
