import { shallowRef } from 'vue'
import type { Language } from 'element-plus/es/locale'
import IPC from '@/util/IPC'
import { applyLanguagePayload } from '@lang/runtime'
import { ElementPlusEnglish, loadElementPlusLocale } from '@lang/render'
import type {
  LanguageBootstrapResult,
  LanguagePrepared,
  LanguageRuntimePayload
} from '@shared/LanguageProtocol'

type LanguageResponse<T> = { code: number; data?: T; msg?: string }

const request = <T>(command: string, ...args: unknown[]) =>
  new Promise<T>((resolve, reject) => {
    IPC.send(command, ...args).then((key: string, response: LanguageResponse<T>) => {
      IPC.off(key)
      if (response?.code === 0 && response.data) {
        resolve(response.data)
      } else {
        reject(new Error(response?.msg || `Language request failed: ${command}`))
      }
    })
  })

export class RendererLanguageService {
  readonly elementPlusLocale = shallowRef<Language>(ElementPlusEnglish)
  private requestSequence = 0

  async initialize() {
    const bootstrap = await request<LanguageBootstrapResult>('application:language-bootstrap')
    const payload = bootstrap.payload
    const elementLocale = await loadElementPlusLocale(payload.locale)
    applyLanguagePayload(payload)
    this.elementPlusLocale.value = elementLocale
    return { locale: payload.locale, warning: bootstrap.warning }
  }

  async switchLocale(locale: string) {
    const sequence = ++this.requestSequence
    const [prepared, elementLocale] = await Promise.all([
      request<LanguagePrepared>('application:language-prepare', locale),
      loadElementPlusLocale(locale)
    ])
    if (sequence !== this.requestSequence) throw new Error('Stale language request')
    const payload = await request<LanguageRuntimePayload>(
      'application:language-commit',
      prepared.token
    )
    if (sequence !== this.requestSequence) throw new Error('Stale language request')
    applyLanguagePayload(payload)
    this.elementPlusLocale.value = elementLocale
    return payload.locale
  }

  applyBroadcast(payload: LanguageRuntimePayload) {
    return loadElementPlusLocale(payload.locale).then((elementLocale) => {
      applyLanguagePayload(payload)
      this.elementPlusLocale.value = elementLocale
    })
  }
}

export const RendererLanguage = new RendererLanguageService()
