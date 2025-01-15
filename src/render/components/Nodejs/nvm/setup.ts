import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import XTerm from '@/util/XTerm'
import IPC from '@/util/IPC'
import { MessageError, MessageSuccess } from '@/util/Element'
import { I18nT } from '@shared/lang'
import { NodejsStore } from '@/components/Nodejs/node'
import { AppStore } from '@/store/app'

const { dirname, join } = require('path')
const { writeFile, chmod, remove } = require('fs-extra')

export const NVMSetup = reactive<{
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
    if (NVMSetup.local.length > 0 || NVMSetup.fetching) {
      return
    }
    NVMSetup.fetching = true
    IPC.send('app-fork:node', 'localVersion', 'nvm').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        NVMSetup.local.splice(0)
        const list = res?.data?.versions ?? []
        NVMSetup.local.push(...list)
        NVMSetup.current = res?.data?.current ?? ''
      }
      NVMSetup.fetching = false
    })
  }

  const reFetch = () => {
    NVMSetup.fetching = false
    NVMSetup.local.splice(0)
    NVMSetup.current = ''
    fetchLocal()
    store.chekTool()?.then()?.catch()
  }

  NVMSetup.reFetch = reFetch

  const versionChange = (item: any) => {
    if (NVMSetup.switching) {
      return
    }
    NVMSetup.switching = true
    item.switching = true
    IPC.send('app-fork:node', 'versionChange', 'nvm', item.version).then(
      (key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          NVMSetup.current = item.version
          MessageSuccess(I18nT('base.success'))
        } else {
          MessageError(res?.msg ?? I18nT('base.fail'))
        }
        item.switching = false
        NVMSetup.switching = false
      }
    )
  }

  const installOrUninstall = (action: 'install' | 'uninstall', item: any) => {
    item.installing = true
    IPC.send('app-fork:node', 'installOrUninstall', 'nvm', action, item.version).then(
      (key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          NVMSetup.current = res?.data?.current ?? ''
          const list = res?.data?.versions ?? []
          NVMSetup.local.splice(0)
          NVMSetup.local.push(...list)
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
    const arch = global.Server.isAppleSilicon ? '-arm64' : '-x86_64'
    const params = []
    if (proxyStr?.value) {
      params.unshift(proxyStr?.value)
    }

    if (NVMSetup.installLib === 'shell') {
      params.push(`curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash`)
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

    const file = join(global.Server.Cache!, `nvm-install.sh`)
    await writeFile(file, content)
    await chmod(file, '0777')
    await nextTick()
    const execXTerm = new XTerm()
    NVMSetup.xterm = execXTerm
    await execXTerm.mount(xtermDom.value!)
    await execXTerm.send([`cd "${dirname(file)}"`, `./nvm-install.sh`])
    NVMSetup.installEnd = true
    await remove(file)
    store.chekTool()?.then()?.catch()
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
  })

  onUnmounted(() => {
    NVMSetup.xterm && NVMSetup.xterm.unmounted()
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
    installNVM,
    tableData
  }
}
