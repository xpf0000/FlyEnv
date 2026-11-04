import { AppI18n } from '@lang/index'
import { createMssqlT } from '../lang'

export const MssqlT = createMssqlT(() => `${AppI18n().global.locale ?? 'en'}`)

export type { MssqlLangKey } from '../lang'
