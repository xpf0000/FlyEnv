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

function addStyle(id: string, css?: string) {
  if (!css || document.querySelector(`style[data-flyenv-plugin="${id}"]`)) return
  const style = document.createElement('style')
  style.dataset.flyenvPlugin = id
  style.textContent = css
  document.head.appendChild(style)
}

async function importPlugin(payload: RendererPluginPayload) {
  addStyle(payload.id, payload.css)
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
  return new Promise((resolve) => {
    let settled = false
    const finish = (value: AppModuleItem[]) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    const timer = window.setTimeout(() => finish([]), timeout)

    IPC.send('application:plugins').then(async (_key: string, response: any) => {
      window.clearTimeout(timer)
      if (response?.code !== 0 || !Array.isArray(response?.data)) {
        finish([])
        return
      }
      const modules: AppModuleItem[] = []
      for (const payload of response.data as RendererPluginPayload[]) {
        try {
          modules.push(await importPlugin(payload))
        } catch (error) {
          console.error('[Plugin] failed to load renderer plugin', payload.id, error)
        }
      }
      finish(modules)
    })
  })
}
