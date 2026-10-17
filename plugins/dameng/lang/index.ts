import en from './en'
import zh from './zh'

const messages: Record<string, Record<string, string>> = { en, zh }
export type DamengLangKey = keyof typeof en

export const createDamengT = (getLocale: () => string) => {
  return (key: DamengLangKey, args?: Record<string, string | number>): string => {
    const locale = `${getLocale() ?? 'en'}`.toLowerCase()
    const dict = messages[locale] ?? messages[locale.split('-')[0]] ?? en
    let text = dict[key] ?? en[key] ?? key
    if (args) {
      for (const [name, value] of Object.entries(args))
        text = text.replaceAll(`{${name}}`, `${value}`)
    }
    return text
  }
}
