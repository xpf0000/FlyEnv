import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { AppStore } from '@/store/app'
import { BrewStore, OnlineVersionItem } from '@/store/brew'
import XTerm from '@/util/XTerm'
import IPC from '@/util/IPC'
import type { AllAppModule } from '@/core/type'
import installedVersions from '@/util/InstalledVersions'
import { brewInfo } from '@/util/Brew'
import { chmod } from '@shared/file'
import { MessageSuccess } from '@/util/Element'
import { I18nT } from '@shared/lang'

const { clipboard } = require('@electron/remote')
const { join, basename, dirname } = require('path')
const { existsSync, unlinkSync, copyFileSync } = require('fs')

export type OllamaModelItem = {
  name: string
  size: string
}

export const OllamaModelsSetup = reactive<{
  installEnd: boolean
  installing: boolean
  fetching: boolean
  xterm: XTerm | undefined
  reFetch: () => void
  list: Record<string, OllamaModelItem[]>
}>({
  installEnd: false,
  installing: false,
  fetching: false,
  xterm: undefined,
  reFetch: () => 0,
  list: {}
})

export const Setup = () => {
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

  const fetching = computed(() => {
    return OllamaModelsSetup.fetching ?? false
  })

  const fetchData = () => {
    if (fetching.value || Object.keys(OllamaModelsSetup.list).length > 0) {
      return
    }
    OllamaModelsSetup.fetching = true

    let saved: any = localStorage.getItem(`fetchVerion-ollama-models`)
    if (saved) {
      saved = JSON.parse(saved)
      const time = Math.round(new Date().getTime() / 1000)
      if (time < saved.expire) {
        OllamaModelsSetup.list = reactive(saved.data)
        OllamaModelsSetup.fetching = false
        return
      }
    }

    IPC.send('app-fork:ollama', 'fetchAllModels').then((key: string, res: any) => {
      IPC.off(key)
      const list = res?.data ?? {}
      OllamaModelsSetup.list = reactive(list)
      if (Object.keys(list).length > 0) {
        localStorage.setItem(
          `fetchVerion-ollama-models`,
          JSON.stringify({
            expire: Math.round(new Date().getTime() / 1000) + 60 * 60,
            data: list
          })
        )
      }
      OllamaModelsSetup.fetching = false
    })
  }

  const reGetData = () => {
    fetchData()
  }

  OllamaModelsSetup.reFetch = reGetData

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
    if (OllamaModelsSetup.installing) {
      return
    }
    OllamaModelsSetup.installing = true
    OllamaModelsSetup.installEnd = false
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
    OllamaModelsSetup.xterm = execXTerm
    await execXTerm.mount(xtermDom.value!)
    await execXTerm.send(params)
    OllamaModelsSetup.installEnd = true
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
    if (OllamaModelsSetup.installing) {
      return
    }
    OllamaModelsSetup.installEnd = false
    OllamaModelsSetup.installing = true
    await nextTick()
    const file =
      appStore.config.setup.lang === 'zh'
        ? join(global.Server.Static!, 'sh/brew-install.sh')
        : join(global.Server.Static!, 'sh/brew-install-en.sh')
    const copyFile = join(global.Server.Cache!, basename(file))
    copyFileSync(file, copyFile)
    const execXTerm = new XTerm()
    OllamaModelsSetup.xterm = execXTerm
    console.log('xtermDom.value: ', xtermDom.value)
    await execXTerm.mount(xtermDom.value!)
    const command: string[] = [`cd "${dirname(copyFile)}"`, `./${basename(file)}`]
    await execXTerm.send(command)
    OllamaModelsSetup.installEnd = true
  }

  getData()

  watch(checkBrew, (v, ov) => {
    if (!ov && v) {
      getData()
    }
  })

  onMounted(() => {
    if (OllamaModelsSetup.installing) {
      nextTick().then(() => {
        const execXTerm: XTerm = OllamaModelsSetup.xterm as any
        if (execXTerm && xtermDom.value) {
          execXTerm.mount(xtermDom.value).then().catch()
        }
      })
    }
  })

  onUnmounted(() => {
    OllamaModelsSetup.xterm && OllamaModelsSetup.xterm.unmounted()
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
    copyCommand
  }
}
