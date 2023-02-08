import EN from './en/base'
import ZH from './zh/base'
import * as VueI18n from 'vue-i18n'
import type { I18n } from 'vue-i18n'

export const lang = {
  en: {
    base: EN
  },
  zh: {
    base: ZH
  }
}

let i18n: I18n

export const AppI18n = (l: string): I18n => {
  if (!i18n) {
    i18n = VueI18n.createI18n({
      legacy: true,
      locale: l || 'en',
      fallbackLocale: 'en',
      messages: lang
    })
  }
  if (l) {
    i18n.global.locale = l
  }
  return i18n
}
