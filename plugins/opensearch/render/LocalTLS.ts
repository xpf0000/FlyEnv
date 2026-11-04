import { reactiveBind } from '@/util/Index'
import IPC from '@/util/IPC'
import { MessageError, MessageSuccess } from '@/util/Element'
import { OpenSearchT } from './lang'
import type { SoftInstalled } from '@/store/brew'
import type { LocalTLSInput, LocalTLSResult } from '../fork/OpenSearch/tls'

type Dependencies = {
  ipc: typeof IPC
  success: (message: string) => unknown
  error: (message: string) => unknown
}

export class OpenSearchLocalTLS {
  applying = false
  result?: LocalTLSResult
  resultPath = ''
  private operation?: Promise<boolean>

  constructor(
    private readonly dependencies: Dependencies = {
      ipc: IPC,
      success: MessageSuccess,
      error: MessageError
    }
  ) {}

  configure(version: SoftInstalled | undefined, input: LocalTLSInput): Promise<boolean> {
    if (this.operation) return this.operation
    if (!version?.path || version.run || version.running || !input.caCert || !input.caKey) {
      this.notify('error', OpenSearchT('tlsStopFirst'))
      return Promise.resolve(false)
    }
    const snapshot = JSON.parse(JSON.stringify({ version, input }))
    this.applying = true
    this.result = undefined
    this.operation = this.request(snapshot.version, snapshot.input)
      .then(
        (result) => {
          this.result = result
          this.resultPath = snapshot.version.path
          this.notify('success', OpenSearchT('tlsConfigured'))
          return true
        },
        (error) => {
          this.notify('error', error instanceof Error ? error.message : String(error))
          return false
        }
      )
      .finally(() => {
        this.applying = false
        this.operation = undefined
      })
    return this.operation
  }

  private notify(kind: 'success' | 'error', message: string) {
    try {
      this.dependencies[kind](message)
    } catch {
      // A notification failure must not change the completed configuration result.
    }
  }

  private request(version: SoftInstalled, input: LocalTLSInput): Promise<LocalTLSResult> {
    return new Promise((resolve, reject) => {
      const request = this.dependencies.ipc.send(
        'app-fork:opensearch',
        'configureLocalTLS',
        version,
        input
      )
      // Certificate generation is bounded; timeout does not replay or roll back a completed write.
      let settled = false
      const finish = (callback: () => void, key = request.key) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        this.dependencies.ipc.off(request.key)
        if (key !== request.key) this.dependencies.ipc.off(key)
        callback()
      }
      const timer = setTimeout(
        () => finish(() => reject(new Error(OpenSearchT('tlsTimeout')))),
        120_000
      )
      try {
        request.then((key, response) => {
          if (settled || response?.code === 200) return
          finish(() => {
            if (response?.code === 0) resolve(response.data)
            else reject(new Error(response?.msg || OpenSearchT('tlsFailed')))
          }, key)
        })
      } catch (error) {
        finish(() => reject(error))
      }
    })
  }
}

export const OpenSearchTLS = reactiveBind(new OpenSearchLocalTLS())
