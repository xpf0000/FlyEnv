import { AppI18n } from '@lang/index'
import { createMkcertT } from '../lang'
export const MkcertT = createMkcertT(() => `${AppI18n().global.locale ?? 'en'}`)
export type { MkcertLangKey } from '../lang'
