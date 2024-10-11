import { reactive } from 'vue'
import { MessageSuccess } from '@/util/Element'
import { I18nT } from '@shared/lang'
import type { lib } from 'crypto-js'
import { MD5, RIPEMD160, SHA1, SHA224, SHA256, SHA3, SHA384, SHA512, enc } from 'crypto-js'

const { clipboard } = require('@electron/remote')

const convertHexToBin = (hex: string) => {
  return hex
    .trim()
    .split('')
    .map((byte) => Number.parseInt(byte, 16).toString(2).padStart(4, '0'))
    .join('')
}

const store = reactive({
  text: '',
  digest: 'Hex',
  algoList: {
    MD5,
    SHA1,
    SHA256,
    SHA224,
    SHA512,
    SHA384,
    SHA3,
    RIPEMD160
  },
  digestList: [
    {
      label: 'Binary (base 2)',
      value: 'Bin'
    },
    {
      label: 'Hexadecimal (base 16)',
      value: 'Hex'
    },
    {
      label: 'Base64 (base 64)',
      value: 'Base64'
    },
    {
      label: 'Base64url (base 64 with url safe chars)',
      value: 'Base64url'
    }
  ],
  hashText(algo: string) {
    console.log('hashText algo: ', algo)
    const algoList: any = this.algoList
    const value: lib.WordArray = algoList[algo](this.text)
    if (this.digest === 'Bin') {
      return convertHexToBin(value.toString(enc.Hex))
    }
    return value.toString(enc[this.digest])
  },
  copy(algo: string) {
    const value = this.hashText(algo)
    clipboard.writeText(value)
    MessageSuccess(I18nT('token-generator.copied'))
  }
})

export default store
