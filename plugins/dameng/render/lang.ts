import { AppI18n } from '@lang/index'
import { createDamengT } from '../lang'

export const DamengT = createDamengT(() => `${AppI18n().global.locale ?? 'en'}`)
