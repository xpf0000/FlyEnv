import { AppI18n } from '@lang/runtime'
import { createSamWafT } from '../lang'

// `AppI18n` resolves to the fork process's live i18n instance through the
// plugin host bridge. Fall back to English when the bridge is unavailable.
const getLocale = () => {
  try {
    return `${AppI18n?.()?.global?.locale ?? 'en'}`
  } catch {
    return 'en'
  }
}

export const SamWafT = createSamWafT(getLocale)

export type { SamWafLangKey } from '../lang'
