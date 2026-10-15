import { AppI18n } from '@lang/runtime'
import { createMssqlT } from '../lang'

// `AppI18n` resolves to the fork process's live i18n instance through the
// plugin host bridge. Fall back to English when the bridge is unavailable
// (e.g. the plugin runs on a host that predates the fork-side bridge).
const getLocale = () => {
  try {
    return `${AppI18n?.()?.global?.locale ?? 'en'}`
  } catch {
    return 'en'
  }
}

export const MssqlT = createMssqlT(getLocale)

export type { MssqlLangKey } from '../lang'
