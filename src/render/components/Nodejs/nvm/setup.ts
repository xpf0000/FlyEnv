import { computed, markRaw, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import XTerm from '@/util/XTerm'
import IPC from '@/util/IPC'
import { NodejsStore } from '@/components/Nodejs/node'
import { AppStore } from '@/store/app'
import { dirname, join } from '@/util/path-browserify'
import { fs } from '@/util/NodeFn'

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
  const appStore = AppStore()

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
      commands.push(`nvm.exe ${action} ${item.version}`)
    } else {
      commands.push(`unset PREFIX`)
      commands.push(`export NVM_DIR="${window.Server.UserHome}/.nvm"`)
      commands.push(`[ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh"`)
      commands.push(`nvm ${action} ${item.version}`)
    }

    await execXTerm.send(commands, false)
    item.installing = false
    NVMSetup.installEnd = true
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

  const proxy = computed(() => {
    return appStore.config.setup.proxy
  })
  const proxyStr = computed(() => {
    if (!proxy?.value.on) {
      return undefined
    }
    return proxy?.value?.proxy
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

    if (window.Server.isWindows) {
      // Windows installation using winget
      const commands: string[] = []
      if (proxyStr?.value) {
        commands.push(proxyStr.value)
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

    const arch = window.Server.isArmArch ? '-arm64' : '-x86_64'
    const params = []
    if (proxyStr?.value) {
      params.unshift(proxyStr?.value)
    }

    if (NVMSetup.installLib === 'shell') {
      params.push(`curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash`)
      params.push(`command brew --prefix && chmod -R go-w "$(brew --prefix)/share"`)
    } else if (NVMSetup.installLib === 'brew') {
      params.push(`arch ${arch} brew install --verbose nvm`)
    } else {
      params.push(`arch ${arch} sudo -S port -f deactivate libuuid`)
      params.push(`arch ${arch} sudo -S port clean -v nvm`)
      params.push(`arch ${arch} sudo -S port install -v nvm`)
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

    const file = join(window.Server.Cache!, `nvm-install.sh`)
    await fs.writeFile(file, content)
    await fs.chmod(file, '0777')
    await nextTick()
    await execXTerm.send([`cd "${dirname(file)}"`, `./nvm-install.sh`])
    NVMSetup.installEnd = true
    await fs.remove(file)
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
    showTable
  }
}
