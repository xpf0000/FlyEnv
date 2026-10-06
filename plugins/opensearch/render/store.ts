import type { SoftInstalled } from '@/store/brew'
import { reactiveBind } from '@/util/Index'
import { StorageGetAsync, StorageSetAsync } from '@/util/Storage'
import IPC from '@/util/IPC'
import { I18nT } from '@lang/index'
import { OpenSearchT } from './lang'

const storageKey = 'flyenv-opensearch-dev-mode'

export const normalizeOpenSearchPath = (path: string | undefined | null) => {
  const value = `${path ?? ''}`.trim().replaceAll('\\', '/')
  return value.replace(/\/+/g, '/').replace(/\/$/, '')
}

export class OpenSearchDevModeStore {
  devModeByPath: Record<string, boolean> = {}
  applyingByPath: Record<string, boolean> = {}
  inited = false
  private initPromise?: Promise<void>

  async init() {
    if (this.inited) return
    if (!this.initPromise) {
      this.initPromise = StorageGetAsync<Record<string, boolean>>(storageKey)
        .then((saved) => {
          if (!saved || typeof saved !== 'object') return
          Object.entries(saved).forEach(([path, enabled]) => {
            const key = normalizeOpenSearchPath(path)
            if (key) this.devModeByPath[key] = !!enabled
          })
        })
        .catch(() => undefined)
        .finally(() => {
          this.inited = true
        })
    }
    await this.initPromise
  }

  devMode(path: string | undefined | null): boolean {
    return !!this.devModeByPath[normalizeOpenSearchPath(path)]
  }

  applying(path: string | undefined | null): boolean {
    return !!this.applyingByPath[normalizeOpenSearchPath(path)]
  }

  private invoke(...args: any[]) {
    return new Promise<any>((resolve, reject) => {
      IPC.send('app-fork:opensearch', ...args).then((key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          resolve(res?.data)
        } else {
          reject(new Error(res?.msg ?? I18nT('base.fail')))
        }
      })
    })
  }

  async fetchDevModeState(version: SoftInstalled): Promise<boolean> {
    const key = normalizeOpenSearchPath(version?.path)
    if (!key) return false
    const enabled = !!(await this.invoke('fetchDevModeState', JSON.parse(JSON.stringify(version))))
    if (this.devModeByPath[key] !== enabled) {
      this.devModeByPath[key] = enabled
      await this.persist()
    }
    return enabled
  }

  async applyDevMode(version: SoftInstalled, enable: boolean): Promise<void> {
    const key = normalizeOpenSearchPath(version?.path)
    if (!key) {
      throw new Error(OpenSearchT('devModeNoVersion'))
    }
    if (this.applyingByPath[key]) return
    this.applyingByPath[key] = true
    try {
      await this.invoke('applyDevMode', JSON.parse(JSON.stringify(version)), enable)
      this.devModeByPath[key] = enable
      await this.persist()
    } finally {
      this.applyingByPath[key] = false
    }
  }

  async persist() {
    await StorageSetAsync(storageKey, JSON.parse(JSON.stringify(this.devModeByPath)))
  }
}

export const OpenSearchManager = reactiveBind(new OpenSearchDevModeStore())
