import { computed, onMounted, onUnmounted, reactive } from 'vue'
import { BrewStore } from '@/store/brew'
import type { AllAppModule } from '@/core/type'
import { MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'
import IPC from '@/util/IPC'
import { staticVersionDel } from '@/util/Version'
import { clipboard } from '@/util/NodeFn'

export const StaticSetup = reactive<{
  reFetch: () => void
}>({
  reFetch: () => 0
})

export const Setup = (typeFlag: AllAppModule) => {
  const brewStore = BrewStore()

  const fetching = computed(() => {
    const module = brewStore.module(typeFlag)
    return module.staticFetching
  })

  const fetchData = () => {
    const module = brewStore.module(typeFlag)
    if (module.staticFetching) {
      return
    }
    module.fetchStatic()
  }
  const getData = () => {
    const module = brewStore.module(typeFlag)
    if (module.staticFetching) {
      return
    }
    if (module.static.length === 0) {
      fetchData()
    }
  }

  const reGetData = () => {
    console.log('reGetData !!!')
    brewStore.module(typeFlag).static.splice(0)
    getData()
  }

  StaticSetup.reFetch = reGetData

  const regetInstalled = () => {
    reGetData()
    const module = brewStore.module(typeFlag)
    module.installedFetched = false
    module.fetchInstalled().catch()
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
      const all = brewStore.module(typeFlag).static
      const find: any = all.find((r: any) => r.bin === row.bin && r.zip === row.zip)!
      row.downing = true
      row.type = typeFlag
      find.downing = true
      find.type = typeFlag
      IPC.send(`app-fork:${typeFlag}`, 'installSoft', JSON.parse(JSON.stringify(row))).then(
        (key: string, res: any) => {
          console.log('res: ', res)
          if (res?.code === 200) {
            if (find) {
              Object.assign(find, res.msg)
            }
          } else if (res?.code === 0) {
            IPC.off(key)
            row.downing = false
            row.progress = 0
            if (find) {
              find.downing = false
              find.progress = 0
            }
            if (res?.data) {
              regetInstalled()
            }
          } else {
            row.downing = false
            row.progress = 0
            if (find) {
              find.downing = false
              find.progress = 0
            }
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
    const list = brewStore.module(typeFlag).static
    for (const value of list) {
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
