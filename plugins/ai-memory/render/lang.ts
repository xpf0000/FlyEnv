import { AppI18n } from '@lang/index'
import { createMemoryT } from '../lang'
export const MemoryT = createMemoryT(() => `${AppI18n().global.locale ?? 'en'}`)
