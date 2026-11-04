import { AppI18n } from '@lang/index'
import { createShortcutsT } from '../lang'

export const ShortcutsT = createShortcutsT(() => `${AppI18n().global.locale ?? 'en'}`)
