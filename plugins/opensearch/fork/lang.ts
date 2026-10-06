import { AppI18n } from '@lang/runtime'
import { createOpenSearchT } from '../lang'

const getLocale = () => {
  try {
    return `${AppI18n?.()?.global?.locale ?? 'en'}`
  } catch {
    return 'en'
  }
}

export const OpenSearchT = createOpenSearchT(getLocale)

export type { OpenSearchLangKey } from '../lang'
