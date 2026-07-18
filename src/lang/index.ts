import AR from './ar/index'
import AZ from './az/index'
import BG from './bg/index'
import BN from './bn/index'
import CS from './cs/index'
import DA from './da/index'
import DE from './de/index'
import EL from './el/index'
import EN from './en/index'
import ES from './es/index'
import FI from './fi/index'
import FR from './fr/index'
import ID from './id/index'
import IT from './it/index'
import JA from './ja/index'
import KO from './ko/index'
import NL from './nl/index'
import NO from './no/index'
import PL from './pl/index'
import PT from './pt/index'
import PTBR from './pt-br/index'
import RO from './ro/index'
import RU from './ru/index'
import SV from './sv/index'
import TR from './tr/index'
import UK from './uk/index'
import HR from './hr/index'
import HU from './hu/index'
import VI from './vi/index'
import ZH from './zh/index'
import ZHHant from './zh-hant/index'
import { FALLBACK_LOCALE, normalizeLocale } from './catalog'
import {
  AppI18n as RuntimeAppI18n,
  applyLanguagePayload,
  I18nT
} from './runtime'

export { AppAllLang } from './catalog'
export { I18nT }
export type { LangKey } from './types'

const lang = {
  ...AR,
  ...AZ,
  ...BG,
  ...BN,
  ...CS,
  ...DA,
  ...DE,
  ...EL,
  ...EN,
  ...ES,
  ...FI,
  ...FR,
  ...HR,
  ...HU,
  ...ID,
  ...IT,
  ...JA,
  ...KO,
  ...NL,
  ...NO,
  ...PL,
  ...PT,
  ...PTBR,
  ...RO,
  ...RU,
  ...SV,
  ...TR,
  ...UK,
  ...VI,
  ...ZH,
  ...ZHHant
}

export const AppI18n = (localeInput?: string) => {
  if (localeInput) {
    const locale = normalizeLocale(localeInput)
    const messages = (lang as Record<string, Record<string, unknown>>)[locale]
    const fallbackMessages = (lang as Record<string, Record<string, unknown>>)[FALLBACK_LOCALE]
    if (messages && fallbackMessages) {
      applyLanguagePayload({
        locale,
        fallbackLocale: FALLBACK_LOCALE,
        messages,
        fallbackMessages
      })
    }
  }
  return RuntimeAppI18n()
}
