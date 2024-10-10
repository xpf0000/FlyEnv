import { reactive } from 'vue'
import { shuffleString } from '@shared/random'
import { MessageSuccess } from '@/util/Element'
import { I18nT } from '@shared/lang'

const { clipboard } = require('@electron/remote')

type StoreType = {
  withUppercase?: boolean
  withLowercase?: boolean
  withNumbers?: boolean
  withSymbols?: boolean
  length?: number
  alphabet?: string
}

const store = reactive({
  length: 64,
  withUppercase: true,
  withLowercase: true,
  withNumbers: true,
  withSymbols: false,
  token: '',
  copy() {
    clipboard.writeText(this.token)
    MessageSuccess(I18nT('token-generator.copied'))
  },
  refreshToken() {
    this.createToken()
  },
  createToken() {
    const {
      withUppercase = true,
      withLowercase = true,
      withNumbers = true,
      withSymbols = false,
      length = 64,
      alphabet
    }: StoreType = this
    const allAlphabet =
      alphabet ??
      [
        withUppercase ? 'ABCDEFGHIJKLMOPQRSTUVWXYZ' : '',
        withLowercase ? 'abcdefghijklmopqrstuvwxyz' : '',
        withNumbers ? '0123456789' : '',
        withSymbols ? '.,;:!?./-"\'#{([-|\\@)]=}*+' : ''
      ].join('')

    this.token = shuffleString(allAlphabet.repeat(length)).substring(0, length)
  }
})
export default store
