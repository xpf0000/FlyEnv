import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import XTerm from '@/util/XTerm'
import IPC from '@/util/IPC'
import { MessageError, MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'
import { NodejsStore } from '@/components/Nodejs/node'
import { AppStore } from '@/store/app'

const { dirname, join } = require('path')
const { writeFile, chmod, remove } = require('fs-extra')

export const FNMSetup = reactive<{
  installed: boolean
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
}>({
  installed: false,
  installEnd: false,
  installing: false,
  fetching: false,
  switching: false,
  local: [],
  current: '',
  xterm: undefined,
  reFetch: () => 0,
  installLib: 'shell',
  search: ''
})

export const Setup = () => {
  const store = NodejsStore()
  const appStore = AppStore()

  const xtermDom = ref<HTMLElement>()

  const hasBrew = !!global.Server.BrewCellar
  const hasPort = !!global.Server.MacPorts

  const fetchLocal = () => {
    if (FNMSetup.local.length > 0 || FNMSetup.fetching) {
      return
    }
    FNMSetup.fetching = true
    IPC.send('app-fork:node', 'localVersion', 'fnm').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        FNMSetup.local.splice(0)
        const list = res?.data?.versions ?? []
        FNMSetup.local.push(...list)
        FNMSetup.current = res?.data?.current ?? ''
      }
      FNMSetup.fetching = false
    })
  }

  const reFetch = () => {
    FNMSetup.fetching = false
    FNMSetup.local.splice(0)
    FNMSetup.current = ''
    fetchLocal()
    store.chekTool()?.then()?.catch()
  }

  FNMSetup.reFetch = reFetch

  const versionChange = (item: any) => {
    if (FNMSetup.switching) {
      return
    }
    FNMSetup.switching = true
    item.switching = true
    IPC.send('app-fork:node', 'versionChange', 'fnm', item.version).then(
      (key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          FNMSetup.current = item.version
          MessageSuccess(I18nT('base.success'))
        } else {
          MessageError(res?.msg ?? I18nT('base.fail'))
        }
        item.switching = false
        FNMSetup.switching = false
      }
    )
  }

  const installOrUninstall = (action: 'install' | 'uninstall', item: any) => {
    item.installing = true
    IPC.send('app-fork:node', 'installOrUninstall', 'fnm', action, item.version).then(
      (key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          FNMSetup.current = res?.data?.current ?? ''
          const list = res?.data?.versions ?? []
          FNMSetup.local.splice(0)
          FNMSetup.local.push(...list)
          MessageSuccess(I18nT('base.success'))
        } else {
          MessageError(I18nT('base.fail'))
        }
        item.installing = false
      }
    )
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
    const arch = global.Server.isAppleSilicon ? '-arm64' : '-x86_64'
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

    const file = join(global.Server.Cache!, `fnm-install.sh`)
    await writeFile(file, content)
    await chmod(file, '0777')
    await nextTick()
    const execXTerm = new XTerm()
    FNMSetup.xterm = execXTerm
    await execXTerm.mount(xtermDom.value!)
    await execXTerm.send([`cd "${dirname(file)}"`, `./fnm-install.sh`])
    FNMSetup.installEnd = true
    await remove(file)
    store.chekTool()?.then()?.catch()
  }

  onMounted(() => {
    if (FNMSetup.installing) {
      nextTick().then(() => {
        const execXTerm: XTerm = FNMSetup.xterm as any
        if (execXTerm && xtermDom.value) {
          execXTerm.mount(xtermDom.value).then().catch()
        }
      })
    }
  })

  onUnmounted(() => {
    FNMSetup.xterm && FNMSetup.xterm.unmounted()
  })

  fetchLocal()

  return {
    fetchLocal,
    versionChange,
    installOrUninstall,
    showInstall,
    xtermDom,
    hasBrew,
    hasPort,
    installFNM,
    tableData
  }
}
