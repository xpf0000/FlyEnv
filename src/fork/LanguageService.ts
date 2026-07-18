import { applyLanguagePayload } from '@lang/runtime'
import {
  isLanguageChanged,
  type LanguageChangedAck,
  type LanguageRuntimePayload
} from '@shared/LanguageProtocol'

interface ForkLanguageServiceOptions {
  apply?: (payload: LanguageRuntimePayload) => void
  send?: (message: LanguageChangedAck) => void
}

export class ForkLanguageService {
  private readonly apply: (payload: LanguageRuntimePayload) => void
  private readonly send: (message: LanguageChangedAck) => void

  constructor(options: ForkLanguageServiceOptions = {}) {
    this.apply = options.apply ?? applyLanguagePayload
    this.send = options.send ?? ((message) => process.send?.(message))
  }

  initialize(payload: LanguageRuntimePayload) {
    this.apply(payload)
  }

  handle(message: unknown) {
    if (!isLanguageChanged(message)) return false
    this.apply(message.payload)
    this.send({
      type: 'language-changed-ack',
      requestId: message.requestId,
      locale: message.payload.locale
    })
    return true
  }
}

export default new ForkLanguageService()
