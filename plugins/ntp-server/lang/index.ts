import en from './en'
import zh from './zh'

const messages: Record<string, Record<string, string>> = { en, zh }

export const createT = (getLocale: () => string) => (key: string) => {
  const locale = getLocale().toLowerCase()
  return messages[locale]?.[key] ?? messages[locale.split('-')[0]]?.[key] ?? messages.en[key] ?? key
}
