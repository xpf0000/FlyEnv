import { AppI18n } from '@lang/index'
import { createT } from '../lang'
export const t = createT(() => String(AppI18n().global.locale ?? 'en'))
