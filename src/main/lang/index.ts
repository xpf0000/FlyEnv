import MenuEN from './en/menu'
import MenuFR from './fr/menu'
import MenuZH from './zh/menu'
import UpdateEN from './en/update'
import UpdateFR from './fr/update'
import UpdateZH from './zh/update'
import { createI18n } from 'vue-i18n'
import type { I18n } from 'vue-i18n'

export const lang = {
  en: {
    menu: MenuEN,
    update: UpdateEN
  },
  fr: {
    menu: MenuFR,
    update: UpdateFR
  },
  zh: {
    menu: MenuZH,
    update: UpdateZH
  }
}

let i18n: I18n

export const AppI18n = (l?: string): I18n => {
  if (!i18n) {
    i18n = createI18n({
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

export const I18nT = (key: string, ...args: any): string => {
  // @ts-ignore
  return i18n.global.t(key, ...args)
}
