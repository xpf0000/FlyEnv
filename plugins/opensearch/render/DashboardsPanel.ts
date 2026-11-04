import { reactiveBind } from '@/util/Index'
import IPC from '@/util/IPC'
import { shell } from '@/util/NodeFn'
import { MessageError } from '@/util/Element'
import type { SoftInstalled } from '@/store/brew'
import { OpenSearchT, type OpenSearchLangKey } from './lang'

type IPCRequest = { key: string; then: (callback: (key: string, response: any) => void) => void }

type DashboardsPanelDependencies = {
  ipc: { send: (...args: any[]) => IPCRequest; off: (key: string) => void }
  shell: { openExternal: (url: string) => Promise<unknown> }
  translate: (key: OpenSearchLangKey) => string
  notifyError: (message: string) => void
  inactivityTimeoutMs: number
  maxTimeoutMs: number
  prepareMaxTimeoutMs: number
}

const defaultDependencies: DashboardsPanelDependencies = {
  ipc: IPC,
  shell,
  translate: (key) => OpenSearchT(key),
  notifyError: MessageError,
  // A first install can download a large archive; progress refreshes the idle deadline.
  inactivityTimeoutMs: 2 * 60 * 1000,
  maxTimeoutMs: 6.5 * 60 * 1000,
  prepareMaxTimeoutMs: 16 * 60 * 1000
}

const isRunningVersion = (version?: Partial<SoftInstalled>): version is SoftInstalled => {
  if (!version || version.run !== true || version.running === true) return false
  if (!version.version || !version.bin || !version.path) return false
  const pid = Number(version.pid)
  return Number.isSafeInteger(pid) && pid > 0
}

export class OpenSearchDashboardsPanel {
  opening = false
  progressText = ''
  private operation?: Promise<void>

  constructor(private readonly dependencies: DashboardsPanelDependencies = defaultDependencies) {}

  open(version?: Partial<SoftInstalled>): Promise<void> {
    if (this.operation) return this.operation
    if (!isRunningVersion(version)) {
      this.report(this.dependencies.translate('dashboardsNoRunningVersion'))
      return Promise.resolve()
    }

    // IPC must receive the actual running version even if the user's selection changes later.
    const snapshot = Object.freeze(JSON.parse(JSON.stringify(version)) as SoftInstalled)
    this.opening = true
    this.progressText = this.dependencies.translate('dashboardsOpening')
    const operation = this.performOpen(snapshot).catch((error) => {
      this.report(
        error instanceof Error ? error.message : this.dependencies.translate('dashboardsOpenFailed')
      )
    })
    this.operation = operation.finally(() => {
      this.opening = false
      this.progressText = ''
      this.operation = undefined
    })
    return this.operation
  }

  private async performOpen(version: Readonly<SoftInstalled>): Promise<void> {
    const prepared = await this.request('prepareDashboards', version)
    if (prepared?.code !== 0) {
      this.report(prepared?.msg || this.dependencies.translate('dashboardsOpenFailed'))
      return
    }
    if (prepared?.data?.prepared !== true) {
      this.report(this.dependencies.translate('dashboardsOpenFailed'))
      return
    }
    const generation = prepared?.data?.generation
    if (typeof generation !== 'string') {
      this.report(this.dependencies.translate('dashboardsOpenFailed'))
      return
    }

    const response = await this.request('openDashboards', version, generation)
    if (response?.code !== 0) {
      this.report(response?.msg || this.dependencies.translate('dashboardsOpenFailed'))
      return
    }

    const url = response?.data?.url
    if (typeof url !== 'string' || !this.isLoopbackUrl(url)) {
      this.report(this.dependencies.translate('dashboardsOpenFailed'))
      return
    }
    try {
      await this.dependencies.shell.openExternal(url)
    } catch {
      // Browser launch is supplementary; a failure must not replay the completed fork request.
      this.report(this.dependencies.translate('dashboardsBrowserOpenFailed'))
    }
  }

  private request(
    action: 'prepareDashboards' | 'openDashboards',
    version: Readonly<SoftInstalled>,
    generation?: string
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      let request: IPCRequest
      try {
        request = this.dependencies.ipc.send(
          'app-fork:opensearch',
          action,
          JSON.parse(JSON.stringify(version)),
          ...(action === 'openDashboards' ? [generation] : [])
        )
      } catch (error) {
        reject(error)
        return
      }

      let settled = false
      const timers: {
        inactivity?: ReturnType<typeof setTimeout>
        maximum?: ReturnType<typeof setTimeout>
      } = {}
      const cleanup = (callbackKey?: string) => {
        if (timers.inactivity) clearTimeout(timers.inactivity)
        if (timers.maximum) clearTimeout(timers.maximum)
        this.dependencies.ipc.off(request.key)
        if (callbackKey && callbackKey !== request.key) this.dependencies.ipc.off(callbackKey)
      }
      const failTimeout = () => {
        if (settled) return
        settled = true
        cleanup()
        reject(new Error(this.dependencies.translate('dashboardsReadyTimeout')))
      }
      const armInactivityTimer = () => {
        if (timers.inactivity) clearTimeout(timers.inactivity)
        timers.inactivity = setTimeout(failTimeout, this.dependencies.inactivityTimeoutMs)
      }
      const maximumTimeoutMs =
        action === 'prepareDashboards'
          ? this.dependencies.prepareMaxTimeoutMs
          : this.dependencies.maxTimeoutMs
      timers.maximum = setTimeout(failTimeout, maximumTimeoutMs)
      armInactivityTimer()

      try {
        request.then((key, response) => {
          if (settled) return
          if (response?.code === 200) {
            armInactivityTimer()
            this.updateProgress(response)
            return
          }
          settled = true
          cleanup(key)
          if (response?.code === 0 || response?.code === 1) resolve(response)
          else
            reject(new Error(response?.msg || this.dependencies.translate('dashboardsOpenFailed')))
        })
      } catch (error) {
        if (settled) return
        settled = true
        cleanup()
        reject(error)
      }
    })
  }

  private updateProgress(response: any) {
    const status = `${
      response?.msg?.['APP-On-Progress']?.stage ?? response?.data?.status ?? response?.status ?? ''
    }`.toLowerCase()
    if (status.includes('install')) {
      this.progressText = this.dependencies.translate('dashboardsInstalling')
    } else if (status.includes('start')) {
      this.progressText = this.dependencies.translate('dashboardsStarting')
    } else {
      this.progressText = this.dependencies.translate('dashboardsOpening')
    }
  }

  private isLoopbackUrl(value: string): boolean {
    try {
      const url = new URL(value)
      return (
        url.protocol === 'http:' &&
        (url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]')
      )
    } catch {
      return false
    }
  }

  private report(message: string) {
    try {
      this.dependencies.notifyError(message)
    } catch {
      // Reporting an optional UI notice must not create an unhandled operation rejection.
    }
  }
}

export default reactiveBind(new OpenSearchDashboardsPanel())
