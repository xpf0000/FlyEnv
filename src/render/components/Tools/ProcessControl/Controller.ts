import IPC from '@/util/IPC'
import { MessageError, MessageSuccess, MessageWarning } from '@/util/Element'
import { I18nT } from '@lang/index'

export type ProcessItem = {
  PID: string
  PPID?: string
  USER: string
  COMMAND: string
  children?: ProcessItem[]
}

export class ProcessToolController {
  constructor(private readonly kind: 'port' | 'process') {}
  querying = false
  killing = false
  rows: ProcessItem[] = []
  processes: ProcessItem[] = []
  lastQuery = ''
  error = ''
  private requestedQuery = ''
  private queryRevision = 0
  private queryOperation?: Promise<void>
  private killOperation?: Promise<void>

  search(port: string): Promise<void> {
    const requestedQuery = String(port ?? '')
    if (!this.queryOperation || requestedQuery !== this.requestedQuery) this.queryRevision++
    this.requestedQuery = requestedQuery
    this.lastQuery = this.requestedQuery
    if (!this.requestedQuery) {
      this.rows = []
      this.processes = []
      this.lastQuery = ''
      this.error = ''
    }
    if (this.queryOperation) return this.queryOperation
    if (!this.requestedQuery) return Promise.resolve()
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
      const snapshot = this.requestedQuery
      const revision = this.queryRevision
      if (!snapshot) return
      queriedRevision = revision
      try {
        const result = await this.invoke(
          this.kind === 'port' ? 'getPortPids' : 'getPidsByKey',
          snapshot
        )
        if (revision !== this.queryRevision) continue
        if (!Array.isArray(result)) throw new Error('Invalid process query response')
        this.error = ''
        this.lastQuery = snapshot
        const map = new Map<string, ProcessItem>()
        const collect = (items: ProcessItem[]) => {
          for (const item of items) {
            if (map.has(item.PID)) continue
            map.set(item.PID, { ...item, children: [] })
            if (item.children) collect(item.children)
          }
        }
        // Windows process queries already return a tree; Unix queries return a flat list.
        collect(result)
        this.processes = Array.from(map.values(), (item) => ({ ...item, children: undefined }))
        this.rows = []
        for (const item of map.values()) {
          const parent = item.PPID ? map.get(item.PPID) : undefined
          if (parent) parent.children!.push(item)
          else this.rows.push(item)
        }
        if (!result.length)
          MessageWarning(I18nT(this.kind === 'port' ? 'base.portNotUse' : 'base.processNotFound'))
      } catch (error) {
        if (revision !== this.queryRevision) continue
        this.rows = []
        this.processes = []
        this.lastQuery = snapshot
        this.reportError(error)
      }
    }
  }

  kill(pids: string[], useSudo = false): Promise<void> {
    if (this.killOperation) return this.killOperation
    const snapshot = [...new Set(pids.map(String))]
    if (!snapshot.length) return Promise.resolve()
    this.killing = true
    this.error = ''
    const stop = useSudo
      ? import('./SudoKill').then(({ runSudoKill }) =>
          runSudoKill(
            snapshot,
            I18nT(this.kind === 'port' ? 'util.toolPortKill' : 'util.toolProcessKill')
          )
        )
      : this.invoke('killPids', '-9', snapshot)
    const operation = stop
      .then(async (result) => {
        if (result !== true) throw new Error('Invalid process stop response')
        MessageSuccess(I18nT('base.success'))
        // Search reports its own error; it cannot undo a completed stop.
        // Invalidate pre-stop snapshots even when the query is unchanged.
        this.queryRevision++
        await this.search(this.requestedQuery)
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
