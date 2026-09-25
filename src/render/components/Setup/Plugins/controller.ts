import IPC from '@/util/IPC'
import { reactiveBind } from '@/util/Index'
import { syncRendererPluginModules } from '@/core/AppModules'
import { AppI18n } from '@lang/index'
import { resolvePluginI18nText, type FlyEnvPluginI18nText } from '@shared/plugin/PluginManifest'

export type PluginCatalogItem = {
  id: string
  name: string
  version: string
  description?: FlyEnvPluginI18nText
  author?: string
  artifact: { url: string; sha256?: string }
  official?: boolean
  source?: string
  installed?: string | null
  enabled?: boolean
}

/**
 * Localized plugin description for the current UI language. Reads the
 * reactive vue-i18n locale, so templates re-render on language change.
 */
export function pluginDescription(item: { description?: FlyEnvPluginI18nText }): string {
  return resolvePluginI18nText(item.description, AppI18n().global.locale) ?? ''
}

export type PluginSource = { url: string; official: boolean }

export function comparePluginVersions(left: string, right: string) {
  const parse = (value: string) => {
    const match = value.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/)
    if (!match) return [0, 0, 0, match?.[4] ?? ''] as const
    return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] ?? ''] as const
  }
  const a = parse(left)
  const b = parse(right)
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1
  }
  if (!a[3] && b[3]) return 1
  if (a[3] && !b[3]) return -1
  return a[3].localeCompare(b[3])
}

class PluginMarketControllerState {
  loading = false
  busyById: Record<string, boolean> = {}
  catalog: PluginCatalogItem[] = []
  installed: PluginCatalogItem[] = []
  sources: PluginSource[] = []
  error = ''
  restartRequired = false
  acknowledgedSources = new Set<string>()
  private readonly inFlight = new Map<string, Promise<unknown>>()
  private refreshSeq = 0

  private request<T>(command: string, ...args: unknown[]) {
    return new Promise<T>((resolve, reject) => {
      const call = IPC.send(command, ...args)
      let settled = false
      const timeout = [
        'application:plugin-install',
        'application:plugin-update',
        'application:plugin-toggle',
        'application:plugin-uninstall'
      ].includes(command)
        ? 10 * 60_000
        : 120_000
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        IPC.off(call.key)
        reject(new Error(`${command} timed out`))
      }, timeout)
      call.then((key: string, response: any) => {
        if (settled || response?.code === 200) return
        settled = true
        clearTimeout(timer)
        IPC.off(key)
        if (response?.code === 0) resolve(response.data as T)
        else reject(new Error(response?.msg ?? `${command} failed`))
      })
    })
  }

  private shared<T>(key: string, operation: () => Promise<T>) {
    const existing = this.inFlight.get(key)
    if (existing) return existing as Promise<T>
    const task = operation().finally(() => {
      if (this.inFlight.get(key) === task) this.inFlight.delete(key)
    })
    this.inFlight.set(key, task)
    return task
  }

  async refresh(options?: { fresh?: boolean }) {
    const run = async () => {
      // Generation guard: a forced refresh after a mutation can overlap an
      // earlier in-flight refresh; the stale response must not win.
      const seq = ++this.refreshSeq
      this.loading = true
      this.error = ''
      try {
        const [catalog, installed, sources] = await Promise.all([
          this.request<PluginCatalogItem[]>('application:plugin-market-list'),
          this.request<PluginCatalogItem[]>('application:plugin-installed'),
          this.request<PluginSource[]>('application:plugin-sources')
        ])
        if (seq !== this.refreshSeq) return this.catalog
        this.catalog = catalog ?? []
        this.installed = installed ?? []
        this.sources = sources ?? []
        return this.catalog
      } catch (error) {
        if (seq === this.refreshSeq) {
          this.error = error instanceof Error ? error.message : String(error)
        }
        throw error
      } finally {
        if (seq === this.refreshSeq) this.loading = false
      }
    }
    if (options?.fresh) {
      const task = run().finally(() => {
        if (this.inFlight.get('refresh') === task) this.inFlight.delete('refresh')
      })
      this.inFlight.set('refresh', task)
      return task
    }
    return this.shared('refresh', run)
  }

  actionFor(item: PluginCatalogItem) {
    if (!item.installed) return 'install' as const
    return comparePluginVersions(item.version, item.installed) > 0 ? 'update' : 'reinstall'
  }

  isThirdParty(item: PluginCatalogItem) {
    return item.official !== true
  }

  async acknowledgeThirdParty(source?: string) {
    if (source) this.acknowledgedSources.add(source)
  }

  async install(item: PluginCatalogItem, acknowledged = false) {
    if (
      this.isThirdParty(item) &&
      !acknowledged &&
      !this.acknowledgedSources.has(item.source ?? '')
    ) {
      throw new Error('Third-party plugin acknowledgement is required')
    }
    if (item.source) await this.acknowledgeThirdParty(item.source)
    return this.mutate(item.id, async () => {
      const result = await this.request('application:plugin-install', {
        id: item.id,
        version: item.version,
        url: item.artifact.url,
        sha256: item.artifact.sha256,
        source: item.official ? 'official' : item.source
      })
      await this.refresh({ fresh: true })
      await this.applyHotReload()
      return result
    })
  }

  update(item: PluginCatalogItem) {
    return this.install(item, true)
  }

  async toggle(item: PluginCatalogItem, enabled: boolean) {
    return this.mutate(item.id, async () => {
      const result = await this.request('application:plugin-toggle', item.id, enabled)
      await this.refresh({ fresh: true })
      await this.applyHotReload()
      return result
    })
  }

  async uninstall(item: PluginCatalogItem) {
    return this.mutate(item.id, async () => {
      const result = await this.request('application:plugin-uninstall', item.id)
      await this.refresh({ fresh: true })
      await this.applyHotReload()
      return result
    })
  }

  addSource(url: string) {
    return this.shared(`source:add:${url}`, async () => {
      const result = await this.request<PluginSource[]>('application:plugin-source-add', url)
      this.sources = result ?? []
      await this.refresh({ fresh: true })
      return result
    })
  }

  private async applyHotReload() {
    try {
      // The main/fork sides already applied the change (IPC code 0). Hot-syncing
      // the renderer is best-effort: failure never rolls back the change, it only
      // falls back to the restart prompt.
      await syncRendererPluginModules()
      this.restartRequired = false
    } catch (error) {
      console.error('[Plugin] hot reload failed, restart required', error)
      this.restartRequired = true
    }
  }

  removeSource(url: string) {
    return this.shared(`source:remove:${url}`, async () => {
      const result = await this.request<PluginSource[]>('application:plugin-source-remove', url)
      this.sources = result ?? []
      await this.refresh({ fresh: true })
      return result
    })
  }

  private mutate<T>(id: string, operation: () => Promise<T>) {
    return this.shared(`plugin:${id}`, async () => {
      this.busyById[id] = true
      try {
        return await operation()
      } finally {
        delete this.busyById[id]
      }
    })
  }
}

export const PluginMarket = reactiveBind(new PluginMarketControllerState())
export type PluginMarketController = typeof PluginMarket
