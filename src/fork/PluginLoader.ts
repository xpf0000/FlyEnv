import { pathToFileURL } from 'node:url'

type ForkPluginInfo = {
  id: string
  version: string
  module: string
  entry: string
}

export class PluginLoader {
  private cache = new Map<string, Promise<any>>()

  load(module: string): Promise<any | undefined> {
    const plugins = ((global.Server as any)?.Plugins ?? {}) as Record<string, ForkPluginInfo>
    const info = plugins[module]
    if (!info?.entry) return Promise.resolve(undefined)

    const cached = this.cache.get(module)
    if (cached) return cached

    const loading = import(pathToFileURL(info.entry).href)
      .then((loaded) => loaded.default ?? loaded)
      .catch((error) => {
        this.cache.delete(module)
        throw error
      })
    this.cache.set(module, loading)
    return loading
  }

  clear(module?: string) {
    if (module) this.cache.delete(module)
    else this.cache.clear()
  }
}

export default PluginLoader
