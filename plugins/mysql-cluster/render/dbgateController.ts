import { isWebPanelInstallNotice } from '@shared/WebPanelInstallNotice'
import { errorText } from '../shared'

export interface DbGateNode {
  bin: string
  version?: string | null
  path?: string
}
interface DbGateDependencies {
  available(): boolean
  node(): DbGateNode | undefined
  request(node: DbGateNode, progress: (info: any) => void): Promise<{ url: string }>
  openBrowser(url: string): Promise<unknown>
  installNotice(): { close(): void }
  error(message: string): void
  runtimeRequired(): string
  unavailable(): string
  browserFailed(): string
}

/** Owns opening across view changes; Fork owns installation and the companion process. */
export class MysqlClusterDbGateController {
  opening = false
  private flight?: Promise<void>
  private notice?: { close(): void }
  constructor(private readonly deps: DbGateDependencies) {}
  get nodeAvailable() {
    return !!this.deps.node()?.bin
  }
  private error(message: string) {
    try {
      this.deps.error(message)
    } catch {
      /* A notice cannot change a completed panel open. */
    }
  }
  private closeNotice() {
    try {
      this.notice?.close()
    } catch {
      /* Supplementary presentation cleanup. */
    }
    this.notice = undefined
  }
  open(): Promise<void> {
    if (this.flight) return this.flight
    const node = this.deps.node()
    if (!node?.bin) {
      this.error(this.deps.runtimeRequired())
      return Promise.resolve()
    }
    if (!this.deps.available()) {
      this.error(this.deps.unavailable())
      return Promise.resolve()
    }
    let snapshot: DbGateNode
    try {
      snapshot = JSON.parse(JSON.stringify(node))
    } catch (error) {
      this.error(errorText(error))
      return Promise.resolve()
    }
    this.opening = true
    this.flight = Promise.resolve()
      .then(async () => {
        const result = await this.deps.request(snapshot, (info) => {
          if (info?.code !== 200 || !isWebPanelInstallNotice(info.msg)) return
          this.closeNotice()
          try {
            this.notice = this.deps.installNotice()
          } catch {
            /* Installation continues without its optional notice. */
          }
        })
        if (!result?.url) throw new Error('DbGate did not return a panel URL')
        if (!this.deps.available()) return
        try {
          await this.deps.openBrowser(result.url)
        } catch {
          this.error(this.deps.browserFailed())
        }
      })
      .catch((error) => this.error(errorText(error)))
      .finally(() => {
        this.closeNotice()
        this.opening = false
        this.flight = undefined
      })
    return this.flight
  }
}
