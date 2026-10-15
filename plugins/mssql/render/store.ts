import { reactiveBind } from '@/util/Index'
import { StorageGetAsync, StorageSetAsync } from '@/util/Storage'
import { MessageError, MessageSuccess } from '@/util/Element'
import { BrewStore } from '@/store/brew'
import IPC from '@/util/IPC'
import type { SoftInstalled } from '@/store/brew'
import { MssqlT } from './lang'
import { isStrongSaPassword } from '../fork/Mssql/version'

const storageKey = 'flyenv-mssql-settings'

export type MssqlSettings = {
  saPassword: string
  port: number
  eulaAccepted: boolean
}

export type MssqlVersionItem = {
  typeFlag?: string
  name: string
  url: string
  version: string
  mVersion?: string
  appDir: string
  zip: string
  bin: string
  downloaded: boolean
  installed: boolean
  note?: string
  downing: boolean
  progress?: number
  downState?: string
  disabled?: boolean
}

const defaultSettings = (): MssqlSettings => ({
  saPassword: '',
  port: 1433,
  eulaAccepted: false
})

const copySettings = (value: unknown): MssqlSettings => {
  const result = defaultSettings()
  if (!value || typeof value !== 'object') return result
  const item = value as Partial<MssqlSettings>
  if (typeof item.saPassword === 'string') result.saPassword = item.saPassword
  const port = Number(item.port)
  if (Number.isInteger(port) && port > 0 && port <= 65535) result.port = port
  result.eulaAccepted = item.eulaAccepted === true
  return result
}

/**
 * Owns the MSSQL plugin's renderer-side domain state and the long-running
 * version-install operation outside AppStore config (New Module Constraints:
 * no Pinia store, no `config.setup` writes). The singleton survives page
 * re-entry; persistence goes through StorageSetAsync/StorageGetAsync.
 *
 * Operation contract (install): owner = this singleton; start = user confirms
 * the EULA dialog; intermediate events = IPC code 200 progress rows mapped to
 * item.progress; terminal events = IPC code 0 (success, possibly
 * { installerLaunched } on Windows) or any other code (failure notice);
 * duplicate invocation = blocked per item by `downing`; cleanup = IPC.off at
 * every terminal event.
 */
export class MssqlPluginManager {
  settings: MssqlSettings = defaultSettings()
  onlineVersions: MssqlVersionItem[] = []
  fetching = false
  inited = false
  private initPromise?: Promise<void>
  private operations = new Map<string, Promise<boolean>>()

  constructor(private readonly requestTimeoutMs = 45 * 60 * 1000) {}

  async init() {
    if (this.inited) return
    if (!this.initPromise) {
      this.initPromise = StorageGetAsync<MssqlSettings>(storageKey)
        .then((saved) => {
          this.settings = copySettings(saved)
        })
        .catch(() => undefined)
        .finally(() => {
          this.inited = true
        })
    }
    await this.initPromise
  }

  async persist() {
    await StorageSetAsync(storageKey, JSON.parse(JSON.stringify(this.settings)))
  }

  async saveSettings(partial: { saPassword?: string; port?: number; eulaAccepted?: boolean }) {
    await this.init()
    const next = {
      ...this.settings,
      ...Object.fromEntries(Object.entries(partial).filter(([, value]) => value !== undefined))
    }
    if (next.saPassword && !isStrongSaPassword(next.saPassword)) {
      throw new Error(MssqlT('saPasswordInvalid'))
    }
    const port = Number(next.port)
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      throw new Error(MssqlT('invalidPort'))
    }
    next.port = port
    await StorageSetAsync(storageKey, next)
    this.settings = next
  }

  private request(
    action: string,
    args: unknown[] = [],
    progress?: (data: any) => void
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      let request: ReturnType<typeof IPC.send> | undefined
      let settled = false
      const finish = (error?: unknown, data?: any) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (request) IPC.off(request.key)
        if (error) reject(error)
        else resolve(data)
      }
      const timer = setTimeout(
        () =>
          finish(Object.assign(new Error(MssqlT('operationTimeout')), { outcomeUnknown: true })),
        this.requestTimeoutMs
      )
      try {
        request = IPC.send('app-fork:mssql', action, ...args)
        request.then((_key: string, res: any) => {
          if (settled) return
          try {
            if (res?.code === 200) {
              progress?.(res.msg)
              return
            }
            if (res?.code === 0) finish(undefined, res.data)
            else finish(new Error(`${res?.msg ?? MssqlT('operationFailed')}`))
          } catch (error) {
            finish(error)
          }
        })
      } catch (error) {
        finish(error)
      }
    })
  }

  private operationKey(item: { bin?: string; appDir?: string; version?: string | null }): string {
    return item.bin || item.appDir || item.version || ''
  }

  private operation(item: MssqlVersionItem, work: () => Promise<boolean>): Promise<boolean> {
    const key = this.operationKey(item)
    const previous = this.operations.get(key)
    if (previous) return previous
    item.downing = true
    // Admission precedes work, including stop preconditions and synchronous IPC errors.
    let begin!: () => void
    const admitted = new Promise<void>((resolve) => {
      begin = resolve
    })
    const pending = admitted
      .then(work)
      .catch((error) => {
        if (error?.outcomeUnknown || /result is unknown/i.test(`${error?.message ?? error}`)) {
          item.disabled = true
        }
        MessageError(`${error?.message ?? error}`)
        return false
      })
      .finally(() => {
        item.downing = false
        if (this.operations.get(key) === pending) this.operations.delete(key)
      })
    this.operations.set(key, pending)
    begin()
    return pending
  }

  async refreshInstalled() {
    const module = BrewStore().module('mssql')
    module.installedFetched = false
    await module.fetchInstalled(true)
    if (!module.installedFetched) throw new Error(MssqlT('rescanFailed'))
  }

  private async rescanAfterOperation() {
    try {
      await this.refreshInstalled()
    } catch (error: any) {
      MessageError(`${MssqlT('rescanFailed')}: ${error?.message ?? error}`)
    }
  }

  async fetchOnlineVersions(force = false) {
    if (this.fetching) return
    if (!force && this.onlineVersions.length > 0) return
    this.fetching = true
    try {
      const list: MssqlVersionItem[] = await this.request('fetchAllOnlineVersion')
      if (!Array.isArray(list)) throw new Error(MssqlT('operationFailed'))
      const keep = new Set(list.map((item) => this.operationKey(item)))
      for (const item of list) {
        const find = this.onlineVersions.find(
          (old) => old.url === item.url && old.version === item.version
        )
        if (find) {
          if (!find.downing) Object.assign(find, item, { disabled: false })
        } else {
          item.downing = false
          this.onlineVersions.push(item)
        }
      }
      this.onlineVersions = this.onlineVersions.filter(
        (item) => item.downing || keep.has(this.operationKey(item))
      )
    } catch (error: any) {
      MessageError(`${error?.message ?? error}`)
    } finally {
      this.fetching = false
    }
  }

  install(item: MssqlVersionItem): Promise<boolean> {
    const previous = this.operations.get(this.operationKey(item))
    if (previous) return previous
    if (item.installed || item.disabled) return Promise.resolve(false)
    if (!this.settings.eulaAccepted) {
      MessageError(MssqlT('eulaRequired'))
      return Promise.resolve(false)
    }
    const row = JSON.parse(
      JSON.stringify({ ...item, typeFlag: 'mssql', eulaAccepted: this.settings.eulaAccepted })
    )
    return this.operation(item, async () => {
      const result = await this.request('installSoft', [row], (msg) => {
        if (typeof msg?.progress === 'number') item.progress = msg.progress
        if (msg?.downState) item.downState = msg.downState
      })
      if (result === false) throw new Error(MssqlT('debContentInvalid'))
      item.downloaded = true
      if (result?.installerLaunched) {
        MessageSuccess(MssqlT('windowsInstallerLaunched'))
      } else {
        item.installed = true
        MessageSuccess(MssqlT('installSuccess'))
      }
      await this.rescanAfterOperation()
      return true
    })
  }

  uninstall(item: MssqlVersionItem): Promise<boolean> {
    const previous = this.operations.get(this.operationKey(item))
    if (previous) return previous
    if (!item.installed || !item.appDir || window.Server.isWindows) return Promise.resolve(false)
    const row = JSON.parse(JSON.stringify(item))
    return this.operation(item, async () => {
      const module = BrewStore().module('mssql')
      const service = module.installed.find((installed) => installed.bin === row.bin)
      if (service) {
        const result = await service.stop()
        if (result !== true) throw new Error(`${result || MssqlT('operationFailed')}`)
      }
      // The fork owns filesystem deletion and serializes it against lifecycle commands.
      const removed = await this.request('uninstallSoft', [row])
      if (removed !== true) throw new Error(MssqlT('operationFailed'))
      item.installed = false
      await this.rescanAfterOperation()
      return true
    })
  }

  /** Parameters appended to the ModuleInstalledItem startService IPC call. */
  async startParams(
    _item: SoftInstalled
  ): Promise<[{ saPassword?: string; port?: number; eulaAccepted: boolean }]> {
    await this.init()
    if (this.operations.has(this.operationKey(_item)))
      throw new Error(MssqlT('operationInProgress'))
    return [
      {
        saPassword: this.settings.saPassword || undefined,
        port: this.settings.port || 1433,
        eulaAccepted: this.settings.eulaAccepted
      }
    ]
  }

  async stopParams(_item: SoftInstalled): Promise<[]> {
    return []
  }
}

export const MssqlManager = reactiveBind(new MssqlPluginManager())
