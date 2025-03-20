import { createI18n } from 'vue-i18n'
import type { I18n } from 'vue-i18n'

const lang = {
  en: {
    fork: ENFork,
    appLog: ENAppLog
  },
  zh: {
    fork: ZHFork,
    appLog: ZHAppLog
  }
}

type AppendStringToKeys<B extends object, S extends string> = `${S}.${keyof B}`

type LangKey =
  | AppendStringToKeys<typeof AZfork, 'fork'>
  | AppendStringToKeys<typeof AZAppLog, 'appLog'>

let i18n: I18n
export const AppI18n = (l?: string): I18n => {
  if (!i18n) {
    i18n = createI18n({
      legacy: true,
      locale: l || 'en',
      fallbackLocale: 'en',
      messages: lang as any
    })
  }
  if (l) {
    i18n.global.locale = l
  }
  return i18n
}

export const I18nT = (key: LangKey, ...args: any) => {
  const t: any = i18n.global.t
  return t(key, ...args)
}
