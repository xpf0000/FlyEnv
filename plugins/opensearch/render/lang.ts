import { AppI18n } from '@lang/index'
import { createOpenSearchT } from '../lang'

export const OpenSearchT = createOpenSearchT(() => `${AppI18n().global.locale ?? 'en'}`)

export type { OpenSearchLangKey } from '../lang'
