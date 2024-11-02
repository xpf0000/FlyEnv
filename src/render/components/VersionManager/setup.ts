import { computed } from 'vue'
import { BrewStore } from '@/store/brew'
import IPC from '@/util/IPC'
import { staticVersionDel } from '@/util/Version'
import type { AllAppModule } from '@/core/type'
import installedVersions from '@/util/InstalledVersions'
import { fetchVerion } from '@/util/Brew'
import { VersionManagerStore } from '@/components/VersionManager/store'

const { shell } = require('@electron/remote')

export const Setup = (typeFlag: AllAppModule) => {
  const brewStore = BrewStore()

  const currentModule = computed(() => {
    return brewStore.module(typeFlag)
  })

  const fetching = computed(() => {
    return VersionManagerStore.fetching[typeFlag] ?? false
  })

  const fetchData = () => {
    if (fetching?.value) {
      return
    }
    VersionManagerStore.fetching[typeFlag] = true
    fetchVerion(typeFlag)
      .then()
      .catch()
      .finally(() => {
        VersionManagerStore.fetching[typeFlag] = false
      })
  }
  const getData = () => {
    if (fetching?.value) {
      return
    }
    const list = brewStore.module(typeFlag).list
    if (list && Object.keys(list).length === 0) {
      fetchData()
    }
  }

  const reGetData = () => {
    brewStore.module(typeFlag).list.splice(0)
    getData()
  }

  const regetInstalled = () => {
    reGetData()
    brewStore.showInstallLog = false
    brewStore.brewRunning = false
    brewStore.module(typeFlag).installedInited = false
    installedVersions.allInstalledVersions([typeFlag]).then()
  }

  const handleOnlineVersion = (row: any, installed: boolean) => {
    console.log('row: ', row, installed)
    if (!installed) {
      if (row.downing) {
        return
      }
      row.downing = true
      row.type = typeFlag
      IPC.send(`app-fork:${typeFlag}`, 'installSoft', JSON.parse(JSON.stringify(row))).then(
        (key: string, res: any) => {
          console.log('res: ', res)
          const all = brewStore.module(typeFlag).list
          const find = all.find((r) => r.bin === row.bin && r.zip === row.zip)
          if (res?.code === 200) {
            find && Object.assign(find, res.msg)
          } else if (res?.code === 0) {
            IPC.off(key)
            if (res?.data) {
              regetInstalled()
            }
            find && (find.downing = false)
          }
        }
      )
    } else {
      staticVersionDel(row.appDir)
    }
  }

  const tableData = computed(() => {
    const arr = []
    const list = brewStore.module(typeFlag).list ?? []
    for (const item of list) {
      const nums = item.version.split('.').map((n: string, i: number) => {
        if (i > 0) {
          const num = parseInt(n)
          if (isNaN(num)) {
            return '00'
          }
          if (num < 10) {
            return `0${num}`
          }
          return num
        }
        return n
      })
      const num = parseInt(nums.join(''))
      const nt = Object.assign({}, item, {
        num
      })
      arr.push(nt)
    }
    arr.sort((a: any, b: any) => {
      return b.num - a.num
    })
    return arr
  })

  const openURL = (url: string) => {
    shell.openExternal(url).then().catch()
  }

  getData()

  return {
    handleOnlineVersion,
    tableData,
    currentModule,
    reGetData,
    fetching,
    openURL
  }
}
