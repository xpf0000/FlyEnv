import { reactive } from 'vue'
import IPC from '@/util/IPC'
class CounterController {
  result: unknown = null
  private sequence = 0
  private call(method: string, input: unknown) {
    const sequence = ++this.sequence
    IPC.sendSensitive('app-fork:mcp-runtime-fixture', method, input).then(
      (key: string, response: any) => {
        if (response?.code === 200) return
        IPC.off(key)
        if (sequence === this.sequence) this.result = response
      }
    )
  }
  read() {
    this.call('read', {})
  }
  write() {
    this.call('write', { increment: 1 })
  }
}
export const Fixture = reactive(new CounterController())
