import { nextTick, reactive } from 'vue'
import type { GvmVersionItem } from '@shared/Gvm'
import { AppStore } from '@/store/app'
import { BrewStore } from '@/store/brew'
import IPC from '@/util/IPC'
import XTerm from '@/util/XTerm'
import { GVM_INSTALL_COMMAND, buildGvmVersionCommand, type GvmVersionAction } from './command'

async function mountAndRun(commands: string[], xtermDom: HTMLElement): Promise<void> {
  const params: string[] = []
  const proxy = AppStore().config.setup?.proxy?.proxy
  if (proxy) {
    params.push(proxy)
  }
  params.push(...commands)
  await nextTick()
  const xterm = new XTerm()
  GvmSetup.xterm = xterm
  await xterm.mount(xtermDom)
  await xterm.send(params)
}

async function refreshInstalledVersions(): Promise<void> {
  const module = BrewStore().module('golang')
  module.installedFetched = false
  await module.fetchInstalled()
}

export const GvmSetup = reactive<{
  initScript: string
  searchKey: string
  versions: GvmVersionItem[]
  installEnd: boolean
  installing: boolean
  installed?: boolean
  fetching: boolean
  xterm: XTerm | undefined
  checkGvm: () => void
  fetchData: () => void
  installGvm: (xtermDom: HTMLElement) => Promise<void>
  versionAction: (
    item: GvmVersionItem,
    action: GvmVersionAction,
    xtermDom: HTMLElement
  ) => Promise<void>
}>({
  initScript: '',
  searchKey: '',
  versions: [],
  installEnd: false,
  installing: false,
  installed: undefined,
  fetching: false,
  xterm: undefined,
  checkGvm() {
    IPC.send('app-fork:golang', 'checkGvm').then((key: string, res) => {
      IPC.off(key)
      GvmSetup.initScript = res?.data ?? ''
      GvmSetup.installed = !!GvmSetup.initScript
      if (GvmSetup.installed) {
        GvmSetup.fetchData()
      }
    })
  },
  fetchData() {
    if (!GvmSetup.installed || GvmSetup.fetching) {
      return
    }
    GvmSetup.fetching = true
    IPC.send('app-fork:golang', 'gvmData').then((key: string, res) => {
      IPC.off(key)
      GvmSetup.versions = reactive(res?.data ?? [])
      GvmSetup.fetching = false
    })
  },
  async installGvm(xtermDom: HTMLElement) {
    GvmSetup.installEnd = false
    try {
      await mountAndRun([GVM_INSTALL_COMMAND], xtermDom)
      GvmSetup.checkGvm()
    } finally {
      GvmSetup.installEnd = true
    }
  },
  async versionAction(item: GvmVersionItem, action: GvmVersionAction, xtermDom: HTMLElement) {
    GvmSetup.installEnd = false
    try {
      const command = buildGvmVersionCommand(GvmSetup.initScript, action, item.name)
      await mountAndRun([command], xtermDom)
      GvmSetup.fetchData()
      await refreshInstalledVersions()
    } finally {
      GvmSetup.installEnd = true
    }
  }
})
