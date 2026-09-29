import { AppI18n } from '@lang/runtime'
import { createLlamaCppT } from '../lang'

const getLocale = () => {
  try {
    return `${AppI18n?.()?.global?.locale ?? 'en'}`
  } catch {
    return 'en'
  }
}

export const LlamaCppT = createLlamaCppT(getLocale)
