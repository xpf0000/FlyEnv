import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { AppStore } from '@/store/app'
import XTerm from '@/util/XTerm'
import IPC from '@/util/IPC'
import { MessageSuccess } from '@/util/Element'
import { I18nT } from '@shared/lang'

const { clipboard } = require('@electron/remote')
const { dirname } = require('path')

export type OllamaModelItem = {
  name: string
  size?: string
  children?: OllamaModelItem[]
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

  const tableData = computed(() => {
    const dict = OllamaModelsSetup.list
    const list: OllamaModelItem[] = []
    for (const type in dict) {
      const arr = dict[type]
      list.push({
        name: type,
        children: arr
      })
    }
    return list
  })

  const fetchCommand = (row: any) => {
    let fn = ''
    if (row.installed) {
      fn = 'rm'
    } else {
      fn = 'pull'
    }
    return `cd "${dirname(row.bin)}" && ./ollama ${fn} ${row.name}`
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
    const params = [fetchCommand(row)]
    if (proxyStr?.value) {
      params.unshift(proxyStr?.value)
    }
    await nextTick()
    const execXTerm = new XTerm()
    OllamaModelsSetup.xterm = execXTerm
    await execXTerm.mount(xtermDom.value!)
    await execXTerm.send(params)
    OllamaModelsSetup.installEnd = true
  }

  const xtermDom = ref<HTMLElement>()

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
    handleBrewVersion,
    reGetData,
    fetching,
    xtermDom,
    fetchCommand,
    copyCommand,
    tableData
  }
}
