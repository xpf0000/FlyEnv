import { markRaw, reactive } from 'vue'
import type { AppModuleItem } from '@/core/type'
import { loadRendererPluginModules } from '@/core/Plugin'
import router, { registerPluginRoutes, unregisterPluginRoute } from '@/router'
import { BrewStore } from '@/store/brew'

const modules = import.meta.glob('@/components/*/Module.ts', { eager: true })
console.log('modules: ', modules)

// Reactive so the aside menu and other computed consumers update when plugins
// are installed/enabled/removed without a restart. Items are markRaw: they carry
// async component definitions that must not be wrapped in reactive proxies.
const AppModules: AppModuleItem[] = reactive([])
for (const key in modules) {
  const module: any = modules[key]
  AppModules.push(markRaw(module.default))
}

const sortModules = () => {
  AppModules.sort((a, b) => {
    return a.asideIndex! - b.asideIndex!
  })
}
sortModules()

let pluginModulesLoaded = false
let syncInFlight: Promise<void> | undefined
let syncRequested = 0
let syncCompleted = 0

function removePluginModule(typeFlag: string) {
  const index = AppModules.findIndex((m) => m.typeFlag === typeFlag && m.plugin)
  if (index < 0) return
  AppModules.splice(index, 1)
  unregisterPluginRoute(typeFlag)
  if (router.currentRoute.value.path === `/${typeFlag}`) {
    router.push('/').catch()
  }
  try {
    const brewStore = BrewStore()
    delete (brewStore.modules as any)[typeFlag]
  } catch {}
  // The plugin's already-imported JS bundle cannot be unloaded from the JS realm;
  // its memory stays resident until the next app restart. Accepted trade-off.
}

async function doSyncRendererPluginModules() {
  const items = await loadRendererPluginModules()
  const fresh = new Map<string, AppModuleItem>()
  for (const item of items) {
    if (item?.typeFlag) fresh.set(item.typeFlag, item)
  }

  // Removed (uninstalled/disabled) or updated (same typeFlag, new version).
  for (const module of [...AppModules]) {
    if (!module.plugin) continue
    const next = fresh.get(module.typeFlag)
    if (!next || next !== module) {
      removePluginModule(module.typeFlag)
    }
  }

  // Added or re-added after an update.
  for (const item of items) {
    if (!item?.typeFlag) continue
    const existing = AppModules.find((m) => m.typeFlag === item.typeFlag)
    if (existing) {
      if (!existing.plugin) {
        console.warn('[Plugin] built-in module already owns typeFlag:', item.typeFlag)
      }
      continue
    }
    AppModules.push(markRaw(item))
    try {
      // Drop a stale non-plugin BrewStore record (created while the plugin was
      // disabled) so live computeds recreate it immediately with isPlugin=true
      // and refetch through the plugin fork channel.
      const brewStore = BrewStore()
      const record = (brewStore.modules as any)[item.typeFlag]
      if (record && !record.isPlugin) {
        delete (brewStore.modules as any)[item.typeFlag]
      }
    } catch {}
  }

  sortModules()
  registerPluginRoutes()
  console.log('arr: ', AppModules)
}

/**
 * Incrementally sync renderer plugin modules with the host's current enabled
 * plugin set. Safe to call repeatedly and concurrently; concurrent calls share
 * one in-flight sync. Used at startup (via loadAppPluginModules) and after
 * every plugin install/toggle/uninstall for hot reload without restart.
 */
export function syncRendererPluginModules(): Promise<void> {
  syncRequested += 1
  if (!syncInFlight) {
    syncInFlight = (async () => {
      while (syncCompleted < syncRequested) {
        const requested = syncRequested
        await doSyncRendererPluginModules()
        syncCompleted = requested
      }
    })().finally(() => {
      syncInFlight = undefined
    })
  }
  return syncInFlight
}

export async function loadAppPluginModules() {
  if (pluginModulesLoaded) return
  pluginModulesLoaded = true
  try {
    await syncRendererPluginModules()
  } catch (error) {
    // Plugin loading must not prevent the rest of the application from mounting.
    console.error('[Plugin] startup sync failed', error)
  }
}

export { AppModules }
