import { reactive } from 'vue'
import ZH from './zh/index'
import EN from './en/index'
import { AppStore } from '@/store/app'
import { AppI18n } from '@lang/index'

const { readdir, readFile, existsSync, mkdirp, writeFile } = require('fs-extra')
const { join, resolve } = require('path')

type CustomerLangItem = {
  label: string
  key: string
  lang: any
}

export const CustomerLangs = reactive<
  {
    label: string
    lang: string
  }[]
>([])

/**
 * Initialize a language pack.
 * Convenient for users to translate into other languages based on this foundation
 */
export const initCustomerLang = async () => {
  const langDir = resolve(global.Server.BaseDir!, '../lang')
  await mkdirp(langDir)
  const currentLang = AppStore().config.setup.lang
  await mkdirp(join(langDir, currentLang))
  const lang: any = currentLang === 'zh' ? ZH.zh : EN.en
  for (const k in lang) {
    const v: any = lang[k]
    const f = join(langDir, currentLang, `${k}.json`)
    if (!existsSync(f)) {
      await writeFile(f, JSON.stringify(v, null, 2))
    }
  }
  const indexJson =
    currentLang === 'zh'
      ? {
          lang: 'zh',
          label: '中文'
        }
      : {
          lang: 'en',
          label: 'English'
        }
  const file = join(langDir, currentLang, `index.json`)
  await writeFile(file, JSON.stringify(indexJson, null, 2))
}

/**
 * Load user-defined language pack
 */
export const loadCustomerLang = async () => {
  const langDir = resolve(global.Server.BaseDir!, '../lang')
  if (!existsSync(langDir)) {
    return
  }
  const dir = await readdir(langDir)
  if (!dir.length) {
    return
  }
  const langArr: CustomerLangItem[] = []
  for (const d of dir) {
    const f = join(langDir, d, 'index.json')
    if (!existsSync(f)) {
      continue
    }
    const content = await readFile(f, 'utf-8')
    let json: any
    try {
      json = JSON.parse(content)
    } catch (e) {}
    if (!json) {
      continue
    }
    if (!json?.lang || !json?.label) {
      continue
    }
    const files = await readdir(join(langDir, d))
    const langFiles = files.filter((f: string) => f.endsWith('.json') && f !== 'index.json')
    if (!langFiles.length) {
      continue
    }
    const item: CustomerLangItem = {
      label: json.label,
      key: json.lang,
      lang: {}
    }
    const lang = item.lang
    for (const f of langFiles) {
      const content = await readFile(join(langDir, d, f), 'utf-8')
      let json: any
      try {
        json = JSON.parse(content)
      } catch (e) {}
      if (!json) {
        continue
      }
      const key = f.replace('.json', '')
      lang[key] = json
    }
    if (!Object.keys(lang).length) {
      continue
    }
    langArr.push(item)
  }
  console.log('langArr: ', langArr)
  CustomerLangs.splice(0)
  for (const item of langArr) {
    CustomerLangs.push({
      label: item.label,
      lang: item.key
    })
    AppI18n().global.setLocaleMessage(item.key, item.lang)
  }
}
