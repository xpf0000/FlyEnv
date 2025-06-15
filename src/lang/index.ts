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
import type mailpit from './zh/mailpit.json'
import type menu from './zh/menu.json'
import type mysql from './zh/mysql.json'
import type nginx from './zh/nginx.json'
import type nodejs from './zh/nodejs.json'
import type ollama from './zh/ollama.json'
import type php from './zh/php.json'
import type prompt from './zh/prompt.json'
import type redis from './zh/redis.json'
import type service from './zh/service.json'
import type setup from './zh/setup.json'
import type tokenGenerator from './zh/token-generator.json'
import type tools from './zh/tools.json'
import type toolType from './zh/toolType.json'
import type tray from './zh/tray.json'
import type update from './zh/update.json'
import type util from './zh/util.json'
import type versionmanager from './zh/versionmanager.json'
import type licenses from './zh/licenses.json'
import type requestTimer from './zh/requestTimer.json'
import type meilisearch from './zh/meilisearch.json'
import type minio from './zh/minio.json'

import ZH from './zh/index'
import EN from './en/index'
import VI from './vi/index'
import FR from './fr/index'
import PT from './pt/index'
import PTBR from './pt-br/index'
import ID from './id/index'
import IT from './it/index'

type AppendStringToKeys<T extends object, Prefix extends string = ''> = {
  [K in keyof T]: K extends string
    ? T[K] extends object
      ? AppendStringToKeys<T[K], `${Prefix}.${K}`> // 递归处理嵌套对象
      : `${Prefix}.${K}` // 非对象类型，直接拼接键
    : K extends number
      ? T extends readonly any[] // 检查 T 是否是数组类型
        ? `${Prefix}.${K}` // 如果是数组，处理索引
        : never // 如果不是数组，忽略
      : never // 排除 symbol 类型的键
}[keyof T] // 提取所有值的联合类型

type LangKey =
  | AppendStringToKeys<typeof minio, 'minio'>
  | AppendStringToKeys<typeof meilisearch, 'meilisearch'>
  | AppendStringToKeys<typeof requestTimer, 'requestTimer'>
  | AppendStringToKeys<typeof licenses, 'licenses'>
  | AppendStringToKeys<typeof ai, 'ai'>
  | AppendStringToKeys<typeof apache, 'apache'>
  | AppendStringToKeys<typeof appLog, 'appLog'>
  | AppendStringToKeys<typeof aside, 'aside'>
  | AppendStringToKeys<typeof base, 'base'>
  | AppendStringToKeys<typeof conf, 'conf'>
  | AppendStringToKeys<typeof feedback, 'feedback'>
  | AppendStringToKeys<typeof fork, 'fork'>
  | AppendStringToKeys<typeof host, 'host'>
  | AppendStringToKeys<typeof mailpit, 'mailpit'>
  | AppendStringToKeys<typeof menu, 'menu'>
  | AppendStringToKeys<typeof mysql, 'mysql'>
  | AppendStringToKeys<typeof nginx, 'nginx'>
  | AppendStringToKeys<typeof nodejs, 'nodejs'>
  | AppendStringToKeys<typeof ollama, 'ollama'>
  | AppendStringToKeys<typeof php, 'php'>
  | AppendStringToKeys<typeof prompt, 'prompt'>
  | AppendStringToKeys<typeof redis, 'redis'>
  | AppendStringToKeys<typeof service, 'service'>
  | AppendStringToKeys<typeof setup, 'setup'>
  | AppendStringToKeys<typeof tokenGenerator, 'token-generator'>
  | AppendStringToKeys<typeof tools, 'tools'>
  | AppendStringToKeys<typeof toolType, 'toolType'>
  | AppendStringToKeys<typeof tray, 'tray'>
  | AppendStringToKeys<typeof update, 'update'>
  | AppendStringToKeys<typeof util, 'util'>
  | AppendStringToKeys<typeof versionmanager, 'versionmanager'>

export const AppAllLang = {
  en: 'English',
  zh: '中文',
  vi: 'Tiếng Việt',
  fr: 'Français',
  pt: 'Português',
  'pt-br': 'Português (Brasil)',
  id: 'Bahasa Indonesia',
  it: 'Italiano',
}

const lang = {
  ...ZH,
  ...EN,
  ...VI,
  ...ID,
  ...FR,
  ...PT,
  ...PTBR,
  ...IT,
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
