import { createI18n } from 'vue-i18n'
import { FALLBACK_LOCALE } from './catalog'
import type { LangKey } from './types'
import type { LanguageRuntimePayload } from '@shared/LanguageProtocol'

const i18n = createI18n({
  legacy: true,
  locale: FALLBACK_LOCALE,
  fallbackLocale: FALLBACK_LOCALE,
  messages: {}
})

let activeLocale = FALLBACK_LOCALE
const reportedMissingKeys = new Set<string>()

export const AppI18n = () => i18n

export const getActiveLocale = () => activeLocale

export const releaseLocalePayload = (locale: string) => {
  if (locale !== FALLBACK_LOCALE && locale !== activeLocale) {
    i18n.global.setLocaleMessage(locale, {})
  }
}

export const applyLanguagePayload = (payload: LanguageRuntimePayload) => {
  const previousLocale = activeLocale
  i18n.global.setLocaleMessage(payload.fallbackLocale, payload.fallbackMessages)
  i18n.global.setLocaleMessage(payload.locale, payload.messages)
  i18n.global.fallbackLocale = payload.fallbackLocale
  i18n.global.locale = payload.locale
  activeLocale = payload.locale
  if (previousLocale !== payload.fallbackLocale && previousLocale !== payload.locale) {
    i18n.global.setLocaleMessage(previousLocale, {})
  }
  return i18n
}

export const I18nT = (key: LangKey | string, ...args: any[]) => {
  const translate = i18n.global.t as any
  const result = translate(key, ...args)
  if (result === key && !reportedMissingKeys.has(key)) {
    reportedMissingKeys.add(key)
    console.warn(`[I18n] Missing English fallback key: ${key}`)
  }
  return result
}
