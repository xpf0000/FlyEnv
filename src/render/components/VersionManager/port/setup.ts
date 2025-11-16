import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { AppStore } from '@/store/app'
import { BrewStore } from '@/store/brew'
import XTerm from '@/util/XTerm'
import IPC from '@/util/IPC'
import type { AllAppModule } from '@/core/type'
import { MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'
import { join } from '@/util/path-browserify'
import { clipboard, fs } from '@/util/NodeFn'
import { compareVersions } from 'compare-versions'

export const MacPortsSetup = reactive<{
  installEnd: boolean
  installing: boolean
  xterm: XTerm | undefined
  checkMacPorts: () => void
  reFetch: () => void
}>({
  installEnd: false,
  installing: false,
  xterm: undefined,
  reFetch: () => 0,
  checkMacPorts() {
    if (!window.Server.MacPorts) {
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

  const checkMacPorts = computed(() => {
    if (!appStore.envIndex) {
      return false
    }
    return !!window.Server.MacPorts
  })

  const fetching = computed(() => {
    const module = brewStore.module(typeFlag)
    return module.portFetching
  })

  const fetchData = () => {
    const module = brewStore.module(typeFlag)
    if (module.portFetching) {
      return
    }
    module.fetchPort()
  }
  const getData = () => {
    if (!checkMacPorts.value || fetching.value) {
      console.log('getData exit: ', checkMacPorts.value, fetching.value)
      return
    }
    const module = brewStore.module(typeFlag)
    if (module.port.length === 0) {
      fetchData()
    }
  }

  const reGetData = () => {
    console.log('reGetData !!!')
    brewStore.module(typeFlag).port.splice(0)
    getData()
  }

  MacPortsSetup.reFetch = reGetData

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

    const name = row.name
    const names = [name]
    if (typeFlag === 'php') {
      names.push(`${name}-fpm`, `${name}-mysql`, `${name}-apache2handler`, `${name}-iconv`)
    } else if (typeFlag === 'mysql') {
      names.push(`${name}-server`)
    } else if (typeFlag === 'mariadb') {
      names.push(`${name}-server`)
    } else if (typeFlag === 'python') {
      names.push(`${name.replace('python', 'py')}-pip`)
    }
    const params: string[] = []
    if (['php52', 'php53', 'php54', 'php55', 'php56'].includes(name) && fn === 'install') {
      const libs = names.join(' ')
      params.push(`sudo port clean -v ${libs}`)
      names.forEach((name) => {
        params.push(`sudo port install -v ${name} configure.compiler=macports-clang-10`)
      })
    } else {
      if (fn === 'uninstall') {
        fn = 'uninstall --follow-dependents'
      }
      const nameStr = names.join(' ')
      params.push(`sudo port clean -v ${nameStr}`)
      params.push(`sudo port ${fn} -v ${nameStr}`)
    }

    return params.join('\n')
  }

  const copyCommand = (row: any) => {
    const command = fetchCommand(row)
    clipboard.writeText(command)
    MessageSuccess(I18nT('base.copySuccess'))
  }

  const handleVersion = async (row: any) => {
    if (MacPortsSetup.installing) {
      return
    }
    MacPortsSetup.installing = true
    MacPortsSetup.installEnd = false
    let fn = ''
    if (row.installed) {
      fn = 'uninstall'
    } else {
      fn = 'install'
    }
    const arch = window.Server.isArmArch ? '-arm64' : '-x86_64'
    const name = row.name
    let params = []

    const names = [name]
    if (typeFlag === 'php') {
      names.push(`${name}-fpm`, `${name}-mysql`, `${name}-apache2handler`, `${name}-iconv`)
    } else if (typeFlag === 'mysql') {
      names.push(`${name}-server`)
    } else if (typeFlag === 'mariadb') {
      names.push(`${name}-server`)
    } else if (typeFlag === 'python') {
      names.push(`${name.replace('python', 'py')}-pip`)
    }
    if (['php52', 'php53', 'php54', 'php55', 'php56'].includes(name) && fn === 'install') {
      const sh = join(window.Server.Static!, 'sh/port-cmd-user.sh')
      const copyfile = join(window.Server.Cache!, 'port-cmd-user.sh')
      const exists = await fs.existsSync(copyfile)
      if (exists) {
        await fs.remove(copyfile)
      }
      const libs = names.join(' ')
      const arrs = [
        `echo "arch ${arch} sudo port clean -v ${libs}"`,
        `arch ${arch} sudo -S port clean -v ${libs}`
      ]
      names.forEach((name) => {
        arrs.push(
          `echo "arch ${arch} sudo port install -v ${name} configure.compiler=macports-clang-10"`
        )
        arrs.push(
          `arch ${arch} sudo -S port install -v ${name} configure.compiler=macports-clang-10`
        )
      })
      arrs.unshift(`arch ${arch} sudo -S port -f deactivate libuuid`)
      let content = await fs.readFile(sh)
      content = content.replace('##CONTENT##', arrs.join('\n'))
      await fs.writeFile(copyfile, content)
      await fs.chmod(copyfile, '0777')
      params = [`sudo -S "${copyfile}"`]
    } else {
      const sh = join(window.Server.Static!, 'sh/port-cmd.sh')
      const copyfile = join(window.Server.Cache!, 'port-cmd.sh')
      const exists = await fs.existsSync(copyfile)
      if (exists) {
        await fs.remove(copyfile)
      }
      if (fn === 'uninstall') {
        fn = 'uninstall --follow-dependents'
      }
      let content = await fs.readFile(sh)
      content = content
        .replace(new RegExp('##ARCH##', 'g'), arch)
        .replace(new RegExp('##ACTION##', 'g'), fn)
        .replace(new RegExp('##NAME##', 'g'), names.join(' '))
      await fs.writeFile(copyfile, content)
      await fs.chmod(copyfile, '0777')
      params = [`sudo -S "${copyfile}"`]
    }
    if (proxyStr?.value) {
      params.unshift(proxyStr?.value)
    }

    await nextTick()
    const execXTerm = new XTerm()
    MacPortsSetup.xterm = execXTerm
    await execXTerm.mount(xtermDom.value!)
    await execXTerm.send(params)
    MacPortsSetup.installEnd = true
    regetInstalled()
  }

  const tableData = computed(() => {
    const arr = []
    const list = brewStore.module(typeFlag).port
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
    arr.sort((a: any, b: any) => compareVersions(b.version, a.version))
    return arr
  })

  const xtermDom = ref<HTMLElement>()

  getData()

  watch(checkMacPorts, (v, ov) => {
    if (!ov && v) {
      getData()
    }
  })

  onMounted(() => {
    if (MacPortsSetup.installing) {
      nextTick().then(() => {
        const execXTerm: XTerm = MacPortsSetup.xterm as any
        if (execXTerm && xtermDom.value) {
          execXTerm.mount(xtermDom.value).then().catch()
        }
      })
    }
  })

  onUnmounted(() => {
    MacPortsSetup?.xterm?.unmounted?.()
  })

  return {
    handleVersion,
    tableData,
    checkMacPorts,
    reGetData,
    fetching,
    xtermDom,
    fetchCommand,
    copyCommand
  }
}
