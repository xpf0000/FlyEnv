import { computed, nextTick, reactive, ref } from 'vue'
import { BrewStore } from '@web/store/brew'
import type { AllAppModule } from '@web/core/type'
import { MessageSuccess } from '@/util/Element'
import { I18nT } from '@shared/lang'
import { waitTime } from '@web/fn'

export const MacPortsSetup = reactive<{
  installEnd: boolean
  installing: boolean
  fetching: Partial<Record<AllAppModule, boolean>>
  xterm: any
  checkMacPorts: () => void
  reFetch: () => void
}>({
  installEnd: false,
  installing: false,
  fetching: {},
  xterm: undefined,
  reFetch: () => 0,
  checkMacPorts() {}
})

export const Setup = (typeFlag: AllAppModule) => {
  const brewStore = BrewStore()

  const checkMacPorts = computed(() => {
    return true
  })

  const fetching = computed(() => {
    return MacPortsSetup.fetching?.[typeFlag] ?? false
  })

  const fetchData = () => {
    if (fetching.value) {
      return
    }
    MacPortsSetup.fetching[typeFlag] = true
    waitTime().then(() => {
      MacPortsSetup.fetching[typeFlag] = false
    })
  }
  const getData = () => {
    if (!checkMacPorts.value || fetching.value) {
      console.log('getData exit: ', checkMacPorts.value, fetching.value)
      return
    }
    fetchData()
  }

  const reGetData = () => {
    console.log('reGetData !!!')
    getData()
  }

  MacPortsSetup.reFetch = reGetData

  const regetInstalled = () => {
    reGetData()
    brewStore.module(typeFlag).installedInited = false
    waitTime().then(() => {
      brewStore.module(typeFlag).installedInited = true
    })
  }

  const fetchCommand = (row: any) => {
    let fn = ''
    if (row.installed) {
      fn = 'uninstall'
    } else {
      fn = 'install'
    }

    const name = row.name
    const names = [name]
    if (typeFlag === 'php') {
      names.push(`${name}-fpm`, `${name}-mysql`, `${name}-apache2handler`, `${name}-iconv`)
    } else if (typeFlag === 'mysql') {
      names.push(`${name}-server`)
    } else if (typeFlag === 'mariadb') {
      names.push(`${name}-server`)
    } else if (typeFlag === 'python') {
      names.push(`${name.replace('python', 'py')}-pip`)
    }
    const params: string[] = []
    if (['php52', 'php53', 'php54', 'php55', 'php56'].includes(name) && fn === 'install') {
      const libs = names.join(' ')
      params.push(`sudo port clean -v ${libs}`)
      names.forEach((name) => {
        params.push(`sudo port install -v ${name} configure.compiler=macports-clang-10`)
      })
    } else {
      if (fn === 'uninstall') {
        fn = 'uninstall --follow-dependents'
      }
      const nameStr = names.join(' ')
      params.push(`sudo port clean -v ${nameStr}`)
      params.push(`sudo port ${fn} -v ${nameStr}`)
    }

    return params.join('\n')
  }

  const copyCommand = () => {
    MessageSuccess(I18nT('base.copySuccess'))
  }

  const handleVersion = async () => {
    if (MacPortsSetup.installing) {
      return
    }
    MacPortsSetup.installing = true
    MacPortsSetup.installEnd = false
    await nextTick()
    await waitTime()
    MacPortsSetup.installEnd = true
    regetInstalled()
  }

  const tableData = computed(() => {
    const arr = []
    const list = brewStore.module(typeFlag).list?.['port']
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

  return {
    handleVersion,
    tableData,
    checkMacPorts,
    reGetData,
    fetching,
    xtermDom,
    fetchCommand,
    copyCommand
  }
}
