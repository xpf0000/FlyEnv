import { computed, markRaw, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import XTerm from '@/util/XTerm'
import IPC from '@/util/IPC'
import { NodejsStore } from '@/components/Nodejs/node'
import { AppStore } from '@/store/app'
import { dirname, join } from '@/util/path-browserify'
import { fs } from '@/util/NodeFn'

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
  const appStore = AppStore()

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
      commands.push(`fnm.exe ${action} ${item.version}`)
    } else {
      commands.push(`unset PREFIX`)
      commands.push(`fnm ${action} ${item.version}`)
    }

    await execXTerm.send(commands, false)
    item.installing = false
    FNMSetup.installEnd = true
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

  const proxy = computed(() => {
    return appStore.config.setup.proxy
  })
  const proxyStr = computed(() => {
    if (!proxy?.value.on) {
      return undefined
    }
    return proxy?.value?.proxy
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

    if (window.Server.isWindows) {
      // Windows installation using winget
      const commands: string[] = []
      if (proxyStr?.value) {
        commands.push(proxyStr.value)
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

    const arch = window.Server.isArmArch ? '-arm64' : '-x86_64'
    const params = []
    if (proxyStr?.value) {
      params.unshift(proxyStr?.value)
    }

    if (FNMSetup.installLib === 'shell') {
      params.push('curl -fsSL https://fnm.vercel.app/install | bash')
    } else if (FNMSetup.installLib === 'brew') {
      params.push(`arch ${arch} brew install --verbose fnm`)
    } else {
      params.push(`arch ${arch} sudo -S port -f deactivate libuuid`)
      params.push(`arch ${arch} sudo -S port clean -v fnm`)
      params.push(`arch ${arch} sudo -S port install -v fnm`)
    }

    const content = `#!/bin/zsh
if [ -f "~/.bash_profile" ]; then
  source ~/.bash_profile
fi
if [ -f "~/.zshrc" ]; then
  source ~/.zshrc
fi
${params.join('\n')}`

    console.log('content: ', content)

    const file = join(window.Server.Cache!, `fnm-install.sh`)
    await fs.writeFile(file, content)
    await fs.chmod(file, '0777')
    await nextTick()
    await execXTerm.send([`cd "${dirname(file)}"`, `./fnm-install.sh`])
    FNMSetup.installEnd = true
    await fs.remove(file)
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
