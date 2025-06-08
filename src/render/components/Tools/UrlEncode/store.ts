import { reactive } from 'vue'
import { MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'
import { clipboard } from '@/util/NodeFn'

const store = reactive({
  encodeInput: 'Hello world :)',
  encodeOutput: '',
  doEncode() {
    this.encodeOutput = encodeURIComponent(this.encodeInput)
  },
  copyEncode() {
    clipboard.writeText(this.encodeOutput)
    MessageSuccess(I18nT('base.success'))
  },
  decodeInput: 'Hello%20world%20%3A)',
  decodeOutput: '',
  doDecode() {
    this.decodeOutput = decodeURIComponent(this.decodeInput)
  },
  copyDecode() {
    clipboard.writeText(this.decodeOutput)
    MessageSuccess(I18nT('base.success'))
  }
})

export default store
