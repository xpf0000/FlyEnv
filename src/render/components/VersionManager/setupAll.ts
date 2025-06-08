import { computed } from 'vue'
import { BrewStore } from '@/store/brew'
import type { AllAppModule } from '@/core/type'
import installedVersions from '@/util/InstalledVersions'
import { VersionManagerStore } from '@/components/VersionManager/store'
import { AsyncComponentShow } from '@/util/AsyncComponent'
import { StaticSetup } from '@/components/VersionManager/static/setup'
import { LocalSetup } from '@/components/VersionManager/local/setup'
import { shell } from '@/util/NodeFn'

export const SetupAll = (typeFlag: AllAppModule) => {
  const brewStore = BrewStore()

  const currentModule = computed(() => {
    return brewStore.module(typeFlag)
  })

  const tableTab = computed({
    get() {
      return VersionManagerStore.uniServicePanelTab?.[typeFlag] ?? 'local'
    },
    set(v: 'local' | 'lib') {
      VersionManagerStore.uniServicePanelTab[typeFlag] = v
    }
  })

  const loading = computed(() => {
    if (tableTab.value === 'lib') {
      return StaticSetup.fetching[typeFlag]
    }
    if (tableTab.value === 'local') {
      return LocalSetup.fetching[typeFlag]
    }
    return false
  })

  const reFetch = () => {
    if (tableTab.value === 'lib') {
      console.log('reFetch static !!!')
      StaticSetup.reFetch()
    }
    if (tableTab.value === 'local') {
      console.log('reFetch local !!!')
      LocalSetup.reFetch()
    }
  }

  const openURL = (url: string) => {
    shell.openExternal(url)
  }

  const openDir = (dir: string) => {
    shell.openPath(dir)
  }

  let CustomPathVM: any
  import('@/components/ServiceManager/customPath.vue').then((res) => {
    CustomPathVM = res.default
  })
  const showCustomDir = () => {
    AsyncComponentShow(CustomPathVM, {
      flag: typeFlag
    }).then((res) => {
      if (res) {
        console.log('showCustomDir chagned !!!')
        LocalSetup.fetching[typeFlag] = true
        const data = brewStore.module(typeFlag)
        data.installedInited = false
        installedVersions.allInstalledVersions([typeFlag]).finally(() => {
          LocalSetup.fetching[typeFlag] = false
        })
      }
    })
  }

  return {
    currentModule,
    openURL,
    openDir,
    showCustomDir,
    tableTab,
    loading,
    reFetch
  }
}
