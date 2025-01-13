import { computed, onMounted, onUnmounted, reactive } from 'vue'
import { BrewStore } from '@/store/brew'
import type { AllAppModule } from '@/core/type'
import installedVersions from '@/util/InstalledVersions'
import { fetchVerion } from '@/util/Brew'
import { MessageSuccess } from '@/util/Element'
import { I18nT } from '@shared/lang'
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

  const fetchData = (src: 'static') => {
    if (fetching.value) {
      return
    }
    StaticSetup.fetching[typeFlag] = true
    const currentItem = brewStore.module(typeFlag)
    const list = currentItem.list?.[src] ?? {}
    fetchVerion(typeFlag)
      .then((res: any) => {
        for (const k in list) {
          delete list?.[k]
        }
        for (const name in res) {
          list[name] = reactive(res[name])
        }
        StaticSetup.fetching[typeFlag] = false
      })
      .catch(() => {
        StaticSetup.fetching[typeFlag] = false
      })
  }
  const getData = () => {
    if (fetching.value) {
      return
    }
    const currentItem = brewStore.module(typeFlag)
    const src = 'static'
    const list = currentItem.list?.[src]
    if (list && Object.keys(list).length === 0) {
      fetchData(src)
    }
  }

  const reGetData = () => {
    console.log('reGetData !!!')
    const list = brewStore.module(typeFlag).list?.['static']
    for (const k in list) {
      delete list[k]
    }
    getData()
  }

  StaticSetup.reFetch = reGetData

  const regetInstalled = () => {
    reGetData()
    brewStore.module(typeFlag).installedInited = false
    installedVersions.allInstalledVersions([typeFlag]).then()
  }

  const fetchCommand = (row: any) => {
    return row.url
  }

  const copyCommand = (row: any) => {
    const command = fetchCommand(row)
    clipboard.writeText(command)
    MessageSuccess(I18nT('base.copySuccess'))
  }

  const handleVersion = async (row: any) => {
    if (!row.installed) {
      if (row.downing) {
        return
      }
      row.downing = true
      row.type = typeFlag
      IPC.send(`app-fork:${typeFlag}`, 'installSoft', JSON.parse(JSON.stringify(row))).then(
        (key: string, res: any) => {
          console.log('res: ', res)
          const all = Object.values(brewStore.module(typeFlag).list.static ?? {})
          const find = all.find((r) => r.bin === row.bin && r.zip === row.zip)
          if (res?.code === 200) {
            find && Object.assign(find, res.msg)
          } else if (res?.code === 0) {
            IPC.off(key)
            if (res?.data) {
              regetInstalled()
            }
            find && (find.downing = false)
          } else {
            IPC.off(key)
          }
        }
      )
    } else {
      staticVersionDel(row.appDir)
    }
  }

  const tableData = computed(() => {
    const arr = []
    const list = brewStore.module(typeFlag).list?.['static']
    for (const name in list) {
      const value = list[name]
      const nums = value.version.split('.').map((n: string, i: number) => {
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
      Object.assign(value, {
        name,
        version: value.version,
        installed: value.installed,
        num
      })
      arr.push(value)
    }
    arr.sort((a: any, b: any) => {
      return b.num - a.num
    })
    return arr
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
