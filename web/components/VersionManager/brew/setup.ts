import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { BrewStore } from '@web/store/brew'
import type { AllAppModule } from '@web/core/type'
import { MessageSuccess } from '@/util/Element'
import { I18nT } from '@shared/lang'
import { waitTime } from '@web/fn'

export const BrewSetup = reactive<{
  installEnd: boolean
  installing: boolean
  fetching: Partial<Record<AllAppModule, boolean>>
  xterm: any
  checkBrew: () => void
  reFetch: () => void
}>({
  installEnd: false,
  installing: false,
  fetching: {},
  xterm: undefined,
  reFetch: () => 0,
  checkBrew() {}
})

export const Setup = (typeFlag: AllAppModule) => {
  const brewStore = BrewStore()

  const checkBrew = computed(() => {
    return true
  })

  const fetching = computed(() => {
    return BrewSetup.fetching?.[typeFlag] ?? false
  })

  const fetchData = () => {
    if (fetching.value) {
      return
    }
    BrewSetup.fetching[typeFlag] = true
    waitTime().then(() => {
      BrewSetup.fetching[typeFlag] = false
    })
  }
  const getData = () => {
    if (!checkBrew.value || fetching.value) {
      console.log('getData exit: ', checkBrew.value, fetching.value)
      return
    }
    fetchData()
  }

  const reGetData = () => {
    console.log('reGetData !!!')
    getData()
  }

  BrewSetup.reFetch = reGetData

  const regetInstalled = () => {
    reGetData()
  }

  const fetchCommand = (row: any) => {
    let fn = ''
    if (row.installed) {
      fn = 'uninstall'
    } else {
      fn = 'install'
    }
    return `brew ${fn} ${row.name}`
  }

  const copyCommand = () => {
    MessageSuccess(I18nT('base.copySuccess'))
  }

  const handleBrewVersion = async () => {
    if (BrewSetup.installing) {
      return
    }
    BrewSetup.installing = true
    BrewSetup.installEnd = false
    waitTime().then(() => {
      BrewSetup.installEnd = true
      regetInstalled()
    })
  }

  const tableData = computed(() => {
    const arr = []
    const list = brewStore.module(typeFlag).list?.['brew']
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
        num,
        flag: value.flag
      })
      arr.push(value)
    }
    arr.sort((a, b) => {
      return b.num - a.num
    })
    return arr
  })

  const xtermDom = ref<HTMLElement>()

  const installBrew = async () => {
    if (BrewSetup.installing) {
      return
    }
    BrewSetup.installEnd = false
    BrewSetup.installing = true
    await nextTick()
    await waitTime()
    BrewSetup.installEnd = true
  }

  onMounted(() => {})

  onUnmounted(() => {})

  return {
    installBrew,
    handleBrewVersion,
    tableData,
    checkBrew,
    reGetData,
    fetching,
    xtermDom,
    fetchCommand,
    copyCommand
  }
}
