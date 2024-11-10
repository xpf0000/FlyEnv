import { reactive } from 'vue'
import { MessageSuccess } from '@/util/Element'
import { I18nT } from '@shared/lang'
import { escape, unescape } from 'lodash'

const store = reactive({
  encodeInput: '<title>PhpWebStudy</title>',
  encodeOutput: '',
  doEncode() {
    this.encodeOutput = escape(this.encodeInput)
  },
  copyEncode() {
    MessageSuccess(I18nT('base.success'))
  },
  decodeInput: '&lt;title&gt;PhpWebStudy&lt;/title&gt;',
  decodeOutput: '',
  doDecode() {
    this.decodeOutput = unescape(this.decodeInput)
  },
  copyDecode() {
    MessageSuccess(I18nT('base.success'))
  }
})

export default store
