import { reactive } from 'vue'
import { MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'
import { escape, unescape } from 'lodash-es'
import { clipboard } from '@/util/NodeFn'

const store = reactive({
  encodeInput: '<title>PhpWebStudy</title>',
  encodeOutput: '',
  doEncode() {
    this.encodeOutput = escape(this.encodeInput)
  },
  copyEncode() {
    clipboard.writeText(this.encodeOutput)
    MessageSuccess(I18nT('base.success'))
  },
  decodeInput: '&lt;title&gt;PhpWebStudy&lt;/title&gt;',
  decodeOutput: '',
  doDecode() {
    this.decodeOutput = unescape(this.decodeInput)
  },
  copyDecode() {
    clipboard.writeText(this.decodeOutput)
    MessageSuccess(I18nT('base.success'))
  }
})

export default store
