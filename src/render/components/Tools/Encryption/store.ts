import { reactive } from 'vue'
import { AES, RC4, Rabbit, TripleDES, enc } from 'crypto-js'

const store = reactive({
  algos: { AES, TripleDES, Rabbit, RC4 },
  cypherInput: 'Lorem ipsum dolor sit amet',
  cypherAlgo: 'AES',
  cypherSecret: 'my secret key',
  cypherOutput() {
    const algos: any = this.algos
    return algos[this.cypherAlgo].encrypt(this.cypherInput, this.cypherSecret).toString()
  },
  decryptInput: 'U2FsdGVkX1/EC3+6P5dbbkZ3e1kQ5o2yzuU0NHTjmrKnLBEwreV489Kr0DIB+uBs',
  decryptAlgo: 'AES',
  decryptSecret: 'my secret key',
  decryptOutput() {
    const algos: any = this.algos
    let value: string = ''
    try {
      value = algos[this.decryptAlgo]
        .decrypt(this.decryptInput, this.decryptSecret)
        .toString(enc.Utf8)
    } catch (e) {}
    return value
  }
})

export default store
