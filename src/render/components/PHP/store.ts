import { reactive } from 'vue'
import { SoftInstalled } from '@shared/app'
import IPC from '@/util/IPC'
import { MessageError, MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'
import { LoadedSetup } from '@/components/PHP/Extension/Loaded/setup'

export type PHPExtendLocal = {
  name: string
  iniStr: string
}

export type PHPExtendLib = {
  name: string
  url: string
}

export const PHPSetup = reactive<{
  localExtend: Partial<Record<string, PHPExtendLocal[]>>
  localUsed: Partial<Record<string, PHPExtendLocal[]>>
  libExtend: Partial<Record<string, PHPExtendLib[]>>
  localFetching: Partial<Record<string, boolean>>
  libFetching: Partial<Record<string, boolean>>
  localExecing: Partial<Record<string, boolean>>
  libExecing: Partial<Record<string, boolean>>
  fetchLocal: (item: SoftInstalled) => void
  fetchLib: (item: SoftInstalled) => void
  fetchExtensionDir: (item: SoftInstalled) => Promise<string>
  localExec: (item: PHPExtendLocal, version: SoftInstalled) => void
  libExec: (item: PHPExtendLocal, version: SoftInstalled) => void
}>({
  localExtend: {},
  localUsed: {},
  libExtend: {},
  localFetching: {},
  localExecing: {},
  libExecing: {},
  libFetching: {},
  localExec(item: PHPExtendLocal, version: SoftInstalled) {
    if (this.localExecing[item.name]) {
      return
    }
    this.localExecing[item.name] = true
    IPC.send(
      'app-fork:php',
      'localExec',
      JSON.parse(JSON.stringify(item)),
      JSON.parse(JSON.stringify(version))
    ).then((key: string, res: any) => {
      if (res?.code === 0) {
        IPC.off(key)
        this.localUsed[version.bin] = reactive(res?.data?.used ?? [])
        this.localExtend[version.bin] = reactive(res?.data?.local ?? [])
        delete this.localExecing[item.name]
        LoadedSetup.reFetch()
        MessageSuccess(I18nT('base.success'))
      } else if (res?.code === 1) {
        IPC.off(key)
        MessageError(res?.msg)
        delete this.localExecing[item.name]
      }
    })
  },
  fetchExtensionDir(item: SoftInstalled) {
    return new Promise((resolve) => {
      IPC.send('app-fork:php', 'fetchExtensionDir', JSON.parse(JSON.stringify(item))).then(
        (key: string, res: any) => {
          IPC.off(key)
          resolve(res?.data ?? '')
        }
      )
    })
  },
  fetchLocal(item: SoftInstalled) {
    if (this.localFetching[item.bin]) {
      return
    }
    this.localFetching[item.bin] = true
    IPC.send('app-fork:php', 'fetchLocalExtend', JSON.parse(JSON.stringify(item))).then(
      (key: string, res: any) => {
        if (res?.code === 0) {
          IPC.off(key)
          this.localUsed[item.bin] = reactive(res?.data?.used ?? [])
          this.localExtend[item.bin] = reactive(res?.data?.local ?? [])
          delete this.localFetching[item.bin]
        } else if (res?.code === 1) {
          IPC.off(key)
          MessageError(res?.msg)
          delete this.localFetching[item.bin]
        }
      }
    )
  },
  fetchLib(item: SoftInstalled) {
    if (this.libFetching[item.bin]) {
      return
    }
    this.libFetching[item.bin] = true

    const saveKey = `flyenv-php-extend`
    let saved: any = localStorage.getItem(saveKey)
    if (saved) {
      saved = JSON.parse(saved)
      const time = Math.round(new Date().getTime() / 1000)
      if (time < saved.expire) {
        this.libExtend[item.bin] = [...saved.data]
        delete this.libFetching[item.bin]
        return
      }
    }

    IPC.send('app-fork:php', 'fetchLibExtend').then((key: string, res: any) => {
      IPC.off(key)
      this.libExtend[item.bin] = reactive(res?.data ?? [])
      if (this.libExtend[item.bin]!.length > 0) {
        localStorage.setItem(
          saveKey,
          JSON.stringify({
            expire: Math.round(new Date().getTime() / 1000) + 24 * 60 * 60,
            data: this.libExtend[item.bin]
          })
        )
      }
      if (res?.code === 1) {
        MessageError(res?.msg)
      }
      delete this.libFetching[item.bin]
    })
  },
  libExec(item: PHPExtendLocal, version: SoftInstalled) {
    if (this.libExecing[item.name]) {
      return
    }
    this.libExecing[item.name] = true
    IPC.send(
      'app-fork:php',
      'libExec',
      JSON.parse(JSON.stringify(item)),
      JSON.parse(JSON.stringify(version))
    ).then((key: string, res: any) => {
      if (res?.code === 0) {
        IPC.off(key)
        this.localUsed[version.bin] = reactive(res?.data?.used ?? [])
        this.localExtend[version.bin] = reactive(res?.data?.local ?? [])
        delete this.libExecing[item.name]
        LoadedSetup.reFetch()
        MessageSuccess(I18nT('base.success'))
      } else if (res?.code === 1) {
        IPC.off(key)
        MessageError(res?.msg)
        delete this.libExecing[item.name]
      }
    })
  }
})
