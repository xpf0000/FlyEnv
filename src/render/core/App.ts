import type { AppModuleItem } from '@/core/type'
import { loadRendererPluginModules } from '@/core/Plugin'

const modules = import.meta.glob('@/components/*/Module.ts', { eager: true })
console.log('modules: ', modules)
const AppModules: AppModuleItem[] = []
for (const k in modules) {
  const m: any = modules[k]
  AppModules.push(m.default)
}

const pluginModules = await loadRendererPluginModules()
for (const item of pluginModules) {
  if (!item?.typeFlag) continue
  if (AppModules.some((module) => module.typeFlag === item.typeFlag)) {
    console.warn('[Plugin] built-in module already owns typeFlag:', item.typeFlag)
    continue
  }
  AppModules.push(item)
}

console.log('arr: ', AppModules)
AppModules.sort((a, b) => {
  return a.asideIndex! - b.asideIndex!
})

export { AppModules }
