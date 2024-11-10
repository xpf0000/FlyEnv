import { reactive } from 'vue'
import { MessageSuccess } from '@/util/Element'
import { I18nT } from '@shared/lang'

const store = reactive({
  bits: 2048,
  publicKeyPem: '',
  privateKeyPem: '',
  timer: undefined,
  debounce: 350,
  async generateKeyPair() {
    this.privateKeyPem = ''
    this.publicKeyPem = ''
    if (this.timer) {
      clearTimeout(this.timer)
    }
    this.timer = setTimeout(async () => {
      try {
        this.privateKeyPem = '...'
        this.publicKeyPem = '...'
      } catch (e) {}
      this.timer = undefined
    }, this.debounce) as any
  },
  copyPublicKey() {
    MessageSuccess(I18nT('base.success'))
  },
  copyPrivateKey() {
    MessageSuccess(I18nT('base.success'))
  }
})

export default store
