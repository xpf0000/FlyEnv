import { createI18n } from 'vue-i18n'
import type { I18n } from 'vue-i18n'

import ai from './zh/ai.json'
import apache from './zh/apache.json'
import appLog from './zh/appLog.json'
import aside from './zh/aside.json'
import base from './zh/base.json'
import conf from './zh/conf.json'
import feedback from './zh/feedback.json'
import fork from './zh/fork.json'
import host from './zh/host.json'
import mailpit from './zh/mailpit.json'
import menu from './zh/menu.json'
import mysql from './zh/mysql.json'
import nginx from './zh/nginx.json'
import nodejs from './zh/nodejs.json'
import ollama from './zh/ollama.json'
import php from './zh/php.json'
import prompt from './zh/prompt.json'
import redis from './zh/redis.json'
import service from './zh/service.json'
import setup from './zh/setup.json'
import tokenGenerator from './zh/token-generator.json'
import tools from './zh/tools.json'
import toolType from './zh/toolType.json'
import tray from './zh/tray.json'
import update from './zh/update.json'
import util from './zh/util.json'
import versionmanager from './zh/versionmanager.json'

import ZH from './zh/index'
import EN from './en/index'

type AppendStringToKeys<T extends object, Prefix extends string = ''> = {
  [K in keyof T]: K extends string
    ? T[K] extends object
      ? AppendStringToKeys<T[K], `${Prefix}.${K}`> // 递归处理嵌套对象
      : `${Prefix}.${K}` // 非对象类型，直接拼接键
    : never // 排除 symbol 类型的键
}[keyof T] // 提取所有值的联合类型

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
  zh: '中文'
}

const lang = {
  ...ZH,
  ...EN
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
