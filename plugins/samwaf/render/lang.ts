import { AppI18n } from '@lang/index'
import { createSamWafT } from '../lang'

export const SamWafT = createSamWafT(() => AppI18n().global.locale)

export type { SamWafLangKey } from '../lang'
