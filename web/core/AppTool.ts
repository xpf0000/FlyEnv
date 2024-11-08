import type { AppToolModuleItem } from '@web/core/type'

const modules = import.meta.glob('@web/components/Tools/*/Module.ts', { eager: true })
console.log('modules: ', modules)
const AppToolModules: AppToolModuleItem[] = []
for (const k in modules) {
  const m: any = modules[k]
  AppToolModules.push(m.default)
}
AppToolModules.sort((a, b) => {
  return a.index! - b.index!
})
export { AppToolModules }
