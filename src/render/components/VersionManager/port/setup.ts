import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { AppStore } from '@/store/app'
import { BrewStore } from '@/store/brew'
import XTerm from '@/util/XTerm'
import IPC from '@/util/IPC'
import type { AllAppModule } from '@/core/type'
import installedVersions from '@/util/InstalledVersions'
import { portInfo } from '@/util/Brew'
import { chmod } from '@shared/file'
import { MessageSuccess } from '@/util/Element'
import { I18nT } from '@shared/lang'

const { clipboard } = require('@electron/remote')
const { join } = require('path')
const { existsSync, unlinkSync, readFileSync, writeFileSync } = require('fs')

export const MacPortsSetup = reactive<{
  installEnd: boolean
  installing: boolean
  fetching: Partial<Record<AllAppModule, boolean>>
  xterm: XTerm | undefined
  checkMacPorts: () => void
  reFetch: () => void
}>({
  installEnd: false,
  installing: false,
  fetching: {},
  xterm: undefined,
  reFetch: () => 0,
  checkMacPorts() {
    if (!global.Server.MacPorts) {
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
    return !!global.Server.MacPorts
  })

  const fetching = computed(() => {
    return MacPortsSetup.fetching?.[typeFlag] ?? false
  })

  const fetchData = (src: 'port') => {
    if (fetching.value) {
      return
    }
    MacPortsSetup.fetching[typeFlag] = true
    const currentItem = brewStore.module(typeFlag)
    const list = currentItem.list?.[src] ?? {}
    portInfo(typeFlag)
      .then((res: any) => {
        for (const k in list) {
          delete list?.[k]
        }
        for (const name in res) {
          list[name] = reactive(res[name])
        }
        MacPortsSetup.fetching[typeFlag] = false
      })
      .catch(() => {
        MacPortsSetup.fetching[typeFlag] = false
      })
  }
  const getData = () => {
    if (!checkMacPorts.value || fetching.value) {
      console.log('getData exit: ', checkMacPorts.value, fetching.value)
      return
    }
    const currentItem = brewStore.module(typeFlag)
    const src = 'port'
    const list = currentItem.list?.[src]
    if (list && Object.keys(list).length === 0) {
      fetchData(src)
    }
  }

  const reGetData = () => {
    console.log('reGetData !!!')
    const list = brewStore.module(typeFlag).list?.['port']
    for (const k in list) {
      delete list[k]
    }
    getData()
  }

  MacPortsSetup.reFetch = reGetData

  const regetInstalled = () => {
    reGetData()
    brewStore.module(typeFlag).installedInited = false
    installedVersions.allInstalledVersions([typeFlag]).then()
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
    const arch = global.Server.isAppleSilicon ? '-arm64' : '-x86_64'
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
      const sh = join(global.Server.Static!, 'sh/port-cmd-user.sh')
      const copyfile = join(global.Server.Cache!, 'port-cmd-user.sh')
      if (existsSync(copyfile)) {
        unlinkSync(copyfile)
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
      let content = readFileSync(sh, 'utf-8')
      content = content.replace('##CONTENT##', arrs.join('\n'))
      writeFileSync(copyfile, content)
      chmod(copyfile, '0777')
      params = [`sudo -S "${copyfile}"`]
    } else {
      const sh = join(global.Server.Static!, 'sh/port-cmd.sh')
      const copyfile = join(global.Server.Cache!, 'port-cmd.sh')
      if (existsSync(copyfile)) {
        unlinkSync(copyfile)
      }
      if (fn === 'uninstall') {
        fn = 'uninstall --follow-dependents'
      }
      let content = readFileSync(sh, 'utf-8')
      content = content
        .replace(new RegExp('##PASSWORD##', 'g'), global.Server.Password!)
        .replace(new RegExp('##ARCH##', 'g'), arch)
        .replace(new RegExp('##ACTION##', 'g'), fn)
        .replace(new RegExp('##NAME##', 'g'), names.join(' '))
      writeFileSync(copyfile, content)
      chmod(copyfile, '0777')
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
    const list = brewStore.module(typeFlag).list?.['port']
    for (const name in list) {
      const value = list[name]
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
        name,
        version: value.version,
        installed: value.installed,
        num,
        flag: value.flag
      })
      arr.push(value)
    }
    arr.sort((a, b) => {
      return b.num - a.num
    })
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
    MacPortsSetup.xterm && MacPortsSetup.xterm.unmounted()
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
