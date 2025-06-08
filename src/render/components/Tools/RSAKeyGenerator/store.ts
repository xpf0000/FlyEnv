import { reactive } from 'vue'
import { MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'
import { clipboard, nodeForge } from '@/util/NodeFn'

function generateRawPairs({ bits = 2048 }) {
  return new Promise<{ privateKey: string; publicKey: string }>((resolve, reject) => {
    if (bits % 8 !== 0 || bits < 256 || bits > 16384) {
      reject(new Error('Bits should be 256 <= bits <= 16384 and be a multiple of 8'))
      return
    }
    nodeForge
      .rsaGenerateKeyPair({ bits, workers: 2 })
      .then((keyPair: { privateKey: string; publicKey: string }) => {
        resolve(keyPair)
      })
      .catch((err) => {
        reject(err)
      })
  })
}

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
        const { privateKey, publicKey } = await generateRawPairs({ bits: this.bits })
        this.privateKeyPem = await nodeForge.privateKeyToPem(privateKey)
        this.publicKeyPem = await nodeForge.publicKeyToPem(publicKey)
      } catch {
        /* empty */
      }
      this.timer = undefined
    }, this.debounce) as any
  },
  copyPublicKey() {
    clipboard.writeText(this.publicKeyPem)
    MessageSuccess(I18nT('base.success'))
  },
  copyPrivateKey() {
    clipboard.writeText(this.privateKeyPem)
    MessageSuccess(I18nT('base.success'))
  }
})

export default store
