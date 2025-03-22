import { computed, onMounted, onUnmounted, reactive } from 'vue'
import { BrewStore } from '@/store/brew'
import type { AllAppModule } from '@/core/type'
import installedVersions from '@/util/InstalledVersions'
import { fetchVerion } from '@/util/Brew'
import {MessageError, MessageSuccess} from '@/util/Element'
import { I18nT } from '@lang/index'
import IPC from '@/util/IPC'
import { staticVersionDel } from '@/util/Version'

const { clipboard } = require('@electron/remote')

export const StaticSetup = reactive<{
  fetching: Partial<Record<AllAppModule, boolean>>
  reFetch: () => void
}>({
  fetching: {},
  reFetch: () => 0
})

export const Setup = (typeFlag: AllAppModule) => {
  const brewStore = BrewStore()

  const fetching = computed(() => {
    return StaticSetup.fetching?.[typeFlag] ?? false
  })

  const fetchData = () => {
    if (fetching.value) {
      return
    }
    StaticSetup.fetching[typeFlag] = true
    fetchVerion(typeFlag)
      .then((res: any) => {
        StaticSetup.fetching[typeFlag] = false
      })
      .catch(() => {
        StaticSetup.fetching[typeFlag] = false
      })
  }

  const getData = () => {
    const list = tableData?.value ?? []
    if (Object.keys(list).length === 0) {
      fetchData()
    }
  }

  const reGetData = () => {
    if (fetching?.value) {
      return
    }
    brewStore.module(typeFlag).list.splice(0)
    getData()
  }

  StaticSetup.reFetch = reGetData

  const fetchCommand = (row: any) => {
    return row.url
  }

  const copyCommand = (row: any) => {
    const command = fetchCommand(row)
    clipboard.writeText(command)
    MessageSuccess(I18nT('base.copySuccess'))
  }

  const fetchInstalled = () => {
    const data = brewStore.module(typeFlag)
    data.installedInited = false
    installedVersions.allInstalledVersions([typeFlag]).then().catch()
  }

  const handleVersion = async (row: any) => {
    if (!row.installed) {
      const findInstalling = brewStore.module(typeFlag).installing?.[row.bin]
      if (row.downing || findInstalling) {
        return
      }
      brewStore.module(typeFlag).installing[row.bin] = row
      row.downing = true
      row.type = typeFlag
      IPC.send(`app-fork:${typeFlag}`, 'installSoft', JSON.parse(JSON.stringify(row))).then(
        (key: string, res: any) => {
          const all = brewStore.module(typeFlag).list
          const find = all.find((r) => r.bin === row.bin && r.zip === row.zip)
          const findInstalling = brewStore.module(typeFlag).installing[row.bin]
          console.log('res: ', res)
          if (res?.code === 200) {
            find && Object.assign(find, res.msg)
            findInstalling && Object.assign(findInstalling, res.msg)
          } else if (res?.code === 0) {
            IPC.off(key)
            find && (find.downing = false)
            findInstalling && (findInstalling.downing = false)
            delete brewStore.module(typeFlag).installing[row.bin]
            if (res?.data === true) {
              fetchInstalled()
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
    const onLineList = brewStore.module(typeFlag).list
    return [...onLineList]
  })

  getData()

  onMounted(() => {})

  onUnmounted(() => {})

  return {
    handleVersion,
    tableData,
    reGetData,
    fetching,
    fetchCommand,
    copyCommand
  }
}
