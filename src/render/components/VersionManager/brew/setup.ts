import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { AppStore } from '@/store/app'
import { BrewStore } from '@/store/brew'
import XTerm from '@/util/XTerm'
import IPC from '@/util/IPC'
import type { AllAppModule } from '@/core/type'
import installedVersions from '@/util/InstalledVersions'
import { brewInfo } from '@/util/Brew'
import { chmod } from '@shared/file'
import { MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'

const { clipboard } = require('@electron/remote')
const { join, basename, dirname } = require('path')
const { existsSync, unlinkSync, copyFileSync } = require('fs')

export const BrewSetup = reactive<{
  installEnd: boolean
  installing: boolean
  fetching: Partial<Record<AllAppModule, boolean>>
  xterm: XTerm | undefined
  checkBrew: () => void
  reFetch: () => void
}>({
  installEnd: false,
  installing: false,
  fetching: {},
  xterm: undefined,
  reFetch: () => 0,
  checkBrew() {
    if (!global.Server.BrewCellar) {
      IPC.send('app-check-brewport').then((key: string) => {
        IPC.off(key)
      })
    }
  }
})

export const Setup = (typeFlag: AllAppModule) => {
  const appStore = AppStore()
  const brewStore = BrewStore()

  const proxy = computed(() => {
    return appStore.config.setup.proxy
  })
  const proxyStr = computed(() => {
    if (!proxy?.value.on) {
      return undefined
    }
    return proxy?.value?.proxy
  })

  const checkBrew = computed(() => {
    if (!appStore.envIndex) {
      return false
    }
    return !!global.Server.BrewCellar
  })

  const showBrewError = computed(() => {
    if (!appStore.envIndex) {
      return false
    }
    return global?.Server?.BrewBin && global?.Server?.BrewError
  })

  const brewBin = computed(() => {
    return global?.Server?.BrewBin ?? ''
  })

  const brewError = computed(() => {
    return global?.Server?.BrewError ?? ''
  })

  const fetching = computed(() => {
    return BrewSetup.fetching?.[typeFlag] ?? false
  })

  const fetchData = (src: 'brew') => {
    if (fetching.value) {
      return
    }
    BrewSetup.fetching[typeFlag] = true
    const currentItem = brewStore.module(typeFlag)
    const list = currentItem.list?.[src] ?? {}
    brewInfo(typeFlag)
      .then((res: any) => {
        for (const k in list) {
          delete list?.[k]
        }
        for (const name in res) {
          list[name] = reactive(res[name])
        }
        BrewSetup.fetching[typeFlag] = false
      })
      .catch(() => {
        BrewSetup.fetching[typeFlag] = false
      })
  }
  const getData = () => {
    if (!checkBrew.value || fetching.value) {
      console.log('getData exit: ', checkBrew.value, fetching.value)
      return
    }
    const currentItem = brewStore.module(typeFlag)
    const src = 'brew'
    const list = currentItem.list?.[src]
    if (list && Object.keys(list).length === 0) {
      if (typeFlag === 'php') {
        if (src === 'brew' && !appStore?.config?.setup?.phpBrewInited) {
          /**
           * First, fetch the installed PHP versions, and simultaneously install the shivammathur/php repository.
           * After a successful installation, refresh the data.
           * This avoids the issue where domestic users experience very slow repository addition,
           * which prevents fetching the installed data.
           */
          IPC.send('app-fork:brew', 'addTap', 'shivammathur/php').then((key: string, res: any) => {
            IPC.off(key)
            appStore.config.setup.phpBrewInited = true
            appStore.saveConfig()
            if (res?.data === 2) {
              fetchData('brew')
            }
          })
        }
      } else if (typeFlag === 'mongodb' && !appStore?.config?.setup?.mongodbBrewInited) {
        if (src === 'brew') {
          IPC.send('app-fork:brew', 'addTap', 'mongodb/brew').then((key: string, res: any) => {
            IPC.off(key)
            appStore.config.setup.mongodbBrewInited = true
            appStore.saveConfig()
            if (res?.data === 2) {
              fetchData('brew')
            }
          })
        }
      }
      fetchData(src)
    }
  }

  const reGetData = () => {
    console.log('reGetData !!!')
    const list = brewStore.module(typeFlag).list?.['brew']
    for (const k in list) {
      delete list[k]
    }
    getData()
  }

  BrewSetup.reFetch = reGetData

  const regetInstalled = () => {
    reGetData()
    brewStore.module(typeFlag).installedInited = false
    installedVersions.allInstalledVersions([typeFlag]).then()
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

  const copyCommand = (row: any) => {
    const command = fetchCommand(row)
    clipboard.writeText(command)
    MessageSuccess(I18nT('base.copySuccess'))
  }

  const handleBrewVersion = async (row: any) => {
    if (BrewSetup.installing) {
      return
    }
    BrewSetup.installing = true
    BrewSetup.installEnd = false
    let fn = ''
    if (row.installed) {
      fn = 'uninstall'
    } else {
      fn = 'install'
    }
    const arch = global.Server.isAppleSilicon ? '-arm64' : '-x86_64'
    const name = row.name
    let params = []
    const sh = join(global.Server.Static!, 'sh/brew-cmd.sh')
    const copyfile = join(global.Server.Cache!, 'brew-cmd.sh')
    if (existsSync(copyfile)) {
      unlinkSync(copyfile)
    }
    copyFileSync(sh, copyfile)
    chmod(copyfile, '0777')
    params = [`${copyfile} ${arch} ${fn} ${name};`]
    if (proxyStr?.value) {
      params.unshift(proxyStr?.value)
    }
    await nextTick()
    const execXTerm = new XTerm()
    BrewSetup.xterm = execXTerm
    await execXTerm.mount(xtermDom.value!)
    await execXTerm.send(params)
    BrewSetup.installEnd = true
    regetInstalled()
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
    const file =
      appStore.config.setup.lang === 'zh'
        ? join(global.Server.Static!, 'sh/brew-install.sh')
        : join(global.Server.Static!, 'sh/brew-install-en.sh')
    const copyFile = join(global.Server.Cache!, basename(file))
    copyFileSync(file, copyFile)
    const execXTerm = new XTerm()
    BrewSetup.xterm = execXTerm
    console.log('xtermDom.value: ', xtermDom.value)
    await execXTerm.mount(xtermDom.value!)
    const command: string[] = [`cd "${dirname(copyFile)}"`, `./${basename(file)}`]
    await execXTerm.send(command)
    BrewSetup.installEnd = true
  }

  getData()

  watch(checkBrew, (v, ov) => {
    if (!ov && v) {
      getData()
    }
  })

  onMounted(() => {
    if (BrewSetup.installing) {
      nextTick().then(() => {
        const execXTerm: XTerm = BrewSetup.xterm as any
        if (execXTerm && xtermDom.value) {
          execXTerm.mount(xtermDom.value).then().catch()
        }
      })
    }
  })

  onUnmounted(() => {
    BrewSetup.xterm && BrewSetup.xterm.unmounted()
  })

  return {
    installBrew,
    handleBrewVersion,
    tableData,
    checkBrew,
    reGetData,
    fetching,
    xtermDom,
    fetchCommand,
    copyCommand,
    showBrewError,
    brewBin,
    brewError
  }
}
