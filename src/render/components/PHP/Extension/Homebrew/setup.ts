import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { AppStore } from '@/store/app'
import { SoftInstalled } from '@/store/brew'
import XTerm from '@/util/XTerm'
import IPC from '@/util/IPC'
import { MessageError, MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'
import Base from '@/core/Base'
import { ExtensionSetup } from '@/components/PHP/Extension/setup'
import { join, basename } from '@/util/path-browserify'
import { clipboard, fs } from '@/util/NodeFn'

export const BrewSetup = reactive<{
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
    return BrewSetup.fetching?.[version.bin] ?? false
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
    if (fetching.value || BrewSetup?.list?.[version.bin]) {
      return
    }
    BrewSetup.fetching[version.bin] = true
    IPC.send('app-fork:brew', 'fetchAllPhpExtensions', versionNumber.value).then(
      (key: string, res: any) => {
        IPC.off(key)
        if (res?.data) {
          BrewSetup.list[version.bin] = res.data
        }
        BrewSetup.fetching[version.bin] = false
      }
    )
  }

  const reGetData = () => {
    console.log('reGetData !!!')
    delete BrewSetup?.list?.[version.bin]
    delete BrewSetup.fetching?.[version.bin]
    fetchData()
  }

  BrewSetup.reFetch = reGetData

  const handleEdit = async (row: any) => {
    if (BrewSetup.installing) {
      return
    }
    BrewSetup.installing = true
    BrewSetup.installEnd = false
    const fn = row?.status ? 'uninstall' : 'install'
    const arch = window.Server.isArmArch ? '-arm64' : '-x86_64'
    const name = row.libName
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

    const extensionDir = ExtensionSetup.dir?.[version.bin] ?? ''
    const baseDir = row.libName.split('/').pop()
    const dir = join(window.Server.BrewCellar!, baseDir)
    const allFile = await fs.readdir(dir)
    const so = allFile.filter((f) => f.endsWith('.so')).pop()
    if (so) {
      const destSo = join(extensionDir, basename(so))
      await fs.mkdirp(extensionDir)
      await fs.copyFile(so, destSo)
    }
    ExtensionSetup.reFetch()
    reGetData()
    BrewSetup.installEnd = true
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
    const list = BrewSetup.list?.[version.bin] ?? []
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
    const output_dir = join(window.Server.PhpDir!, 'xdebug')
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
    Base._Confirm(I18nT('base.areYouSure'), undefined, {
      customClass: 'confirm-del',
      type: 'warning'
    })
      .then(async () => {
        console.log('row: ', row)
        const dir = ExtensionSetup.dir[version.bin]!
        const soPath = join(dir, row.soname)
        const exists = await fs.existsSync(soPath)
        if (soPath && exists) {
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
    BrewSetup.xterm?.unmounted()
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
