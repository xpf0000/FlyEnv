import { reactive } from 'vue'
import { I18nT } from '@lang/index'
import { StorageSetAsync, StorageGetAsync } from '@/util/Storage'

export const currentTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

const base = reactive({
  id: '',
  dir: '',
  name: '',
  flag: '',
  comment: '',
  mirror: '',
  mirrors: [],
  check() {
    if (!this.name) {
      return I18nT('base.name') + I18nT('podman.require')
    }
    if (!this.dir) {
      return I18nT('podman.ComposeFileSaveDir') + I18nT('podman.require')
    }
    const regex = /^[a-z0-9][a-z0-9_-]*$/
    if (!regex.test(base.flag)) {
      return I18nT('podman.ComposeNameErrorTips')
    }
    return ''
  },
  mirrorHost() {
    let mirror = this.mirror.trim()
    if (!mirror) {
      return ''
    }
    if (!mirror.includes('http')) {
      mirror = `https://${mirror}`
    }
    const url = new URL(mirror)
    return `${url.host}/`
  },
  initMirrors() {
    const storeKey = 'flyenv-podman-mirrors'
    StorageGetAsync<string[]>(storeKey).then((res) => {
      const mirrors: string[] = this.mirrors as any
      mirrors.splice(0)
      mirrors.push(...res)
    })
  },
  saveMirrors() {
    if (this.mirror.trim()) {
      const mirrors = Array.from(new Set([this.mirror.trim(), ...this.mirrors])).slice(0, 10)
      const storeKey = 'flyenv-podman-mirrors'
      StorageSetAsync(storeKey, mirrors).catch()
    }
  }
})
base.initMirrors()
export default base
