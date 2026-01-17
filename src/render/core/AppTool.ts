import type { AppToolModuleItem } from '@/core/type'

const modules = import.meta.glob('@/components/Tools/*/Module.ts', { eager: true })
console.log('modules: ', modules)
const AppToolModules: AppToolModuleItem[] = []
for (const k in modules) {
  const m: any = modules[k]
  const module: AppToolModuleItem = m.default as AppToolModuleItem
  AppToolModules.push(module)
}
AppToolModules.sort((a, b) => {
  return a.index! - b.index!
})
export { AppToolModules }
