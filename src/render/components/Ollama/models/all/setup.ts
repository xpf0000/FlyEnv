import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { AppStore } from '@/store/app'
import XTerm from '@/util/XTerm'
import IPC from '@/util/IPC'
import { MessageError, MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'
import { BrewStore } from '@/store/brew'
import { OllamaLocalModelsSetup } from '@/components/Ollama/models/local/setup'
import { dirname } from '@/util/path-browserify'
import { clipboard } from '@/util/NodeFn'
import {
  getModelSizeColorForHardware,
  modelHardwareFromReport,
  type ModelHardware
} from '@/util/ModelSize'

export type OllamaModelItem = {
  isRoot?: boolean
  name: string
  size?: string
  url?: string
  children?: OllamaModelItem[]
}

export const OllamaAllModelsSetup = reactive<{
  installEnd: boolean
  installing: boolean
  fetching: boolean
  search: string
  xterm: XTerm | undefined
  reFetch: () => void
  list: Record<string, OllamaModelItem[]>
}>({
  installEnd: false,
  installing: false,
  fetching: false,
  search: '',
  xterm: undefined,
  reFetch: () => 0,
  list: {}
})

const hardware = reactive<ModelHardware>({
  ramGB: 0,
  vramGB: 0,
  loaded: false
})

export const Setup = () => {
  const appStore = AppStore()

  const brewStore = BrewStore()
  const runningService = computed(() => {
    return brewStore.module('ollama').installed.find((o) => o.run)
  })

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
    return OllamaAllModelsSetup.fetching ?? false
  })

  const parseSizeToGB = (sizeText?: string) => {
    const text = `${sizeText || ''}`.trim().toUpperCase()
    if (!text) return 0
    const m = text.match(/(\d+(?:\.\d+)?)\s*(KB|MB|GB|TB)/)
    if (!m) return 0
    const value = Number(m[1] || 0)
    const unit = m[2]
    if (unit === 'TB') return value * 1024
    if (unit === 'GB') return value
    if (unit === 'MB') return value / 1024
    if (unit === 'KB') return value / 1024 / 1024
    return 0
  }

  const fetchHardware = async () => {
    try {
      const res: any = await new Promise((resolve, reject) => {
        IPC.send('app-fork:ollama', 'pcReport').then((key: string, res: any) => {
          IPC.off(key)
          if (res?.data) resolve(res.data)
          else reject(new Error('No data'))
        })
      })

      Object.assign(hardware, modelHardwareFromReport(res))
    } catch {
      hardware.loaded = false
    }

    console.log('hardware: ', hardware)
  }

  const getModelSizeColor = (sizeText?: string): 'success' | 'warning' | 'danger' | undefined => {
    return getModelSizeColorForHardware(parseSizeToGB(sizeText), hardware)
  }

  const fetchData = () => {
    if (fetching.value || Object.keys(OllamaAllModelsSetup.list).length > 0) {
      return
    }
    OllamaAllModelsSetup.fetching = true

    let saved: any = localStorage.getItem(`fetchVerion-ollama-models`)
    if (saved) {
      saved = JSON.parse(saved)
      const time = Math.round(new Date().getTime() / 1000)
      if (time < saved.expire) {
        OllamaAllModelsSetup.list = reactive(saved.data)
        OllamaAllModelsSetup.fetching = false
        return
      }
    }

    IPC.send('app-fork:ollama', 'fetchAllModels').then((key: string, res: any) => {
      IPC.off(key)
      const list = res?.data ?? {}
      OllamaAllModelsSetup.list = reactive(list)
      if (Object.keys(list).length > 0) {
        localStorage.setItem(
          `fetchVerion-ollama-models`,
          JSON.stringify({
            expire: Math.round(new Date().getTime() / 1000) + 60 * 60,
            data: list
          })
        )
      }
      OllamaAllModelsSetup.fetching = false
    })
  }

  const reGetData = () => {
    fetchData()
  }

  OllamaAllModelsSetup.reFetch = reGetData

  const tableData = computed(() => {
    const dict = OllamaAllModelsSetup.list
    const baseList: OllamaModelItem[] = []
    for (const type in dict) {
      const children = dict[type] || []
      baseList.push({
        isRoot: true,
        name: type,
        children: children.length > 0 ? children : undefined
      })
    }
    if (!OllamaAllModelsSetup.search.trim()) {
      return baseList
    }
    const search = OllamaAllModelsSetup.search.trim().toLowerCase()
    const matchedRoots: OllamaModelItem[] = []
    for (const item of baseList) {
      const rootMatched = item.name.toLowerCase().includes(search)
      const children = item.children || []
      const matchedChildren = rootMatched
        ? children
        : children.filter((child) => `${child?.name || ''}`.toLowerCase().includes(search))
      if (rootMatched || matchedChildren.length) {
        matchedRoots.push({
          ...item,
          children: matchedChildren.length > 0 ? matchedChildren : undefined
        })
      }
    }
    return matchedRoots
  })

  const expandedRowKeys = ref<string[]>([])

  watch(
    tableData,
    (data) => {
      if (!OllamaAllModelsSetup.search.trim()) {
        expandedRowKeys.value = []
      } else {
        const search = OllamaAllModelsSetup.search.trim().toLowerCase()
        expandedRowKeys.value = data
          .filter((item) => {
            const children = item.children || []
            return children.some((child) => `${child?.name || ''}`.toLowerCase().includes(search))
          })
          .map((item) => item.name)
      }
    },
    { immediate: true }
  )

  const onExpandedRowsChange = (keys: string[]) => {
    expandedRowKeys.value = keys
  }

  const fetchCommand = (row: any) => {
    if (!runningService.value) {
      return I18nT('ollama.needServiceRun')
    }
    let fn = ''
    if (OllamaLocalModelsSetup.list.some((l) => l.name === row.name)) {
      fn = 'rm'
    } else {
      fn = 'pull'
    }
    if (window.Server.isWindows) {
      console.log('runningService.value.bin: ', runningService.value.bin)
      return `cd "${dirname(runningService.value.bin)}"; ./ollama.exe ${fn} ${row.name}`
    }
    return `cd "${dirname(runningService.value.bin)}" && ./ollama ${fn} ${row.name}`
  }

  const copyCommand = (row: any) => {
    const command = fetchCommand(row)
    clipboard.writeText(command)
    MessageSuccess(I18nT('base.copySuccess'))
  }

  const handleBrewVersion = async (row: any) => {
    if (!runningService.value) {
      return MessageError(I18nT('ollama.needServiceRun'))
    }
    if (OllamaAllModelsSetup.installing) {
      return
    }
    OllamaAllModelsSetup.installing = true
    OllamaAllModelsSetup.installEnd = false
    const params: string[] = []

    if (window.Server.isWindows) {
      if (window.Server.Proxy) {
        for (const k in window.Server.Proxy) {
          const v = window.Server.Proxy[k]
          params.push(`$env:${k}="${v}"`)
        }
      }
    } else {
      if (proxyStr?.value) {
        params.push(proxyStr?.value)
      }
    }
    params.push(fetchCommand(row))

    await nextTick()
    const execXTerm = new XTerm()
    OllamaAllModelsSetup.xterm = execXTerm
    await execXTerm.mount(xtermDom.value!)
    await execXTerm.send(params)
    OllamaAllModelsSetup.installEnd = true
  }

  const xtermDom = ref<HTMLElement>()

  onMounted(() => {
    if (OllamaAllModelsSetup.installing) {
      nextTick().then(() => {
        const execXTerm: XTerm = OllamaAllModelsSetup.xterm as any
        if (execXTerm && xtermDom.value) {
          execXTerm.mount(xtermDom.value).then().catch()
        }
      })
    }
  })

  onUnmounted(() => {
    OllamaAllModelsSetup?.xterm?.unmounted()
  })

  fetchData()
  fetchHardware()

  return {
    handleBrewVersion,
    reGetData,
    fetching,
    xtermDom,
    fetchCommand,
    copyCommand,
    tableData,
    expandedRowKeys,
    onExpandedRowsChange,
    runningService,
    getModelSizeColor
  }
}
