import { reactive } from 'vue'
import { I18nT } from '@lang/index'

export const currentTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

const base = reactive({
  id: '',
  dir: '',
  name: '',
  flag: '',
  comment: '',
  mirror: '',
  check() {
    if (!this.name) {
      return I18nT('base.name') + I18nT('podman.require')
    }
    if (!this.dir) {
      return I18nT('podman.ComposeFileSaveDir') + I18nT('podman.require')
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
  }
})

export default base
