import { computed, onMounted, onUnmounted, reactive } from 'vue'
import { BrewStore } from '@web/store/brew'
import type { AllAppModule } from '@web/core/type'
import { MessageSuccess } from '@/util/Element'
import { I18nT } from '@shared/lang'
import { staticVersionDel, waitTime } from '@web/fn'

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
    waitTime().then(() => {
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
      fetchData()
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

  const fetchCommand = (row: any) => {
    return row.url
  }

  const copyCommand = () => {
    MessageSuccess(I18nT('base.copySuccess'))
  }

  const handleVersion = async (row: any) => {
    if (!row.installed) {
      if (row.downing) {
        return
      }
      row.downing = true
      row.type = typeFlag

      let p = 0
      const run = () => {
        p += 1
        row.progress = p
        if (p === 100) {
          row.downState = 'success'
          row.installed = true
          row.downing = false
          return
        }
        requestAnimationFrame(run)
      }
      requestAnimationFrame(run)
    } else {
      staticVersionDel()
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
