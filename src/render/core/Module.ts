import { computed, reactive } from 'vue'
import { AppStore } from '@/store/app'
import type { AllAppModule } from '@/core/type'

export const AppModuleTab: Record<AllAppModule, number> = reactive({}) as any

export const AppModuleSetup = (flag: AllAppModule) => {
  const appStore = AppStore()

  const currentVersion = computed(() => {
    return appStore.config.server?.[flag]?.current?.version
  })
  if (!AppModuleTab[flag]) {
    AppModuleTab[flag] = 0
  }
  const tab = computed({
    get() {
      console.log('tab get: ', AppModuleTab, AppModuleTab[flag])
      return AppModuleTab[flag] ?? 0
    },
    set(v) {
      AppModuleTab[flag] = v
      console.log('tab set: ', v, AppModuleTab)
    }
  })

  const checkVersion = () => {
    if (!currentVersion.value) {
      AppModuleTab[flag] = 1
    }
  }

  return {
    tab,
    checkVersion
  }
}