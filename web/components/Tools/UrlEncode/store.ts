import { reactive } from 'vue'
import { MessageSuccess } from '@/util/Element'
import { I18nT } from '@shared/lang'

const store = reactive({
  encodeInput: 'Hello world :)',
  encodeOutput: '',
  doEncode() {
    this.encodeOutput = encodeURIComponent(this.encodeInput)
  },
  copyEncode() {
    MessageSuccess(I18nT('base.success'))
  },
  decodeInput: 'Hello%20world%20%3A)',
  decodeOutput: '',
  doDecode() {
    this.decodeOutput = decodeURIComponent(this.decodeInput)
  },
  copyDecode() {
    MessageSuccess(I18nT('base.success'))
  }
})

export default store
