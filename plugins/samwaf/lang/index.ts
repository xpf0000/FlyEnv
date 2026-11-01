import en from './en'
import zh from './zh'

const messages: Record<string, Record<string, string>> = { en, zh }

export type SamWafLangKey = keyof typeof en

export const createSamWafT = (getLocale: () => string) => {
  return (key: SamWafLangKey, args?: Record<string, string | number>): string => {
    const locale = `${getLocale() ?? 'en'}`.toLowerCase()
    const dict = messages[locale] ?? messages[locale.split('-')[0]] ?? messages.en
    let text = dict?.[key] ?? messages.en[key] ?? key
    if (args) {
      Object.entries(args).forEach(([name, value]) => {
        text = text.replaceAll(`{${name}}`, `${value}`)
      })
    }
    return text
  }
}
