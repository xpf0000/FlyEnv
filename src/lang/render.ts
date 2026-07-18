import en from 'element-plus/es/locale/lang/en'
import type { Language } from 'element-plus/es/locale'

const loaders: Record<string, () => Promise<{ default: Language }>> = {
  ar: () => import('element-plus/es/locale/lang/ar'),
  az: () => import('element-plus/es/locale/lang/az'),
  bg: () => import('element-plus/es/locale/lang/bg'),
  bn: () => import('element-plus/es/locale/lang/bn'),
  cs: () => import('element-plus/es/locale/lang/cs'),
  da: () => import('element-plus/es/locale/lang/da'),
  de: () => import('element-plus/es/locale/lang/de'),
  el: () => import('element-plus/es/locale/lang/el'),
  es: () => import('element-plus/es/locale/lang/es'),
  fi: () => import('element-plus/es/locale/lang/fi'),
  fr: () => import('element-plus/es/locale/lang/fr'),
  hr: () => import('element-plus/es/locale/lang/hr'),
  hu: () => import('element-plus/es/locale/lang/hu'),
  id: () => import('element-plus/es/locale/lang/id'),
  it: () => import('element-plus/es/locale/lang/it'),
  ja: () => import('element-plus/es/locale/lang/ja'),
  ko: () => import('element-plus/es/locale/lang/ko'),
  nl: () => import('element-plus/es/locale/lang/nl'),
  no: () => import('element-plus/es/locale/lang/no'),
  pl: () => import('element-plus/es/locale/lang/pl'),
  pt: () => import('element-plus/es/locale/lang/pt'),
  'pt-br': () => import('element-plus/es/locale/lang/pt-br'),
  ro: () => import('element-plus/es/locale/lang/ro'),
  ru: () => import('element-plus/es/locale/lang/ru'),
  sv: () => import('element-plus/es/locale/lang/sv'),
  tr: () => import('element-plus/es/locale/lang/tr'),
  uk: () => import('element-plus/es/locale/lang/uk'),
  vi: () => import('element-plus/es/locale/lang/vi'),
  zh: () => import('element-plus/es/locale/lang/zh-cn'),
  zhhant: () => import('element-plus/es/locale/lang/zh-tw')
}

export const ElementPlusEnglish = en

export const loadElementPlusLocale = async (locale: string): Promise<Language> => {
  const loader = loaders[locale]
  if (!loader) return en
  try {
    return (await loader()).default
  } catch {
    return en
  }
}
