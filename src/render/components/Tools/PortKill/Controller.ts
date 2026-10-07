import IPC from '@/util/IPC'
import { reactiveBind } from '@/util/Index'
import { MessageError, MessageSuccess, MessageWarning } from '@/util/Element'
import { I18nT } from '@lang/index'

export type ProcessItem = {
  PID: string
  PPID?: string
  USER: string
  COMMAND: string
  children?: ProcessItem[]
}

export class PortKillController {
  querying = false
  killing = false
  rows: ProcessItem[] = []
  processes: ProcessItem[] = []
  lastPort = ''
  error = ''
  private requestedPort = ''
  private queryRevision = 0
  private queryOperation?: Promise<void>
  private killOperation?: Promise<void>

  search(port: string): Promise<void> {
    const requestedPort = String(port ?? '')
    if (!this.queryOperation || requestedPort !== this.requestedPort) this.queryRevision++
    this.requestedPort = requestedPort
    this.lastPort = this.requestedPort
    if (!this.requestedPort) {
      this.rows = []
      this.processes = []
      this.lastPort = ''
      this.error = ''
    }
    if (this.queryOperation) return this.queryOperation
    if (!this.requestedPort) return Promise.resolve()
    this.querying = true
    const operation = this.runSearch().finally(() => {
      this.querying = false
      this.queryOperation = undefined
    })
    this.queryOperation = operation
    return operation
  }

  private async runSearch(): Promise<void> {
    let queriedRevision = -1
    while (queriedRevision !== this.queryRevision) {
      const snapshot = this.requestedPort
      const revision = this.queryRevision
      if (!snapshot) return
      queriedRevision = revision
      try {
        const result = await this.invoke('getPortPids', snapshot)
        if (revision !== this.queryRevision) continue
        if (!Array.isArray(result)) throw new Error('Invalid port query response')
        this.error = ''
        this.lastPort = snapshot
        this.processes = result
        const map = new Map<string, ProcessItem>()
        for (const item of this.processes) map.set(item.PID, { ...item, children: [] })
        this.rows = []
        for (const item of map.values()) {
          const parent = item.PPID ? map.get(item.PPID) : undefined
          if (parent) parent.children!.push(item)
          else this.rows.push(item)
        }
        if (!result.length) MessageWarning(I18nT('base.portNotUse'))
      } catch (error) {
        if (revision !== this.queryRevision) continue
        this.rows = []
        this.processes = []
        this.lastPort = snapshot
        this.reportError(error)
      }
    }
  }

  kill(pids: string[]): Promise<void> {
    if (this.killOperation) return this.killOperation
    const snapshot = [...new Set(pids.map(String))]
    if (!snapshot.length) return Promise.resolve()
    this.killing = true
    this.error = ''
    const operation = this.invoke('killPids', '-9', snapshot)
      .then(async (result) => {
        if (result !== true) throw new Error('Invalid process stop response')
        MessageSuccess(I18nT('base.success'))
        // Search reports its own error; it cannot undo a completed stop.
        // Invalidate pre-stop snapshots even when the queried port is unchanged.
        this.queryRevision++
        await this.search(this.requestedPort)
      })
      .catch((error: unknown) => this.reportError(error))
      .finally(() => {
        this.killing = false
        this.killOperation = undefined
      })
    this.killOperation = operation
    return operation
  }

  private reportError(error: unknown): void {
    this.error = error instanceof Error ? error.message : String(error)
    MessageError(this.error)
  }

  private invoke(fn: string, ...args: unknown[]): Promise<unknown> {
    return new Promise((resolve, reject) => {
      IPC.send('app-fork:tools', fn, ...args).then((key: string, response: any) => {
        if (response?.code === 200) return
        IPC.off(key)
        if (response?.code === 0) resolve(response.data)
        else reject(new Error(response?.msg ?? I18nT('base.fail')))
      })
    })
  }
}

export default reactiveBind(new PortKillController())
