import { AppI18n } from '@lang/runtime'
import { createMkcertT } from '../lang'
const getLocale = (): string => {
  try {
    return `${AppI18n?.()?.global?.locale ?? 'en'}`
  } catch {
    return 'en'
  }
}
export const MkcertT = createMkcertT(getLocale)
export type { MkcertLangKey } from '../lang'