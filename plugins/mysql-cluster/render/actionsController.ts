import type { InstanceSpec } from '../shared'
import { errorText } from '../shared'

export type InstanceView = 'config' | 'errorLog' | 'slowLog' | 'manage'
export class InstanceActionController {
  private flights = new Map<string, Promise<void>>()
  constructor(
    private readonly deps: {
      copy(text: string): Promise<unknown>
      open(id: string, view: InstanceView): Promise<unknown>
      notify(type: 'success' | 'error', message: string): void
      copied(): string
    }
  ) {}
  private run(key: string, task: () => Promise<void>) {
    const current = this.flights.get(key)
    if (current) return current
    const flight = Promise.resolve()
      .then(task)
      .catch((error) => {
        this.notice('error', errorText(error))
      })
      .finally(() => this.flights.delete(key))
    this.flights.set(key, flight)
    return flight
  }
  private notice(type: 'success' | 'error', message: string) {
    try {
      this.deps.notify(type, message)
    } catch {
      /* A notice cannot undo a copy. */
    }
  }
  copyConnection(instance: InstanceSpec) {
    const text = `Host: 127.0.0.1\nPort: ${instance.port}\nSocket: ${instance.socket}\nUser: root`
    return this.run(`copy:${instance.id}`, async () => {
      await this.deps.copy(text)
      this.notice('success', this.deps.copied())
    })
  }
  open(id: string, view: InstanceView) {
    return this.run(`open:${id}:${view}`, async () => {
      await this.deps.open(id, view)
    })
  }
}
