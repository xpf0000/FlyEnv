import { reactive } from 'vue'
import { MessageSuccess } from '@/util/Element'
import { I18nT } from '@shared/lang'
import { escape, unescape } from 'lodash'

const { clipboard } = require('@electron/remote')

const store = reactive({
  encodeInput: '<title>PhpWebStudy</title>',
  encodeOutput: '',
  doEncode() {
    this.encodeOutput = escape(this.encodeInput)
  },
  copyEncode() {
    clipboard.writeText(this.encodeOutput)
    MessageSuccess(I18nT('token-generator.copied'))
  },
  decodeInput: '&lt;title&gt;PhpWebStudy&lt;/title&gt;',
  decodeOutput: '',
  doDecode() {
    this.decodeOutput = unescape(this.decodeInput)
  },
  copyDecode() {
    clipboard.writeText(this.decodeOutput)
    MessageSuccess(I18nT('token-generator.copied'))
  }
})

export default store
