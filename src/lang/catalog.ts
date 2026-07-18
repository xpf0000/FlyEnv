export const FALLBACK_LOCALE = 'en'

export const BuiltInLocaleCatalog = {
  ar: { label: 'العربية', sourceDir: 'ar' },
  az: { label: 'Azərbaycanca', sourceDir: 'az' },
  bg: { label: 'Български', sourceDir: 'bg' },
  bn: { label: 'বাংলা', sourceDir: 'bn' },
  cs: { label: 'Čeština', sourceDir: 'cs' },
  da: { label: 'Dansk', sourceDir: 'da' },
  de: { label: 'Deutsch', sourceDir: 'de' },
  el: { label: 'Ελληνικά', sourceDir: 'el' },
  en: { label: 'English', sourceDir: 'en' },
  es: { label: 'Español', sourceDir: 'es' },
  fi: { label: 'Suomi', sourceDir: 'fi' },
  fr: { label: 'Français', sourceDir: 'fr' },
  hr: { label: 'Hrvatski', sourceDir: 'hr' },
  hu: { label: 'Magyar', sourceDir: 'hu' },
  id: { label: 'Bahasa Indonesia', sourceDir: 'id' },
  it: { label: 'Italiano', sourceDir: 'it' },
  ja: { label: '日本語', sourceDir: 'ja' },
  ko: { label: '한국어', sourceDir: 'ko' },
  nl: { label: 'Nederlands', sourceDir: 'nl' },
  no: { label: 'Norsk', sourceDir: 'no' },
  pl: { label: 'Polski', sourceDir: 'pl' },
  pt: { label: 'Português', sourceDir: 'pt' },
  'pt-br': { label: 'Português (Brasil)', sourceDir: 'pt-br' },
  ro: { label: 'Romainiană', sourceDir: 'ro' },
  ru: { label: 'Русский', sourceDir: 'ru' },
  sv: { label: 'Svenska', sourceDir: 'sv' },
  tr: { label: 'Türkçe', sourceDir: 'tr' },
  uk: { label: 'Українська', sourceDir: 'uk' },
  vi: { label: 'Tiếng Việt', sourceDir: 'vi' },
  zh: { label: '中文-简体', sourceDir: 'zh' },
  zhhant: { label: '中文-繁体', sourceDir: 'zh-hant' }
} as const

export type BuiltInLocale = keyof typeof BuiltInLocaleCatalog
export type LocaleCatalog = Readonly<
  Record<string, Readonly<{ label: string; sourceDir: string }>>
>

export const AppAllLang: Record<string, string> = Object.fromEntries(
  Object.entries(BuiltInLocaleCatalog).map(([code, item]) => [code, item.label])
)

export const normalizeLocale = (input?: string): string => {
  const value = (input || FALLBACK_LOCALE).trim().toLowerCase().replaceAll('_', '-')
  const aliases: Record<string, BuiltInLocale> = {
    'pt-br': 'pt-br',
    'zh-hant': 'zhhant',
    'zh-tw': 'zhhant',
    'zh-hk': 'zhhant'
  }
  if (aliases[value]) return aliases[value]
  if (value in BuiltInLocaleCatalog) return value
  const base = value.split('-')[0]
  return base in BuiltInLocaleCatalog ? base : value
}
