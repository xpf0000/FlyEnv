import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { AppStore } from '@/store/app'
import { BrewStore } from '@/store/brew'
import XTerm from '@/util/XTerm'
import IPC from '@/util/IPC'
import type { AllAppModule } from '@/core/type'
import { MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'
import { join, basename, dirname } from '@/util/path-browserify'
import { clipboard, fs } from '@/util/NodeFn'

export const BrewSetup = reactive<{
  installEnd: boolean
  installing: boolean
  xterm: XTerm | undefined
  checkBrew: () => void
  reFetch: () => void
}>({
  installEnd: false,
  installing: false,
  xterm: undefined,
  reFetch: () => 0,
  checkBrew() {
    if (!window.Server.BrewCellar) {
      IPC.send('app-check-brewport').then((key: string) => {
        IPC.off(key)
      })
    }
  }
})

export const Setup = (typeFlag: AllAppModule) => {
  const appStore = AppStore()
  const brewStore = BrewStore()

  const proxy = computed(() => {
    return appStore.config.setup.proxy
  })
  const proxyStr = computed(() => {
    if (!proxy?.value.on) {
      return undefined
    }
    return proxy?.value?.proxy
  })

  const checkBrew = computed(() => {
    if (!appStore.envIndex) {
      return false
    }
    return !!window.Server.BrewCellar
  })

  const showBrewError = computed(() => {
    if (!appStore.envIndex) {
      return false
    }
    return window?.Server?.BrewBin && window?.Server?.BrewError
  })

  const brewBin = computed(() => {
    return window?.Server?.BrewBin ?? ''
  })

  const brewError = computed(() => {
    return window?.Server?.BrewError ?? ''
  })

  const fetching = computed(() => {
    const module = brewStore.module(typeFlag)
    return module.brewFetching
  })

  const fetchData = () => {
    const module = brewStore.module(typeFlag)
    if (module.brewFetching) {
      return
    }
    module.fetchBrew()
  }
  const getData = () => {
    if (!checkBrew.value || fetching.value) {
      console.log('getData exit: ', checkBrew.value, fetching.value)
      return
    }
    const module = brewStore.module(typeFlag)
    if (module.brew.length === 0) {
      if (typeFlag === 'php') {
        if (!appStore?.config?.setup?.phpBrewInitiated) {
          /**
           * First, fetch the installed PHP versions, and simultaneously install the shivammathur/php repository.
           * After a successful installation, refresh the data.
           * This avoids the issue where domestic users experience very slow repository addition,
           * which prevents fetching the installed data.
           */
          IPC.send('app-fork:brew', 'addTap', 'shivammathur/php').then((key: string, res: any) => {
            IPC.off(key)
            appStore.config.setup.phpBrewInitiated = true
            appStore.saveConfig().catch()
            if (res?.data === 2) {
              fetchData()
            }
          })
        }
      } else if (typeFlag === 'mongodb' && !appStore?.config?.setup?.mongodbBrewInitiated) {
        IPC.send('app-fork:brew', 'addTap', 'mongodb/brew').then((key: string, res: any) => {
          IPC.off(key)
          appStore.config.setup.mongodbBrewInitiated = true
          appStore.saveConfig().catch()
          if (res?.data === 2) {
            fetchData()
          }
        })
      } else if (typeFlag === 'consul' && !appStore?.config?.setup?.consulBrewInitiated) {
        IPC.send('app-fork:brew', 'addTap', 'hashicorp/tap').then((key: string, res: any) => {
          IPC.off(key)
          appStore.config.setup.consulBrewInitiated = true
          appStore.saveConfig().catch()
          if (res?.data === 2) {
            fetchData()
          }
        })
      } else if (typeFlag === 'typesense' && !appStore?.config?.setup?.typesenseBrewInitiated) {
        IPC.send('app-fork:brew', 'addTap', 'typesense/homebrew-tap').then(
          (key: string, res: any) => {
            IPC.off(key)
            appStore.config.setup.typesenseBrewInitiated = true
            appStore.saveConfig().catch()
            if (res?.data === 2) {
              fetchData()
            }
          }
        )
      }
      fetchData()
    }
  }

  const reGetData = () => {
    console.log('reGetData !!!')
    brewStore.module(typeFlag).brew.splice(0)
    getData()
  }

  BrewSetup.reFetch = reGetData

  const regetInstalled = () => {
    reGetData()
    const module = brewStore.module(typeFlag)
    module.installedFetched = false
    module.fetchInstalled().catch()
  }

  const fetchCommand = (row: any) => {
    let fn = ''
    if (row.installed) {
      fn = 'uninstall'
    } else {
      fn = 'install'
    }
    return `brew ${fn} ${row.name}`
  }

  const copyCommand = (row: any) => {
    const command = fetchCommand(row)
    clipboard.writeText(command)
    MessageSuccess(I18nT('base.copySuccess'))
  }

  const handleBrewVersion = async (row: any) => {
    if (BrewSetup.installing) {
      return
    }
    BrewSetup.installing = true
    BrewSetup.installEnd = false
    let fn = ''
    if (row.installed) {
      fn = 'uninstall'
    } else {
      fn = 'install'
    }
    const arch = window.Server.isArmArch ? '-arm64' : '-x86_64'
    const name = row.name
    let params = []
    const sh = join(window.Server.Static!, 'sh/brew-cmd.sh')
    const copyfile = join(window.Server.Cache!, 'brew-cmd.sh')
    const exists = await fs.existsSync(copyfile)
    if (exists) {
      await fs.remove(copyfile)
    }
    await fs.copyFile(sh, copyfile)
    await fs.chmod(copyfile, '0777')
    params = [`${copyfile} ${arch} ${fn} ${name};`]
    if (proxyStr?.value) {
      params.unshift(proxyStr?.value)
    }
    await nextTick()
    const execXTerm = new XTerm()
    BrewSetup.xterm = execXTerm
    await execXTerm.mount(xtermDom.value!)
    await execXTerm.send(params)
    BrewSetup.installEnd = true
    regetInstalled()
  }

  const tableData = computed(() => {
    const arr = []
    const list = brewStore.module(typeFlag).brew
    for (const value of list) {
      const nums = value.version.split('.').map((n: string, i: number) => {
        if (i > 0) {
          const num = parseInt(n)
          if (isNaN(num)) {
            return '00'
          }
          if (num < 10) {
            return `0${num}`
          }
          return num
        }
        return n
      })
      const num = parseInt(nums.join(''))
      Object.assign(value, {
        version: value.version,
        installed: value.installed,
        num
      })
      arr.push(value)
    }
    arr.sort((a: any, b: any) => {
      return b.num - a.num
    })
    return arr
  })

  const xtermDom = ref<HTMLElement>()

  const installBrew = async () => {
    if (BrewSetup.installing) {
      return
    }
    BrewSetup.installEnd = false
    BrewSetup.installing = true
    await nextTick()
    const file =
      appStore.config.setup.lang === 'zh'
        ? join(window.Server.Static!, 'sh/brew-install.sh')
        : join(window.Server.Static!, 'sh/brew-install-en.sh')
    const copyFile = join(window.Server.Cache!, basename(file))
    await fs.copyFile(file, copyFile)
    await fs.chmod(copyFile, '0755')
    const execXTerm = new XTerm()
    BrewSetup.xterm = execXTerm
    console.log('xtermDom.value: ', xtermDom.value)
    await execXTerm.mount(xtermDom.value!)
    const command: string[] = [`cd "${dirname(copyFile)}"`, `./${basename(file)}`]
    await execXTerm.send(command)
    BrewSetup.installEnd = true
  }

  getData()

  watch(checkBrew, (v, ov) => {
    if (!ov && v) {
      getData()
    }
  })

  onMounted(() => {
    if (BrewSetup.installing) {
      nextTick().then(() => {
        const execXTerm: XTerm = BrewSetup.xterm as any
        if (execXTerm && xtermDom.value) {
          execXTerm.mount(xtermDom.value).then().catch()
        }
      })
    }
  })

  onUnmounted(() => {
    BrewSetup?.xterm?.unmounted?.()
  })

  return {
    installBrew,
    handleBrewVersion,
    tableData,
    checkBrew,
    reGetData,
    fetching,
    xtermDom,
    fetchCommand,
    copyCommand,
    showBrewError,
    brewBin,
    brewError
  }
}
