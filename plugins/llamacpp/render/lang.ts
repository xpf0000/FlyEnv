import { AppI18n } from '@lang/index'
import { createLlamaCppT } from '../lang'

export const LlamaCppT = createLlamaCppT(() => `${AppI18n().global.locale ?? 'en'}`)
