import { computed } from 'vue'
import { BrewStore } from '@/store/brew'
import IPC from '@/util/IPC'
import { staticVersionDel } from '@/util/Version'
import type { AllAppModule } from '@/core/type'
import installedVersions from '@/util/InstalledVersions'
import { fetchVerion } from '@/util/Brew'
import { VersionManagerStore } from '@/components/VersionManager/store'
import { MessageError } from '@/util/Element'
import { I18nT } from '@lang/index'
import { shell } from '@/util/NodeFn'

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
      const findInstalling = brewStore.module(typeFlag).installing?.[row.bin]
      if (row.downing || findInstalling) {
        return
      }
      brewStore.module(typeFlag).installing[row.bin] = row
      row.downing = true
      row.type = typeFlag
      const all = brewStore.module(typeFlag).list
      const find: any = all.find((r) => r.bin === row.bin && r.zip === row.zip)
      find.downing = true
      find.type = typeFlag
      IPC.send(`app-fork:${typeFlag}`, 'installSoft', JSON.parse(JSON.stringify(row))).then(
        (key: string, res: any) => {
          console.log('res: ', res)
          const findInstalling = brewStore.module(typeFlag).installing[row.bin]
          if (res?.code === 200) {
            Object.assign(find, res.msg)
            Object.assign(findInstalling, res.msg)
          } else if (res?.code === 0) {
            IPC.off(key)
            find.downing = false
            findInstalling.downing = false
            delete brewStore.module(typeFlag).installing[row.bin]
            if (res?.data === true) {
              regetInstalled()
            } else {
              MessageError(I18nT('versionmanager.installFail'))
            }
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
