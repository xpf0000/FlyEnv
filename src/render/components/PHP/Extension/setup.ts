import { computed, reactive, ref, Ref } from 'vue'
import { type SoftInstalled } from '@/store/brew'
import { BrewSetup } from '@/components/PHP/Extension/Homebrew/setup'
import { execAsync } from '@shared/utils'
import { getAllFile } from '@shared/file'
import { LoadedSetup } from '@/components/PHP/Extension/Loaded/setup'
import { MacPortsSetup } from '@/components/PHP/Extension/Macports/setup'

const { join } = require('path')
const { shell } = require('@electron/remote')

export const ExtensionSetup = reactive<{
  dir: Partial<Record<string, string>>
  dirFile: Partial<Record<string, string[]>>
  reFetch: () => void
}>({
  dir: {},
  dirFile: {},
  reFetch: () => 0
})

export const Setup = (version: SoftInstalled) => {
  const lib: Ref<'phpwebstudy' | 'macports' | 'homebrew' | 'loaded'> = ref('loaded')

  const showFooter = computed(() => {
    if (lib.value === 'homebrew') {
      return BrewSetup.installing
    }
    if (lib.value === 'macports') {
      return MacPortsSetup.installing
    }
    return false
  })

  const taskEnd = computed(() => {
    if (lib.value === 'homebrew') {
      return BrewSetup.installEnd
    }
    if (lib.value === 'macports') {
      return MacPortsSetup.installEnd
    }
    return false
  })

  const taskConfirm = () => {
    if (lib.value === 'homebrew') {
      BrewSetup.installing = false
      BrewSetup.installEnd = false
      BrewSetup.xterm?.destory()
      delete BrewSetup.xterm
      return
    }

    if (lib.value === 'macports') {
      MacPortsSetup.installing = false
      MacPortsSetup.installEnd = false
      MacPortsSetup.xterm?.destory()
      delete MacPortsSetup.xterm
      return
    }
  }

  const taskCancel = () => {
    if (lib.value === 'homebrew') {
      BrewSetup.installing = false
      BrewSetup.installEnd = false
      BrewSetup.xterm?.stop()?.then(() => {
        BrewSetup.xterm?.destory()
        delete BrewSetup.xterm
      })
      return
    }

    if (lib.value === 'macports') {
      MacPortsSetup.installing = false
      MacPortsSetup.installEnd = false
      MacPortsSetup.xterm?.stop()?.then(() => {
        MacPortsSetup.xterm?.destory()
        delete MacPortsSetup.xterm
      })
      return
    }
  }

  const loading = computed(() => {
    if (lib.value === 'homebrew') {
      return BrewSetup.fetching[version.bin] || BrewSetup.installing
    }
    if (lib.value === 'loaded') {
      return LoadedSetup.fetching[version.bin]
    }
    if (lib.value === 'macports') {
      return MacPortsSetup.fetching[version.bin] || MacPortsSetup.installing
    }
    return false
  })

  const extensionDir = computed(() => {
    return ExtensionSetup.dir?.[version.bin]
  })

  const fetchLocal = () => {
    const fetchFile = (dir: string) => {
      let all = getAllFile(dir, false)
      all = all.filter((s) => {
        return s.indexOf('.so') >= 0 || s.indexOf('.dar') >= 0
      })
      ExtensionSetup.dirFile[version.bin] = reactive(all)
    }
    if (ExtensionSetup.dir?.[version.bin]) {
      fetchFile(ExtensionSetup.dir[version.bin]!)
    } else {
      if (version?.version) {
        const pkconfig = version?.phpConfig ?? join(version?.path, 'bin/php-config')
        execAsync(pkconfig, ['--extension-dir']).then((res: string) => {
          const dir = res
          ExtensionSetup.dir[version.bin] = dir
          fetchFile(dir)
        })
      }
    }
  }

  ExtensionSetup.reFetch = fetchLocal

  const reFetch = () => {
    fetchLocal()
    if (lib.value === 'homebrew') {
      console.log('reFetch brew !!!')
      BrewSetup.reFetch()
    }
    if (lib.value === 'loaded') {
      console.log('reFetch brew !!!')
      LoadedSetup.reFetch()
    }
    if (lib.value === 'macports') {
      console.log('reFetch port !!!', MacPortsSetup.reFetch)
      MacPortsSetup.reFetch()
    }
  }

  const openDir = () => {
    if (extensionDir.value) {
      shell.openPath(extensionDir.value).then().catch()
    }
  }

  fetchLocal()

  return {
    lib,
    showFooter,
    taskEnd,
    taskConfirm,
    taskCancel,
    loading,
    reFetch,
    extensionDir,
    openDir
  }
}
