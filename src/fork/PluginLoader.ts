import { statSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

import type { ForkPluginSnapshot } from '@shared/plugin/PluginRuntime'

type CachedModule = {
  key: string
  promise: Promise<any>
}

export class PluginLoader {
  private cache = new Map<string, CachedModule>()

  load(module: string, dedicated = false): Promise<any | undefined> {
    const plugins = ((global.Server as any)?.Plugins ?? {}) as ForkPluginSnapshot
    const info = plugins[module]
    if (!info?.entry) return Promise.resolve(undefined)
    if (!!info.runtime !== dedicated) return Promise.reject(new Error('plugin_runtime_mismatch'))

    // Node caches dynamic import() by URL, so a same-URL reload would return the
    // stale module after an update/reinstall. Bust the cache with the entry's
    // version + mtime: stable while the code is unchanged, different as soon as
    // the plugin is updated or reinstalled.
    let stamp = info.version ?? ''
    try {
      stamp += `:${statSync(info.entry).mtimeMs}`
    } catch {}
    const key = `${info.entry}@${stamp}`

    const cached = this.cache.get(module)
    if (cached?.key === key) return cached.promise

    const url = `${pathToFileURL(info.entry).href}?t=${encodeURIComponent(stamp)}`
    const loading = import(url)
      .then((loaded) => loaded.default ?? loaded)
      .catch((error) => {
        this.cache.delete(module)
        throw error
      })
    this.cache.set(module, { key, promise: loading })
    return loading
  }

  clear(module?: string) {
    if (module) this.cache.delete(module)
    else this.cache.clear()
  }
}

export default PluginLoader
