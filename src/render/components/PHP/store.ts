import { reactive } from 'vue'
import { SoftInstalled } from '@shared/app'
import IPC from '@/util/IPC'
import { MessageError } from '@/util/Element'

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
  localUsed: Partial<Record<string, string[]>>
  libExtend: Partial<Record<string, PHPExtendLib[]>>
  localFetching: Partial<Record<string, boolean>>
  libFetching: Partial<Record<string, boolean>>
  fetchLocal: (item: SoftInstalled) => void
  fetchLib: (item: SoftInstalled) => void
  fetchExtensionDir: (item: SoftInstalled) => Promise<string>
}>({
  localExtend: {},
  localUsed: {},
  libExtend: {},
  localFetching: {},
  libFetching: {},
  fetchExtensionDir(item: SoftInstalled) {
    return new Promise((resolve) => {
      IPC.send('app-fork:php', 'fetchLocalExtend').then((key: string, res: any) => {
        IPC.off(key)
        resolve(res?.data ?? '')
      })
    })
  },
  fetchLocal(item: SoftInstalled) {
    if (this.localFetching[item.bin]) {
      return
    }
    this.localFetching[item.bin] = true
    IPC.send('app-fork:php', 'fetchLocalExtend').then((key: string, res: any) => {
      IPC.off(key)
      this.localUsed[item.bin] = reactive(res?.data?.used ?? [])
      this.localExtend[item.bin] = reactive(res?.data?.local ?? [])
      if (res?.code === 1) {
        MessageError(res?.msg)
        delete this.localFetching[item.bin]
      }
    })
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
            expire: Math.round(new Date().getTime() / 1000) + 12 * 60 * 60,
            data: this.libExtend[item.bin]
          })
        )
      }
      if (res?.code === 1) {
        MessageError(res?.msg)
        delete this.libFetching[item.bin]
      }
    })
  }
})
