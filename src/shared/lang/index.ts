import ENBase from './en/base'
import ZHBase from './zh/base'
import ENPHP from './en/php'
import ZHPHP from './zh/php'
import ENTray from './en/tray'
import ZHTray from './zh/tray'
import ENUtil from './en/util'
import ZHUtil from './zh/util'
import ENHost from './en/host'
import ZHHost from './zh/host'
import ENAI from './en/ai'
import ZHAI from './zh/ai'
import ENTools from './en/tools'
import ZHTools from './zh/tools'
import { createI18n } from 'vue-i18n'
import type { I18n } from 'vue-i18n'

export const lang = {
  en: {
    base: ENBase,
    php: ENPHP,
    tray: ENTray,
    util: ENUtil,
    host: ENHost,
    ai: ENAI,
    tools: ENTools
  },
  zh: {
    base: ZHBase,
    php: ZHPHP,
    tray: ZHTray,
    util: ZHUtil,
    host: ZHHost,
    ai: ZHAI,
    tools: ZHTools
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

export const I18nT = (...args: any) => {
  // @ts-ignore
  return i18n.global.t(...args)
}
