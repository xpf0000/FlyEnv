import { computed, reactive } from 'vue'
import { AppStore } from '@/store/app'
import type { AllAppModule } from '@/core/type'
import { BrewStore } from '@/store/brew'

export const AppModuleTab: Record<AllAppModule, number> = reactive({}) as any

export const AppModuleSetup = (flag: AllAppModule) => {
  const appStore = AppStore()
  const brewStore = BrewStore()

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
  const all = computed(() => {
    return brewStore.module(flag).installed
  })

  const checkVersion = () => {
    if (!currentVersion.value && all.value.length === 0) {
      AppModuleTab[flag] = 1
    }
  }

  return {
    tab,
    checkVersion
  }
}
