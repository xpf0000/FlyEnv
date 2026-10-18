import en from './en'
import zh from './zh'

const messages: Record<string, Record<string, string>> = { en, zh }

export const createShortcutsT =
  (getLocale: () => string) =>
  (key: string, args?: Record<string, string>): string => {
    const locale = `${getLocale() || 'en'}`.toLowerCase()
    const dict = messages[locale] ?? messages[locale.split('-')[0]] ?? messages.en
    let text = dict[key] ?? messages.en[key] ?? key
    for (const [name, value] of Object.entries(args ?? {}))
      text = text.replaceAll(`{${name}}`, value)
    return text
  }
