import { computed } from 'vue'
import { BrewStore, SoftInstalled } from '@/store/brew'
import IPC from '@/util/IPC'
import { staticVersionDel } from '@/util/Version'
import type { AllAppModule } from '@/core/type'
import installedVersions from '@/util/InstalledVersions'
import { fetchVerion } from '@/util/Brew'
import { VersionManagerStore } from '@/components/VersionManager/store'
import { ServiceActionStore } from '@/components/ServiceManager/EXT/store'
import { AsyncComponentShow } from '@/util/AsyncComponent'

const { shell } = require('@electron/remote')
const { dirname } = require('path')

export const SetupAll = (typeFlag: AllAppModule) => {
  const brewStore = BrewStore()

  const currentModule = computed(() => {
    return brewStore.module(typeFlag)
  })

  const handleOnlineVersion = (row: any) => {
    console.log('row: ', row)
    if (!row.installed) {
      if (row.downing) {
        return
      }
      row.downing = true
      row.type = typeFlag
      IPC.send(`app-fork:${typeFlag}`, 'installSoft', JSON.parse(JSON.stringify(row))).then(
        (key: string, res: any) => {
          const all = brewStore.module(typeFlag).list
          const find = all.find((r) => r.bin === row.bin && r.zip === row.zip)
          console.log('res: ', res)
          if (res?.code === 200) {
            find && Object.assign(find, res.msg)
          } else if (res?.code === 0) {
            IPC.off(key)
            if (res?.data) {
              fetchInstalled().then()
              fetchOnline().then()
            }
            find && (find.downing = false)
          }
        }
      )
    } else {
      staticVersionDel(row.appDir)
    }
  }

  const tableTab = computed({
    get() {
      return VersionManagerStore.uniServicePanelTab?.[typeFlag] ?? 'local'
    },
    set(v: 'local' | 'lib') {
      VersionManagerStore.uniServicePanelTab[typeFlag] = v
    }
  })

  const tableData = computed(() => {
    const localList = brewStore.module(typeFlag).installed
    if (tableTab.value === 'local') {
      return [...localList]
    }
    const onLineList = brewStore.module(typeFlag).list
    return [...onLineList]
  })

  const fetchInstalled = () => {
    const data = brewStore.module(typeFlag)
    data.installedInited = false
    return installedVersions.allInstalledVersions([typeFlag])
  }

  const fetchOnline = () => {
    return new Promise((resolve) => {
      fetchVerion(typeFlag)
        .then()
        .catch()
        .finally(() => {
          resolve(true)
        })
    })
  }

  const fetching = computed(() => {
    return VersionManagerStore?.fetching?.[typeFlag] ?? false
  })

  const fetchDataAll = () => {
    if (VersionManagerStore?.fetching?.[typeFlag]) {
      return
    }
    VersionManagerStore.fetching[typeFlag] = true
    const all: any = [fetchInstalled(), fetchOnline()]
    Promise.all(all).then(() => {
      VersionManagerStore.fetching[typeFlag] = false
    })
  }

  const getData = () => {
    const list = tableData?.value ?? []
    if (Object.keys(list).length === 0) {
      fetchDataAll()
    }
  }

  const reGetData = () => {
    if (fetching?.value) {
      return
    }
    brewStore.module(typeFlag).list.splice(0)
    brewStore.module(typeFlag).installed.splice(0)
    getData()
  }

  const openURL = (url: string) => {
    shell.openExternal(url)
  }

  const checkEnvPath = (item: SoftInstalled) => {
    if (!item.bin) {
      return false
    }
    return ServiceActionStore.allPath.includes(dirname(item.bin))
  }

  const openDir = (dir: string) => {
    shell.openPath(dir)
  }

  const handleEdit = (row: any) => {
    handleOnlineVersion(row)
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
        VersionManagerStore.fetching[typeFlag] = true
        fetchInstalled().then(() => {
          VersionManagerStore.fetching[typeFlag] = false
        })
      }
    })
  }

  getData()

  return {
    handleOnlineVersion,
    tableData,
    currentModule,
    reGetData,
    openURL,
    fetching,
    checkEnvPath,
    openDir,
    handleEdit,
    showCustomDir,
    tableTab
  }
}
