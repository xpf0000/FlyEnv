import { computed, markRaw, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import XTerm from '@/util/XTerm'
import IPC from '@/util/IPC'
import { NodejsStore } from '@/components/Nodejs/node'
import { BrewStore } from '@/store/brew'

export const NVMSetup = reactive<{
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
   * Check if nvm is installed
   */
  const checkInstalled = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (window.Server.isWindows) {
        // For Windows, use localVersion to check
        fetchLocal().then(() => {
          resolve(NVMSetup.local.length > 0)
        })
        return
      }
      IPC.send('app-fork:node', 'checkInstalled', 'nvm').then((key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          NVMSetup.installed = res?.data?.installed ?? false
          NVMSetup.version = res?.data?.version ?? ''
        }
        resolve(NVMSetup.installed)
      })
    })
  }

  NVMSetup.checkInstalled = checkInstalled

  const fetchLocal = () => {
    if (NVMSetup.local.length > 0 || NVMSetup.fetching) {
      return Promise.resolve()
    }
    NVMSetup.fetching = true
    return new Promise<void>((resolve) => {
      IPC.send('app-fork:node', 'localVersion', 'nvm').then((key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          NVMSetup.local.splice(0)
          const list = res?.data?.versions ?? []
          NVMSetup.local.push(...list)
          NVMSetup.current = res?.data?.current ?? ''
        }
        NVMSetup.fetching = false
        resolve()
      })
    })
  }

  NVMSetup.reFetch = () => {
    NVMSetup.fetching = false
    NVMSetup.local.splice(0)
    NVMSetup.current = ''
    checkInstalled().then(() => {
      fetchLocal().catch()
    })
    store.chekTool()?.then()?.catch()
  }

  /**
   * Switch version using XTerm
   */
  const versionChangeXTerm = async (item: any) => {
    if (NVMSetup.switching) {
      return
    }
    NVMSetup.switching = true
    item.switching = true
    NVMSetup.installEnd = false
    NVMSetup.installing = true
    await nextTick()

    const execXTerm = new XTerm()
    NVMSetup.xterm = markRaw(execXTerm)
    await execXTerm.mount(xtermDom.value!)

    const commands: string[] = []

    if (window.Server.isWindows) {
      commands.push(`nvm.exe use ${item.version}`)
    } else {
      commands.push(`unset PREFIX`)
      commands.push(`export NVM_DIR="${window.Server.UserHome}/.nvm"`)
      commands.push(`[ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh"`)
      commands.push(`nvm alias default ${item.version}`)
    }

    await execXTerm.send(commands, false)

    NVMSetup.switching = false
    item.switching = false
    NVMSetup.installEnd = true
  }

  const brewStore = BrewStore()

  /**
   * Install or uninstall version using XTerm
   */
  const installOrUninstallXTerm = async (action: 'install' | 'uninstall', item: any) => {
    if (NVMSetup.installing) {
      return
    }
    item.installing = true
    NVMSetup.installEnd = false
    NVMSetup.installing = true
    await nextTick()

    const execXTerm = new XTerm()
    NVMSetup.xterm = markRaw(execXTerm)
    await execXTerm.mount(xtermDom.value!)

    const commands: string[] = []

    if (window.Server.isWindows) {
      if (window.Server.Proxy) {
        for (const k in window.Server.Proxy) {
          const v = window.Server.Proxy[k]
          commands.push(`$env:${k}="${v}"`)
        }
      }
      commands.push(`nvm.exe ${action} ${item.version}`)
    } else {
      if (window.Server.Proxy) {
        for (const k in window.Server.Proxy) {
          const v = window.Server.Proxy[k]
          commands.push(`export ${k}="${v}"`)
        }
      }
      commands.push(`unset PREFIX`)
      commands.push(`export NVM_DIR="${window.Server.UserHome}/.nvm"`)
      commands.push(`[ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh"`)
      commands.push(`nvm ${action} ${item.version}`)
    }

    await execXTerm.send(commands, false)
    item.installing = false
    NVMSetup.installEnd = true

    const data = brewStore.module('node')
    data.installedFetched = false
    data.fetchInstalled().catch()
  }

  const tableData = computed(() => {
    if (showInstall.value) {
      return []
    }
    const locals =
      NVMSetup.local.map((v) => {
        return {
          version: v,
          installed: true
        }
      }) ?? []
    const remotas =
      store.all
        .filter((a) => !NVMSetup.local.includes(a))
        .map((v) => {
          return {
            version: v,
            installed: false
          }
        }) ?? []
    const list = [...locals, ...remotas]
    if (!NVMSetup.search) {
      return list
    }
    return list.filter(
      (v) => v.version.includes(NVMSetup.search) || NVMSetup.search.includes(v.version)
    )
  })

  const showInstall = computed(() => {
    return !store.checking && (!store.tool || store.tool === 'fnm')
  })

  const showTable = computed(() => {
    return !store.checking && ['nvm', 'all'].includes(store.tool)
  })

  const installNVM = async () => {
    if (NVMSetup.installing) {
      return
    }
    NVMSetup.installEnd = false
    NVMSetup.installing = true
    await nextTick()

    const execXTerm = new XTerm()
    NVMSetup.xterm = markRaw(execXTerm)
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
        'winget install CoreyButler.NVMforWindows --accept-source-agreements --accept-package-agreements'
      )
      await execXTerm.send(commands)
      NVMSetup.installEnd = true
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

    if (NVMSetup.installLib === 'shell') {
      commands.push(
        `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash`
      )
    } else if (NVMSetup.installLib === 'brew') {
      commands.push(`brew install --verbose nvm`)
    } else {
      commands.push(`sudo -S port -f deactivate libuuid`)
      commands.push(`sudo -S port clean -v nvm`)
      commands.push(`sudo -S port install -v nvm`)
    }

    await execXTerm.send(commands, false)
    NVMSetup.installEnd = true
    checkInstalled().then(() => {
      store.chekTool()?.then()?.catch()
    })
  }

  const taskConfirm = () => {
    NVMSetup.installing = false
    NVMSetup.installEnd = false
    NVMSetup.xterm?.destroy()
    delete NVMSetup.xterm
    checkInstalled().then(() => {
      fetchLocal().catch()
    })
  }

  const taskCancel = () => {
    NVMSetup.installing = false
    NVMSetup.installEnd = false
    NVMSetup.xterm?.stop()?.then(() => {
      NVMSetup.xterm?.destroy()
      delete NVMSetup.xterm
    })
  }

  const isWindows = computed(() => {
    return !!window.Server.isWindows
  })

  const isMacOS = computed(() => {
    return !!window.Server.isMacOS
  })

  onMounted(() => {
    if (NVMSetup.installing) {
      nextTick().then(() => {
        const execXTerm: XTerm = NVMSetup.xterm as any
        if (execXTerm && xtermDom.value) {
          execXTerm.mount(xtermDom.value).then().catch()
        }
      })
    }
    checkInstalled().catch()
  })

  onUnmounted(() => {
    NVMSetup?.xterm?.unmounted()
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
    installNVM,
    tableData,
    taskConfirm,
    taskCancel,
    checkInstalled,
    showTable,
    isWindows,
    isMacOS
  }
}
