import { AppI18n } from '@lang/index'
import { createKafkaT } from '../lang'

export const KafkaT = createKafkaT(() => `${AppI18n().global.locale ?? 'en'}`)

export type { KafkaLangKey } from '../lang'
