import { computed, ref } from 'vue'
import type { SoftInstalled } from '@/store/brew'
import IPC from '@/util/IPC'
import { MessageError, MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'
import Base from '@/core/Base'
import { ExtensionSetup } from '@/components/PHP/Extension/setup'
import { join } from '@/util/path-browserify'
import { clipboard, fs } from '@/util/NodeFn'

import { BrewExtensionCatalog as BrewSetup, fetchHomebrewExtensions } from './Catalog'
import { copyHomebrewExtension } from './ExtensionPackage'
import { homebrewUpgrade } from '@/components/VersionManager/brew/Controller'
export { BrewSetup }

export const Setup = (version: SoftInstalled) => {
  const search = ref('')

  const fetching = computed(() => {
    return BrewSetup.fetching?.[version.bin] ?? false
  })

  const fetchData = () => fetchHomebrewExtensions(version).catch(() => {})
  const reGetData = () => fetchHomebrewExtensions(version, true).catch(() => {})
  BrewSetup.reFetch = reGetData

  const handleEdit = (row: any) => {
    const request = { name: String(row.libName), installed: !!row.status, typeFlag: 'php' }
    const selected = { bin: version.bin, version: version.version }
    const extensionDir = ExtensionSetup.dir[version.bin] ?? ''
    return homebrewUpgrade
      .package(request, {
        afterPackage: async (result) => {
          if (!request.installed)
            await copyHomebrewExtension(result, request.name, extensionDir, fs)
          ExtensionSetup.dirFile[selected.bin] = await fs.readdir(extensionDir)
          await fetchHomebrewExtensions(selected, true)
        }
      })
      .catch(() => {})
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

  fetchData()

  return {
    handleEdit,
    tableData,
    reGetData,
    fetching,
    copyLink,
    copyXDebugTmpl,
    search,
    doDel
  }
}
