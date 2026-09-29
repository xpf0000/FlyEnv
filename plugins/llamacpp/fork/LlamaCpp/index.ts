import { Base } from '@fork/module/Base'
import type { SoftInstalled } from '@shared/app'
import { ForkPromise } from '@shared/ForkPromise'

class LlamaCpp extends Base {
  constructor() {
    super()
    this.type = 'llama-cpp'
  }

  _startServer(_version: SoftInstalled) {
    return new ForkPromise((_, reject) => {
      reject(new Error('Select a llama.cpp runtime and model before starting the server'))
    })
  }
}

export default new LlamaCpp()
