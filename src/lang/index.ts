import { createI18n } from 'vue-i18n'
import type { I18n } from 'vue-i18n'

import type ai from './zh/ai.json'
import type apache from './zh/apache.json'
import type appLog from './zh/appLog.json'
import type aside from './zh/aside.json'
import type base from './zh/base.json'
import type conf from './zh/conf.json'
import type feedback from './zh/feedback.json'
import type fork from './zh/fork.json'
import type host from './zh/host.json'
import type licenses from './zh/licenses.json'
import type mailpit from './zh/mailpit.json'
import type meilisearch from './zh/meilisearch.json'
import type menu from './zh/menu.json'
import type minio from './zh/minio.json'
import type mysql from './zh/mysql.json'
import type nginx from './zh/nginx.json'
import type nodejs from './zh/nodejs.json'
import type ollama from './zh/ollama.json'
import type php from './zh/php.json'
import type podman from './zh/podman.json'
import type prompt from './zh/prompt.json'
import type redis from './zh/redis.json'
import type requestTimer from './zh/requestTimer.json'
import type service from './zh/service.json'
import type setup from './zh/setup.json'
import type tokenGenerator from './zh/token-generator.json'
import type tools from './zh/tools.json'
import type toolType from './zh/toolType.json'
import type tray from './zh/tray.json'
import type update from './zh/update.json'
import type util from './zh/util.json'
import type versionmanager from './zh/versionmanager.json'

import AR from './ar/index'
import AZ from './az/index'
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
import VI from './vi/index'
import ZH from './zh/index'

type AppendStringToKeys<T extends object, Prefix extends string = ''> = {
  [K in keyof T]: K extends string
    ? T[K] extends object
      ? AppendStringToKeys<T[K], `${Prefix}.${K}`> // Recursively handle nested objects
      : `${Prefix}.${K}` // Non-object type, directly concatenate keys
    : K extends number
      ? T extends readonly any[] // Check if T is an array type
        ? `${Prefix}.${K}` // If it's an array, handle the index
        : never // If not an array, ignore
      : never // Exclude symbol type keys
}[keyof T] // Extract the union type of all values

type LangKey =
  | AppendStringToKeys<typeof ai, 'ai'>
  | AppendStringToKeys<typeof apache, 'apache'>
  | AppendStringToKeys<typeof appLog, 'appLog'>
  | AppendStringToKeys<typeof aside, 'aside'>
  | AppendStringToKeys<typeof base, 'base'>
  | AppendStringToKeys<typeof conf, 'conf'>
  | AppendStringToKeys<typeof feedback, 'feedback'>
  | AppendStringToKeys<typeof fork, 'fork'>
  | AppendStringToKeys<typeof host, 'host'>
  | AppendStringToKeys<typeof licenses, 'licenses'>
  | AppendStringToKeys<typeof mailpit, 'mailpit'>
  | AppendStringToKeys<typeof meilisearch, 'meilisearch'>
  | AppendStringToKeys<typeof menu, 'menu'>
  | AppendStringToKeys<typeof minio, 'minio'>
  | AppendStringToKeys<typeof mysql, 'mysql'>
  | AppendStringToKeys<typeof nginx, 'nginx'>
  | AppendStringToKeys<typeof nodejs, 'nodejs'>
  | AppendStringToKeys<typeof ollama, 'ollama'>
  | AppendStringToKeys<typeof php, 'php'>
  | AppendStringToKeys<typeof podman, 'podman'>
  | AppendStringToKeys<typeof prompt, 'prompt'>
  | AppendStringToKeys<typeof redis, 'redis'>
  | AppendStringToKeys<typeof requestTimer, 'requestTimer'>
  | AppendStringToKeys<typeof service, 'service'>
  | AppendStringToKeys<typeof setup, 'setup'>
  | AppendStringToKeys<typeof tokenGenerator, 'token-generator'>
  | AppendStringToKeys<typeof tools, 'tools'>
  | AppendStringToKeys<typeof toolType, 'toolType'>
  | AppendStringToKeys<typeof tray, 'tray'>
  | AppendStringToKeys<typeof update, 'update'>
  | AppendStringToKeys<typeof util, 'util'>
  | AppendStringToKeys<typeof versionmanager, 'versionmanager'>

export const AppAllLang: Record<string, string> = {
  ar: 'العربية',
  az: 'Azərbaycanca',
  bn: 'বাংলা',
  cs: 'Čeština',
  da: 'Dansk',
  de: 'Deutsch',
  el: 'Ελληνικά',
  en: 'English',
  es: 'Español',
  fi: 'Suomi',
  fr: 'Français',
  id: 'Bahasa Indonesia',
  it: 'Italiano',
  ja: '日本語',
  nl: 'Nederlands',
  no: 'Norsk',
  pl: 'Polski',
  pt: 'Português',
  'pt-br': 'Português (Brasil)',
  ro: 'Romainiană',
  ru: 'Русский',
  sv: 'Svenska',
  tr: 'Türkçe',
  uk: 'Українська',
  vi: 'Tiếng Việt',
  zh: '中文'
}

const lang = {
  ...AR,
  ...AZ,
  ...BN,
  ...CS,
  ...DA,
  ...DE,
  ...EL,
  ...EN,
  ...ES,
  ...FI,
  ...FR,
  ...ID,
  ...IT,
  ...JA,
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
  ...ZH
}

let i18n: I18n
export const AppI18n = (l?: string): I18n => {
  if (!i18n) {
    i18n = createI18n({
      legacy: true,
      locale: l || 'en',
      fallbackLocale: 'en',
      messages: lang as any
    })
  }
  if (l) {
    i18n.global.locale = l
  }
  return i18n
}

export const I18nT = (key: LangKey, ...args: any) => {
  const t: any = i18n.global.t
  return t(key, ...args)
}
