import ENBase from './en/base'
import ZHBase from './zh/base'
import VIBase from './vi/base'
import ENPHP from './en/php'
import ZHPHP from './zh/php'
import VIPHP from './vi/php'
import ENTray from './en/tray'
import ZHTray from './zh/tray'
import VITray from './vi/tray'
import ENUtil from './en/util'
import ZHUtil from './zh/util'
import VIUtil from './vi/util'
import ENHost from './en/host'
import ZHHost from './zh/host'
import VIHost from './vi/host'
import ENAI from './en/ai'
import ZHAI from './zh/ai'
import VIAI from './vi/ai'
import ENTools from './en/tools'
import ZHTools from './zh/tools'
import VITools from './vi/tools'
import { createI18n } from 'vue-i18n'
import type { I18n } from 'vue-i18n'
import { merge } from 'lodash'

const basename = (dir: string) => {
  return dir.split('/').pop()!
}
const dirname = (dir: string) => {
  const arr = dir.split('/')
  arr.pop()
  return arr.join('/')
}

const modules: any = import.meta.glob('@/components/*/lang/*/*', { eager: true })
const modulesTool: any = import.meta.glob('@/components/Tools/*/lang/*/*', { eager: true })
console.log('lang modules: ', modules, modulesTool)
const dict: any = {}
for (const k in { ...modules, ...modulesTool }) {
  const name = basename(k).split('.').shift()!
  const lang = basename(dirname(k))
  if (!dict[lang]) {
    dict[lang] = {}
  }
  dict[lang][name] = Object.assign(
    {},
    dict[lang][name],
    modules?.[k]?.default,
    modulesTool?.[k]?.default
  )
}

export const lang = merge(
  {
    en: {
      base: ENBase,
      php: ENPHP,
      tray: ENTray,
      util: ENUtil,
      host: ENHost,
      ai: ENAI,
      tools: ENTools
    },
    zh: {
      base: ZHBase,
      php: ZHPHP,
      tray: ZHTray,
      util: ZHUtil,
      host: ZHHost,
      ai: ZHAI,
      tools: ZHTools
    },
    vi: {
      base: VIBase,
      php: VIPHP,
      tray: VITray,
      util: VIUtil,
      host: VIHost,
      ai: VIAI,
      tools: VITools
    },
  },
  dict
)

console.log('lang: ', lang)

let i18n: I18n

export const AppI18n = (l?: string): I18n => {
  if (!i18n) {
    i18n = createI18n({
      legacy: true,
      locale: l || 'en',
      fallbackLocale: 'en',
      messages: lang
    })
  }
  if (l) {
    i18n.global.locale = l
  }
  return i18n
}

export const I18nT = (txt: string, param?: any) => {
  // @ts-ignore
  return AppI18n().global.t(txt, param)
}
