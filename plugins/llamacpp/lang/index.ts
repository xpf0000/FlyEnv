import en from './en'
import zh from './zh'

const messages: Record<string, Record<string, string>> = { en, zh }
export type LlamaCppLangKey = keyof typeof en

export const createLlamaCppT = (getLocale: () => string) => (key: LlamaCppLangKey) => {
  const locale = `${getLocale() || 'en'}`.toLowerCase()
  return messages[locale]?.[key] ?? messages[locale.split('-')[0]]?.[key] ?? en[key] ?? key
}
