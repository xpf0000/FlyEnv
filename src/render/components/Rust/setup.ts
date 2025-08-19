import { nextTick, reactive } from 'vue'
import { AppStore } from '@/store/app'
import XTerm from '@/util/XTerm'
import IPC from '@/util/IPC'
import type { ModuleStaticItem } from '@/core/Module/ModuleStaticItem'

type ToolchainItem = {
  path: string
  name: string
  version: string
  isDefault: boolean
}

type TargetItem = {
  name: string
  installed: boolean
}

export const RustupSetup = reactive<{
  versionSearchKey: string
  targetSearchKey: string
  tab: 'version' | 'target'
  toolchainList: ToolchainItem[]
  targetList: TargetItem[]
  installEnd: boolean
  installing: boolean
  installed?: boolean
  fetching: boolean
  xterm: XTerm | undefined
  checkRustup: () => void
  reFetch: () => void
  fetchData: () => void
  installRustup: (xtermDom: HTMLElement) => Promise<any>
  versionAction: (
    item: ModuleStaticItem,
    action: 'install' | 'uninstall',
    xtermDom: HTMLElement
  ) => Promise<any>
  tagertAction: (item: TargetItem, action: 'add' | 'remove', xtermDom: HTMLElement) => Promise<any>
  versionDefault: (item: TargetItem, xtermDom: HTMLElement) => Promise<any>
}>({
  versionSearchKey: '',
  targetSearchKey: '',
  tab: 'version',
  toolchainList: [],
  targetList: [],
  fetching: false,
  installEnd: false,
  installing: false,
  xterm: undefined,
  installed: undefined,
  reFetch: () => 0,
  checkRustup() {
    IPC.send('app-fork:rust', 'checkRustup').then((key: string, res) => {
      IPC.off(key)
      RustupSetup.installed = res?.data
      if (RustupSetup.installed) {
        RustupSetup.fetchData()
      }
    })
  },
  fetchData() {
    if (!RustupSetup.installed || RustupSetup.fetching) {
      return
    }
    RustupSetup.fetching = true
    IPC.send('app-fork:rust', 'rustupData').then((key: string, res) => {
      IPC.off(key)
      RustupSetup.toolchainList = reactive(res?.data?.toolchainList ?? [])
      RustupSetup.targetList = reactive(res?.data?.targetList ?? [])
      RustupSetup.fetching = false
    })
  },
  async versionAction(
    item: ModuleStaticItem,
    action: 'install' | 'uninstall',
    xtermDom: HTMLElement
  ) {
    RustupSetup.installEnd = false
    const appStore = AppStore()
    const proxy = appStore.config.setup?.proxy?.proxy
    const params = []
    if (proxy) {
      params.unshift(proxy)
    }
    params.push(`rustup ${action} ${item.version}`)
    await nextTick()
    const execXTerm = new XTerm()
    RustupSetup.xterm = execXTerm
    await execXTerm.mount(xtermDom)
    await execXTerm.send(params)
    RustupSetup.installEnd = true
    RustupSetup.fetchData()
  },
  async tagertAction(item: TargetItem, action: 'add' | 'remove', xtermDom: HTMLElement) {
    RustupSetup.installEnd = false
    const appStore = AppStore()
    const proxy = appStore.config.setup?.proxy?.proxy
    const params = []
    if (proxy) {
      params.unshift(proxy)
    }
    params.push(`rustup target ${action} ${item.name}`)
    await nextTick()
    const execXTerm = new XTerm()
    RustupSetup.xterm = execXTerm
    await execXTerm.mount(xtermDom)
    await execXTerm.send(params)
    RustupSetup.installEnd = true
    RustupSetup.fetchData()
  },
  async versionDefault(item: TargetItem, xtermDom: HTMLElement) {
    RustupSetup.installEnd = false
    const params = []
    params.push(`rustup default ${item.name}`)
    await nextTick()
    const execXTerm = new XTerm()
    RustupSetup.xterm = execXTerm
    await execXTerm.mount(xtermDom)
    await execXTerm.send(params)
    RustupSetup.installEnd = true
    RustupSetup.fetchData()
  },
  async installRustup(xtermDom: HTMLElement) {
    RustupSetup.installEnd = false
    const appStore = AppStore()
    const proxy = appStore.config.setup?.proxy?.proxy
    const params = []
    if (proxy) {
      params.unshift(proxy)
    }
    if (window.Server.isWindows) {
      params.push(`cd "${window.Server.Cache!}"`)
      params.push(`Invoke-WebRequest -Uri https://win.rustup.rs -OutFile rustup-init.exe`)
      params.push(`.\\rustup-init.exe -y --default-toolchain stable`)
    } else {
      params.push(`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)
    }
    await nextTick()
    const execXTerm = new XTerm()
    RustupSetup.xterm = execXTerm
    await execXTerm.mount(xtermDom)
    await execXTerm.send(params)
    RustupSetup.installEnd = true
    RustupSetup.fetchData()
  }
})
