import { computed, markRaw, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import XTerm from '@/util/XTerm'
import IPC from '@/util/IPC'
import { NodejsStore } from '@/components/Nodejs/node'
import { BrewStore } from '@/store/brew'

export const FNMSetup = reactive<{
  installed: boolean
  version: string
  installEnd: boolean
  installing: boolean
  fetching: boolean
  switching: boolean
  local: Array<string>
  current: string
  xterm: XTerm | undefined
  reFetch: () => void
  installLib: 'shell' | 'brew' | 'port'
  search: string
  checkInstalled: () => Promise<boolean>
}>({
  installed: false,
  version: '',
  installEnd: false,
  installing: false,
  fetching: false,
  switching: false,
  local: [],
  current: '',
  xterm: undefined,
  reFetch: () => 0,
  installLib: 'shell',
  search: '',
  checkInstalled: async () => false
})

export const Setup = () => {
  const store = NodejsStore()

  const xtermDom = ref<HTMLElement>()

  const hasBrew = !!window.Server.BrewCellar
  const hasPort = !!window.Server.MacPorts

  /**
   * Check if fnm is installed
   */
  const checkInstalled = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (window.Server.isWindows) {
        // For Windows, use localVersion to check
        fetchLocal().then(() => {
          resolve(FNMSetup.local.length > 0)
        })
        return
      }
      IPC.send('app-fork:node', 'checkInstalled', 'fnm').then((key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          FNMSetup.installed = res?.data?.installed ?? false
          FNMSetup.version = res?.data?.version ?? ''
        }
        resolve(FNMSetup.installed)
      })
    })
  }

  FNMSetup.checkInstalled = checkInstalled

  const fetchLocal = () => {
    if (FNMSetup.local.length > 0 || FNMSetup.fetching) {
      return Promise.resolve()
    }
    FNMSetup.fetching = true
    return new Promise<void>((resolve) => {
      IPC.send('app-fork:node', 'localVersion', 'fnm').then((key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          FNMSetup.local.splice(0)
          const list = res?.data?.versions ?? []
          FNMSetup.local.push(...list)
          FNMSetup.current = res?.data?.current ?? ''
        }
        FNMSetup.fetching = false
        resolve()
      })
    })
  }

  FNMSetup.reFetch = () => {
    FNMSetup.fetching = false
    FNMSetup.local.splice(0)
    FNMSetup.current = ''
    checkInstalled().then(() => {
      fetchLocal().catch()
    })
    store.chekTool()?.then()?.catch()
  }

  /**
   * Switch version using XTerm
   */
  const versionChangeXTerm = async (item: any) => {
    if (FNMSetup.switching) {
      return
    }
    FNMSetup.switching = true
    item.switching = true
    FNMSetup.installEnd = false
    FNMSetup.installing = true
    await nextTick()

    const execXTerm = new XTerm()
    FNMSetup.xterm = markRaw(execXTerm)
    await execXTerm.mount(xtermDom.value!)

    const commands: string[] = []

    if (window.Server.isWindows) {
      commands.push(`fnm.exe default ${item.version}`)
    } else {
      commands.push(`unset PREFIX`)
      commands.push(`fnm default ${item.version}`)
    }

    await execXTerm.send(commands, false)

    FNMSetup.switching = false
    item.switching = false
    FNMSetup.installEnd = true
  }

  const brewStore = BrewStore()

  /**
   * Install or uninstall version using XTerm
   */
  const installOrUninstallXTerm = async (action: 'install' | 'uninstall', item: any) => {
    if (FNMSetup.installing) {
      return
    }
    item.installing = true
    FNMSetup.installEnd = false
    FNMSetup.installing = true
    await nextTick()

    const execXTerm = new XTerm()
    FNMSetup.xterm = markRaw(execXTerm)
    await execXTerm.mount(xtermDom.value!)

    const commands: string[] = []

    if (window.Server.isWindows) {
      if (window.Server.Proxy) {
        for (const k in window.Server.Proxy) {
          const v = window.Server.Proxy[k]
          commands.push(`$env:${k}="${v}"`)
        }
      }
      commands.push(`where.exe fnm`)
      commands.push(`fnm ${action} ${item.version}`)
    } else {
      if (window.Server.Proxy) {
        for (const k in window.Server.Proxy) {
          const v = window.Server.Proxy[k]
          commands.push(`export ${k}="${v}"`)
        }
      }
      commands.push(`unset PREFIX`)
      commands.push(`fnm ${action} ${item.version}`)
    }

    await execXTerm.send(commands, false)
    item.installing = false
    FNMSetup.installEnd = true

    const data = brewStore.module('node')
    data.installedFetched = false
    data.fetchInstalled().catch()
  }

  const tableData = computed(() => {
    if (showInstall.value) {
      return []
    }
    const locals =
      FNMSetup.local.map((v) => {
        return {
          version: v,
          installed: true
        }
      }) ?? []
    const remotas =
      store.all
        .filter((a) => !FNMSetup.local.includes(a))
        .map((v) => {
          return {
            version: v,
            installed: false
          }
        }) ?? []
    const list = [...locals, ...remotas]
    if (!FNMSetup.search) {
      return list
    }
    return list.filter(
      (v) => v.version.includes(FNMSetup.search) || FNMSetup.search.includes(v.version)
    )
  })

  const showInstall = computed(() => {
    return !store.checking && (!store.tool || store.tool === 'nvm')
  })

  const showTable = computed(() => {
    return !store.checking && ['fnm', 'all'].includes(store.tool)
  })

  const installFNM = async () => {
    if (FNMSetup.installing) {
      return
    }
    FNMSetup.installEnd = false
    FNMSetup.installing = true
    await nextTick()

    const execXTerm = new XTerm()
    FNMSetup.xterm = markRaw(execXTerm)
    await execXTerm.mount(xtermDom.value!)

    const commands: string[] = []
    if (window.Server.isWindows) {
      // Windows installation using winget
      if (window.Server.Proxy) {
        for (const k in window.Server.Proxy) {
          const v = window.Server.Proxy[k]
          commands.push(`$env:${k}="${v}"`)
        }
      }
      commands.push(
        'winget install Schniz.fnm --accept-source-agreements --accept-package-agreements'
      )
      await execXTerm.send(commands, false)
      FNMSetup.installEnd = true
      checkInstalled().then(() => {
        store.chekTool()?.then()?.catch()
      })
      return
    }

    if (window.Server.Proxy) {
      for (const k in window.Server.Proxy) {
        const v = window.Server.Proxy[k]
        commands.push(`export ${k}="${v}"`)
      }
    }

    if (FNMSetup.installLib === 'shell') {
      commands.push('curl -fsSL https://fnm.vercel.app/install | bash')
    } else if (FNMSetup.installLib === 'brew') {
      commands.push(`brew install --verbose fnm`)
    } else {
      commands.push(`sudo -S port -f deactivate libuuid`)
      commands.push(`sudo -S port clean -v fnm`)
      commands.push(`sudo -S port install -v fnm`)
    }

    await execXTerm.send(commands, false)
    FNMSetup.installEnd = true
    checkInstalled().then(() => {
      store.chekTool()?.then()?.catch()
    })
  }

  const taskConfirm = () => {
    FNMSetup.installing = false
    FNMSetup.installEnd = false
    FNMSetup.xterm?.destroy()
    delete FNMSetup.xterm
    checkInstalled().then(() => {
      fetchLocal().catch()
    })
  }

  const taskCancel = () => {
    FNMSetup.installing = false
    FNMSetup.installEnd = false
    FNMSetup.xterm?.stop()?.then(() => {
      FNMSetup.xterm?.destroy()
      delete FNMSetup.xterm
    })
  }

  const isWindows = computed(() => {
    return !!window.Server.isWindows
  })

  const isMacOS = computed(() => {
    return !!window.Server.isMacOS
  })

  onMounted(() => {
    if (FNMSetup.installing) {
      nextTick().then(() => {
        const execXTerm: XTerm = FNMSetup.xterm as any
        if (execXTerm && xtermDom.value) {
          execXTerm.mount(xtermDom.value).then().catch()
        }
      })
    }
    checkInstalled().catch()
  })

  onUnmounted(() => {
    FNMSetup?.xterm?.unmounted()
  })

  fetchLocal().catch()

  return {
    fetchLocal,
    versionChange: versionChangeXTerm,
    installOrUninstall: installOrUninstallXTerm,
    showInstall,
    xtermDom,
    hasBrew,
    hasPort,
    installFNM,
    tableData,
    taskConfirm,
    taskCancel,
    checkInstalled,
    showTable,
    isWindows,
    isMacOS
  }
}
