import { reactive, watch } from 'vue'
import {
  javascriptToJson,
  jsonToGoBase,
  jsonToGoStruct,
  jsonToJava,
  jsonToJSDoc,
  jsonToJSON,
  jsonToKotlin,
  jsonToMySQL,
  jsonToPList,
  jsonToRust,
  jsonToTOML,
  jsonToTs,
  jsonToXML,
  jsonToYAML,
  phpToJson,
  plistToJson,
  tomlToJson,
  xmlToJson,
  yamlToJson
} from '@/util/transform'
import { JSONSort } from '@/util/JsonSort'
import { editor } from 'monaco-editor/esm/vs/editor/editor.api.js'
import { FormatHtml, FormatPHP, FormatTS, FormatYaml } from '@/util/FormatCode'
import { I18nT } from '@lang/index'
import localForage from 'localforage'
import { detectLanguage } from '@/components/Tools/CodePlayground/languageDetector'
import { BrewStore } from '@/store/brew'

export class CodePlayTab {
  value = ''
  json: any = null
  type = ''
  from = ''
  to = 'json'
  toValue = ''
  toLang = 'javascript'
  editor!: () => editor.IStandaloneCodeEditor
  execing = false

  watcher1: any = null
  watcher2: any = null

  constructor(obj?: any) {
    this.value = I18nT('tools.inputTips')
    this.type = I18nT('tools.noInputTips')

    Object.assign(this, obj)
  }

  initWatch() {
    this.watcher1 = watch(
      () => this.value,
      (v) => {
        if (this.from) {
          return
        }
        const lang = detectLanguage(v)
        if (lang) {
          const brewStore = BrewStore()
          const installed = brewStore.module(lang).installed
          const saved = CodePlay.langBin?.[lang]
          if (saved && installed.some((f) => f.path === saved)) {
            this.from = JSON.stringify({
              type: lang,
              path: saved
            })
          } else if (installed.length > 0) {
            const find = installed[0]
            this.from = JSON.stringify({
              type: lang,
              path: find.path
            })
            CodePlay.langBin[lang] = find.path
            CodePlay.save()
          }
        }
      }
    )
    this.watcher2 = watch(
      () => this.from,
      (v) => {
        if (!v) {
          return
        }
        const json = JSON.parse(v)
        CodePlay.langBin[json.type] = json.path
        CodePlay.save()
      }
    )
  }

  destroy() {
    if (this.watcher1) {
      this.watcher1()
      this.watcher1 = null
    }
    if (this.watcher2) {
      this.watcher2()
      this.watcher2 = null
    }
  }

  transformTo(sort?: 'asc' | 'desc') {
    if (!this.json) {
      this.editor().setValue(I18nT('tools.parseFailTips'))
      return
    }
    let json = JSON.parse(JSON.stringify(this.json))
    if (sort) {
      json = JSONSort(json, sort)
    }
    const model = this.editor().getModel()!
    let value = ''
    if (this.to === 'json') {
      this.toLang = 'json'
      editor.setModelLanguage(model, 'json')
      value = JSON.stringify(json, null, 4)
    } else if (this.to === 'json-minify') {
      this.toLang = 'json'
      editor.setModelLanguage(model, 'json')
      value = JSON.stringify(json)
    } else if (this.to === 'js') {
      this.toLang = 'javascript'
      editor.setModelLanguage(model, 'javascript')
      value = jsonToJSON(json)
    } else if (this.to === 'php') {
      this.toLang = 'php'
      editor.setModelLanguage(model, 'php')
      if (this.type !== 'PHP') {
        value = JSON.stringify(json, null, 4)
        value = value.replace(/": /g, `" => `).replace(/\{/g, '[').replace(/\}/g, ']')
      } else {
        value = this.value
      }
      if (!value.includes('<?php')) {
        value = '<?php\n' + value
      }
      FormatPHP(value)
        .then((php: string) => {
          this.editor().setValue(php)
        })
        .catch(() => {
          this.editor().setValue(value)
        })
      return
    } else if (this.to === 'xml') {
      this.toLang = 'xml'
      editor.setModelLanguage(model, 'xml')
      if (this.type === 'XML') {
        value = this.value
      } else {
        value = jsonToXML(json)
      }
      console.log('xml value: ', value)
      FormatHtml(value)
        .then((xml: string) => {
          this.editor().setValue(xml)
        })
        .catch(() => {
          this.editor().setValue(value)
        })
      return
    } else if (this.to === 'plist') {
      this.toLang = 'xml'
      editor.setModelLanguage(model, 'xml')
      if (this.type === 'PList') {
        value = this.value
      } else {
        value = jsonToPList(json)
      }
      FormatHtml(value)
        .then((xml: string) => {
          this.editor().setValue(xml)
        })
        .catch(() => {
          this.editor().setValue(value)
        })
      return
    } else if (this.to === 'yaml') {
      this.toLang = 'yaml'
      editor.setModelLanguage(model, 'yaml')
      if (this.type === 'YAML') {
        value = this.value
      } else {
        value = jsonToYAML(json)
      }
      FormatYaml(value)
        .then((xml: string) => {
          this.editor().setValue(xml)
        })
        .catch(() => {
          this.editor().setValue(value)
        })
      return
    } else if (this.to === 'ts') {
      this.toLang = 'typescript'
      editor.setModelLanguage(model, 'typescript')
      value = jsonToTs(json)
      FormatTS(value)
        .then((ts) => {
          this.editor().setValue(ts)
        })
        .catch(() => {
          this.editor().setValue(value)
        })
      return
    } else if (this.to === 'toml') {
      this.toLang = 'toml'
      editor.setModelLanguage(model, 'toml')
      jsonToTOML(json).then((res) => {
        value = res
        this.editor().setValue(value)
      })
    } else if (this.to === 'goStruct') {
      this.toLang = 'go'
      editor.setModelLanguage(model, 'go')
      value = jsonToGoStruct(json)
    } else if (this.to === 'goBson') {
      this.toLang = 'go'
      editor.setModelLanguage(model, 'go')
      value = jsonToGoBase(json)
    } else if (this.to === 'Java') {
      this.toLang = 'java'
      editor.setModelLanguage(model, 'java')
      value = jsonToJava(json)
    } else if (this.to === 'Kotlin') {
      this.toLang = 'kotlin'
      editor.setModelLanguage(model, 'kotlin')
      value = jsonToKotlin(json)
    } else if (this.to === 'rustSerde') {
      this.toLang = 'rust'
      editor.setModelLanguage(model, 'rust')
      value = jsonToRust(json)
    } else if (this.to === 'MySQL') {
      this.toLang = 'mysql'
      editor.setModelLanguage(model, 'mysql')
      value = jsonToMySQL(json)
    } else if (this.to === 'JSDoc') {
      this.toLang = 'javascript'
      editor.setModelLanguage(model, 'javascript')
      value = jsonToJSDoc(json)
    }
    this.editor().setValue(value)
  }

  async checkFrom() {
    let type = ''
    if (!this.value.trim()) {
      this.type = I18nT('tools.inputCheckFailTips')
      this.transformTo()
      return
    }

    try {
      const u = new URL(this.value)
      const obj: any = {}
      Object.entries(Object.fromEntries(u?.searchParams?.entries() ?? [])).forEach(([k, v]) => {
        console.log('k: ', k, v)
        obj[k] = v
      })
      this.json = {
        Protocol: u.protocol,
        Username: u.username,
        Password: u.password,
        Hostname: u.hostname,
        Port: u.port,
        Path: u.pathname,
        Params: u.search,
        ParamObject: obj
      }
      console.log('this.json: ', this.json)
      type = 'JSON'
    } catch {
      this.json = null
      type = ''
    }
    console.log('type 000: ', type)
    if (type) {
      this.type = type
      this.transformTo()
      return
    }

    try {
      this.json = javascriptToJson(this.value)
      type = 'JSON'
    } catch {
      this.json = null
      type = ''
    }
    console.log('type 000: ', type)
    if (type) {
      this.type = type
      this.transformTo()
      return
    }

    try {
      this.json = phpToJson(this.value)
      type = 'PHP'
    } catch {
      this.json = null
      type = ''
    }
    console.log('type 111: ', type)
    if (type) {
      this.type = type
      this.transformTo()
      return
    }

    try {
      this.json = plistToJson(this.value)
      type = 'PList'
    } catch {
      this.json = null
      type = ''
    }
    console.log('type 222: ', type)
    if (type) {
      this.type = type
      this.transformTo()
      return
    }

    try {
      this.json = xmlToJson(this.value)
      type = 'XML'
    } catch {
      this.json = null
      type = ''
    }
    console.log('type 333: ', type)
    if (type) {
      this.type = type
      this.transformTo()
      return
    }

    try {
      this.json = yamlToJson(this.value)
      type = 'YAML'
    } catch {
      this.json = null
      type = ''
    }
    console.log('type 444: ', type)
    if (type) {
      this.type = type
      this.transformTo()
      return
    }

    try {
      this.json = await tomlToJson(this.value)
      type = 'TOML'
    } catch {
      this.json = null
      type = ''
    }
    console.log('type 555: ', type)
    if (type) {
      this.type = type
      this.transformTo()
      return
    }

    this.type = I18nT('tools.inputCheckFailTips')
    this.transformTo()
  }
}

export type CodePlayType = {
  index: number
  currentTab: string
  style: any
  tabs: { [k: string]: CodePlayTab }
  langBin: { [k: string]: string }
  init: () => void
  save: () => void
}

let style: any = localStorage.getItem('FlyEnv-CodePlay-LeftStyle')
if (style) {
  style = JSON.parse(style)
}

const CodePlay: CodePlayType = reactive({
  index: 1,
  currentTab: 'tab-1',
  style: style,
  langBin: {},
  tabs: {
    'tab-1': reactive(new CodePlayTab())
  },
  init() {
    localForage
      .getItem('FlyEnv-CodePlay-LangBin')
      .then((res: any) => {
        if (res && res?.langBin) {
          CodePlay.langBin = reactive(res.langBin)
        }
        if (res && res?.tabs) {
          for (const k in res.tabs) {
            CodePlay.tabs?.[k]?.destroy?.()
            CodePlay.tabs[k] = reactive(new CodePlayTab(res.tabs[k]))
            CodePlay.tabs[k].initWatch()
          }
        }
      })
      .catch()
  },
  save() {
    const tabs: any = {}
    for (const k in CodePlay.tabs) {
      const v = CodePlay.tabs[k]
      tabs[k] = {
        value: v.value,
        json: v.json,
        type: v.type,
        from: v.from,
        to: v.to,
        toValue: v.toValue,
        toLang: v.toLang
      }
    }
    localForage.setItem('FlyEnv-CodePlay-LangBin', {
      langBin: { ...CodePlay.langBin },
      tabs
    })
  }
})

const tab = CodePlay.tabs['tab-1']
tab.destroy = tab.destroy.bind(tab)
tab.initWatch = tab.initWatch.bind(tab)
tab.initWatch()

export default CodePlay
