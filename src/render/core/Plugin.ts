import * as Vue from 'vue'
import * as Pinia from 'pinia'
import * as VueRouter from 'vue-router'
import * as ElementPlus from 'element-plus'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import IPC from '@/util/IPC'
import type { AppModuleItem } from '@/core/type'
import { defineAsyncComponent } from 'vue'
import { AsideSetup, AppServiceModule } from '@/core/ASide'
import { AppModuleSetup, AppModuleTab, AppCustomerModule } from '@/core/Module'
import { BrewStore } from '@/store/brew'
import { AppModules } from '@/core/AppModules'
import { VueExtend } from '@/core/VueExtend'
import {
  AppAllLang,
  BuiltInLocaleCatalog,
  FALLBACK_LOCALE,
  normalizeLocale,
  AppI18n,
  I18nT,
  applyLanguagePayload,
  getActiveLocale,
  releaseLocalePayload
} from '@lang/index'

const lazyRouter = new Proxy(
  {},
  {
    get(_target, property) {
      const router = (globalThis as any).__FLYENV_PLUGIN_ROUTER__
      if (!router) throw new Error('FlyEnv plugin router is not initialized')
      const value = router[property]
      return typeof value === 'function' ? value.bind(router) : value
    }
  }
)

const pluginHost: Record<string, any> = {
  vue: Vue,
  pinia: Pinia,
  'vue-router': VueRouter,
  'element-plus': ElementPlus,
  '@element-plus/icons-vue': ElementPlusIconsVue,
  ipc: IPC,
  router: lazyRouter,
  aside: {
    AsideSetup,
    AppServiceModule
  },
  coreModule: {
    AppModuleSetup,
    AppModuleTab,
    AppCustomerModule
  },
  lang: {
    AppAllLang,
    BuiltInLocaleCatalog,
    FALLBACK_LOCALE,
    normalizeLocale,
    AppI18n,
    I18nT,
    applyLanguagePayload,
    getActiveLocale,
    releaseLocalePayload
  },
  stores: {
    AppStore: (...args: any[]) => {
      const appStore = (globalThis as any).__FLYENV_PLUGIN_APP_STORE__
      if (!appStore) throw new Error('FlyEnv plugin AppStore is not initialized')
      return appStore(...args)
    },
    BrewStore: (...args: any[]) => BrewStore(...args)
  },
  // Shared UI components exposed lazily so plugin bundles do not duplicate the
  // component tree (monaco, xterm, etc.). Plugin code receives the host component
  // objects; both run in the same JS realm, so async components are safe.
  components: {
    ServiceManager: defineAsyncComponent(() => import('@/components/ServiceManager/index.vue')),
    VersionManager: defineAsyncComponent(() => import('@/components/VersionManager/index.vue')),
    Conf: defineAsyncComponent(() => import('@/components/Conf/index.vue')),
    ConfCommon: defineAsyncComponent(() => import('@/components/Conf/common.vue')),
    Log: defineAsyncComponent(() => import('@/components/Log/index.vue')),
    LogTool: defineAsyncComponent(() => import('@/components/Log/tool.vue'))
  },
  // Lazy getters: AppModules/VueExtend sit in a circular import chain with this
  // module (AppModules imports loadRendererPluginModules from here), so they must
  // not be captured eagerly in the object literal. The getters only run when a
  // plugin accesses the bridge at runtime, long after host initialization.
  get appModules() {
    return AppModules
  },
  get vueExtend() {
    return VueExtend
  }
}
;(globalThis as any).__FLYENV_PLUGIN_HOST__ = pluginHost

type RendererPluginPayload = {
  id: string
  version: string
  module: Record<string, any>
  code: string
  css?: string
}

type LoadedRendererPlugin = {
  version: string
  code: string
  css?: string
  item: AppModuleItem
}

const loadedPlugins = new Map<string, LoadedRendererPlugin>()

function syncStyles(payloads: RendererPluginPayload[]) {
  const active = new Set(payloads.map((payload) => payload.id))
  for (const style of document.querySelectorAll<HTMLStyleElement>('style[data-flyenv-plugin]')) {
    if (!active.has(style.dataset.flyenvPlugin ?? '')) style.remove()
  }
  for (const payload of payloads) {
    const existing = document.querySelector<HTMLStyleElement>(
      `style[data-flyenv-plugin="${payload.id}"]`
    )
    if (!payload.css) {
      existing?.remove()
      continue
    }
    const style = existing ?? document.createElement('style')
    style.dataset.flyenvPlugin = payload.id
    if (style.textContent !== payload.css) style.textContent = payload.css
    if (!existing) document.head.appendChild(style)
  }
}

async function importPlugin(payload: RendererPluginPayload) {
  const blob = new Blob([payload.code], { type: 'text/javascript' })
  const url = URL.createObjectURL(blob)
  try {
    const loaded: any = await import(/* @vite-ignore */ url)
    const item = (loaded.default ?? loaded) as AppModuleItem
    Object.assign(item as any, payload.module, {
      plugin: {
        id: payload.id,
        version: payload.version
      }
    })
    return item
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function loadRendererPluginModules(timeout = 5_000): Promise<AppModuleItem[]> {
  return new Promise((resolve, reject) => {
    let settled = false
    const call = IPC.send('application:plugins')
    const finish = (error?: Error, value?: AppModuleItem[]) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      IPC.off(call.key)
      if (error) reject(error)
      else resolve(value ?? [])
    }
    const timer = window.setTimeout(
      () => finish(new Error('Loading renderer plugins timed out')),
      timeout
    )

    call.then((_key: string, response: any) => {
      if (settled) return
      if (response?.code !== 0 || !Array.isArray(response?.data)) {
        finish(new Error(response?.msg ?? 'Loading renderer plugins failed'))
        return
      }
      void (async () => {
        const payloads = response.data as RendererPluginPayload[]
        const modules: AppModuleItem[] = []
        const next = new Map<string, LoadedRendererPlugin>()
        for (const payload of payloads) {
          const cached = loadedPlugins.get(payload.id)
          const item =
            cached?.version === payload.version &&
            cached.code === payload.code
              ? cached.item
              : await importPlugin(payload)
          modules.push(item)
          next.set(payload.id, {
            version: payload.version,
            code: payload.code,
            css: payload.css,
            item
          })
        }
        if (settled) return
        syncStyles(payloads)
        loadedPlugins.clear()
        for (const [id, cached] of next) loadedPlugins.set(id, cached)
        finish(undefined, modules)
      })().catch((error) => {
        console.error('[Plugin] failed to load renderer plugin', error)
        finish(error instanceof Error ? error : new Error(String(error)))
      })
    })
  })
}
