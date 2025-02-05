import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { AppStore } from '@/store/app'
import { SoftInstalled } from '@/store/brew'
import XTerm from '@/util/XTerm'
import IPC from '@/util/IPC'
import { MessageError, MessageSuccess } from '@/util/Element'
import { I18nT } from '@shared/lang'
import Base from '@/core/Base'
import { ExtensionSetup } from '@/components/PHP/Extension/setup'

const { clipboard } = require('@electron/remote')
const { join } = require('path')
const { existsSync, unlinkSync, readFileSync, writeFileSync } = require('fs')
const { chmod } = require('fs-extra')

export const MacPortsSetup = reactive<{
  installEnd: boolean
  installing: boolean
  list: { [k: string]: any }
  fetching: Partial<Record<string, boolean>>
  xterm: XTerm | undefined
  reFetch: () => void
}>({
  installEnd: false,
  installing: false,
  fetching: {},
  list: {},
  xterm: undefined,
  reFetch: () => 0
})

export const Setup = (version: SoftInstalled) => {
  const appStore = AppStore()
  const search = ref('')

  const proxy = computed(() => {
    return appStore.config.setup.proxy
  })
  const proxyStr = computed(() => {
    if (!proxy?.value.on) {
      return undefined
    }
    return proxy?.value?.proxy
  })

  const fetching = computed(() => {
    return MacPortsSetup.fetching?.[version.bin] ?? false
  })

  const versionNumber = computed(() => {
    if (version?.version) {
      const versionNums: any = version?.version.split('.')
      versionNums.splice(2)
      return versionNums.join('.')
    }
    return 0
  })

  const fetchData = () => {
    if (fetching.value || MacPortsSetup?.list?.[version.bin]) {
      return
    }
    MacPortsSetup.fetching[version.bin] = true
    IPC.send('app-fork:brew', 'fetchAllPhpExtensionsByPort', versionNumber.value).then(
      (key: string, res: any) => {
        IPC.off(key)
        if (res?.data) {
          MacPortsSetup.list[version.bin] = res.data
        }
        MacPortsSetup.fetching[version.bin] = false
      }
    )
  }

  const reGetData = () => {
    console.log('reGetData !!!')
    delete MacPortsSetup?.list?.[version.bin]
    delete MacPortsSetup.fetching?.[version.bin]
    fetchData()
  }

  MacPortsSetup.reFetch = reGetData

  const handleEdit = async (row: any) => {
    if (MacPortsSetup.installing) {
      return
    }
    MacPortsSetup.installing = true
    MacPortsSetup.installEnd = false

    let fn = row?.status ? 'uninstall' : 'install'
    const arch = global.Server.isAppleSilicon ? '-arm64' : '-x86_64'
    const name = row.libName
    const params = []
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
      .replace(new RegExp('##ARCH##', 'g'), arch)
      .replace(new RegExp('##ACTION##', 'g'), fn)
      .replace(new RegExp('##NAME##', 'g'), name)
    writeFileSync(copyfile, content)
    await chmod(copyfile, '0777')
    params.push(`sudo -S "${copyfile}"`)

    if (proxyStr?.value) {
      params.unshift(proxyStr?.value)
    }
    await nextTick()
    const execXTerm = new XTerm()
    MacPortsSetup.xterm = execXTerm
    await execXTerm.mount(xtermDom.value!)
    await execXTerm.send(params)

    IPC.send(
      'app-fork:php',
      'extensionIni',
      JSON.parse(JSON.stringify(row)),
      JSON.parse(JSON.stringify(version))
    ).then((key: string) => {
      IPC.off(key)
      MacPortsSetup.installEnd = true
    })
    ExtensionSetup.reFetch()
    reGetData()
  }

  const tableData = computed(() => {
    const sortName = (a: any, b: any) => {
      return a.name - b.name
    }
    const sortStatus = (a: any, b: any) => {
      if (a.status === b.status) {
        return 0
      }
      if (a.status) {
        return -1
      }
      if (b.status) {
        return 1
      }
      return 0
    }
    const dir = ExtensionSetup.dir?.[version.bin] ?? ''
    const dirFile = ExtensionSetup.dirFile?.[version.bin] ?? []
    const map = (i: any) => {
      const item = { ...i }
      item.installed = dirFile.indexOf(item.soname) >= 0
      item.status = item.installed
      item.soPath = join(dir, item.soname)
      return item
    }
    const list = MacPortsSetup.list?.[version.bin] ?? []
    if (!search.value) {
      return Array.from(list).map(map).sort(sortName).sort(sortStatus)
    }
    return list
      .filter((d: any) => {
        const dl = d.name.toLowerCase()
        const sl = search.value.trim().toLowerCase()
        return dl.includes(sl) || sl.includes(dl)
      })
      .map(map)
      .sort(sortName)
      .sort(sortStatus)
  })

  const copyLink = (row: any) => {
    const pre = row?.extendPre ?? 'extension='
    const txt = `${pre}${row.soname}`
    clipboard.writeText(txt)
    MessageSuccess(I18nT('php.extensionCopySuccess'))
  }

  const copyXDebugTmpl = (row: any) => {
    const output_dir = join(global.Server.PhpDir!, 'xdebug')
    const txt = `zend_extension = "${row.soname}"
;[FlyEnv-xdebug-ini-begin]
[xdebug]
xdebug.idekey = "PHPSTORM"
xdebug.client_host = localhost
xdebug.client_port = 9003
xdebug.mode = debug
xdebug.profiler_append = 0
xdebug.profiler_output_name = cachegrind.out.%p
xdebug.start_with_request = yes
xdebug.trigger_value=StartProfileForMe
xdebug.output_dir = "${output_dir}"
;[FlyEnv-xdebug-ini-end]`
    clipboard.writeText(txt)
    MessageSuccess(I18nT('php.xdebugConfCopySuccess'))
  }

  const doDel = (row: any) => {
    Base._Confirm(I18nT('base.delAlertContent'), undefined, {
      customClass: 'confirm-del',
      type: 'warning'
    })
      .then(() => {
        console.log('row: ', row)
        const dir = ExtensionSetup.dir[version.bin]!
        const soPath = join(dir, row.soname)
        if (soPath && existsSync(soPath)) {
          IPC.send('app-fork:php', 'unInstallExtends', soPath).then((key: string, res: any) => {
            IPC.off(key)
            if (res.code === 0) {
              const dirFile = ExtensionSetup.dirFile?.[version.bin] ?? []
              const index = dirFile.findIndex((d) => d.includes(row.soname))
              if (index >= 0) {
                dirFile.splice(index, 1)
              }
            } else if (res.code === 1) {
              MessageError(res?.msg ?? I18nT('base.fail'))
            }
          })
        }
      })
      .catch(() => {})
  }

  const xtermDom = ref<HTMLElement>()

  fetchData()

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
    handleEdit,
    tableData,
    reGetData,
    fetching,
    xtermDom,
    copyLink,
    copyXDebugTmpl,
    search,
    doDel
  }
}
