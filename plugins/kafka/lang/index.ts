import en from './en'
import zh from './zh'

const messages: Record<string, Record<string, string>> = { en, zh }

export type KafkaLangKey = keyof typeof en

/**
 * Plugin-local translations shared by the fork and renderer sides. The locale
 * source is injected by the side-specific binding (`render/lang.ts` uses the
 * host-bridged `@lang/index`, `fork/lang.ts` uses `@lang/runtime`), so this
 * module stays free of side-specific imports. Lookup order: exact locale,
 * base language (`zh-hant` -> `zh`), English, then the key itself.
 */
export const createKafkaT = (getLocale: () => string) => {
  return (key: KafkaLangKey, args?: Record<string, string | number>): string => {
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
