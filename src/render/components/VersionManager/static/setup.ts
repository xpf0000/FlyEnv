import { computed, onMounted, onUnmounted, reactive } from 'vue'
import { BrewStore } from '@/store/brew'
import type { AllAppModule } from '@/core/type'
import type { ModuleStaticItem } from '@/core/Module/ModuleStaticItem'

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

  const fetchCommand = (row: ModuleStaticItem) => {
    return row.fetchCommand()
  }

  const copyCommand = (row: ModuleStaticItem) => {
    row.copyCommand()
  }

  const handleVersion = (row: ModuleStaticItem) => {
    row
      .runCommand()
      .then(() => {
        regetInstalled()
      })
      .catch()
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
