import * as Vue from 'vue'
import * as Pinia from 'pinia'
import * as VueRouter from 'vue-router'
import IPC from '@/util/IPC'
import type { AppModuleItem } from '@/core/type'

;(globalThis as any).__FLYENV_PLUGIN_HOST__ = {
  vue: Vue,
  pinia: Pinia,
  'vue-router': VueRouter
}

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
    return (loaded.default ?? loaded) as AppModuleItem
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
