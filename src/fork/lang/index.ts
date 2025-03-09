import ENFork from './en/fork'
import FRFork from './fr/fork'
import PTFork from './pt/fork'
import ZHFork from './zh/fork'
import AZfork from './az/fork'
import VIFork from './vi/fork'
import ENAppLog from './en/appLog'
import FRAppLog from './fr/appLog'
import PTAppLog from './pt/appLog'
import ZHAppLog from './zh/appLog'
import AZAppLog from './az/appLog'
import VIAppLog from './vi/appLog'
import { createI18n } from 'vue-i18n'
import type { I18n } from 'vue-i18n'

const lang = {
  en: {
    fork: ENFork,
    appLog: ENAppLog
  },
  fr: {
    fork: FRFork,
    appLog: FRAppLog
  },
  pt: {
    fork: PTFork,
    appLog: PTAppLog
  },
  zh: {
    fork: ZHFork,
    appLog: ZHAppLog
  },
  az: {
    fork: AZfork,
    appLog: AZAppLog
  },
  vi: {
    fork: VIFork,
    appLog: VIAppLog
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
