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
import localForage from 'localforage'
import { detectLanguage } from '@/components/Tools/CodePlayground/languageDetector'
import { BrewStore } from '@/store/brew'
import type { AllAppModule } from '@/core/type'
import { ModuleInstalledItem } from '@/core/Module/ModuleInstalledItem'
import IPC from '@/util/IPC'
import { MessageError } from '@/util/Element'

export class CodePlayTab {
  value = ''
  json: any = null
  fromType = ''
  fromPath = ''
  to = 'raw'
  toValue = ''
  toLang = 'javascript'
  editor!: () => editor.IStandaloneCodeEditor
  fromEditor!: () => editor.IStandaloneCodeEditor
  execing = false

  watcher1: any = null
  watcher2: any = null

  constructor(obj?: any) {
    Object.assign(this, obj)
  }

  initFromModelLanguage() {
    if (!this.fromEditor || !this.fromType) {
      return
    }

    const languageMap: any = {
      javascript: 'javascript',
      typescript: 'typescript',
      php: 'php',
      java: 'java',
      golang: 'go',
      rust: 'rust',
      erlang: 'erlang', // 修正：应该使用 'erlang' 而不是 'json'
      python: 'python',
      ruby: 'ruby',
      perl: 'perl'
    }

    const model = this.fromEditor().getModel()
    if (model) {
      const language = languageMap[this.fromType] || 'plaintext'
      editor.setModelLanguage(model, language)
    }
  }

  run() {
    if (this.execing) {
      return
    }
    this.execing = true
    console.log('codeRun: ', Math.round(new Date().getTime() / 1000))
    console.time('codeRun')
    IPC.send(`app-fork:code`, 'codeRun', this.value, this.fromType, this.fromPath).then(
      async (key: string, res: any) => {
        if (res.code === 0) {
          IPC.off(key)
          this.toValue = res?.data ?? ''
          this.transformTo().catch()
        } else if (res.code === 1) {
          IPC.off(key)
          MessageError(res?.msg ?? '')
        }
        this.execing = false
        console.timeEnd('codeRun')
      }
    )
  }

  initWatch() {
    this.watcher1 = watch(
      () => this.value,
      (v) => {
        if (this.fromType) {
          return
        }
        const lang = detectLanguage(v)
        if (lang) {
          let installed: ModuleInstalledItem[] = []
          const brewStore = BrewStore()
          if (lang === 'typescript' || lang === 'javascript') {
            const jsModules: AllAppModule[] = ['node', 'bun', 'deno']
            for (const m of jsModules) {
              installed = brewStore.module(m).installed
              if (installed.length > 0) {
                break
              }
            }
          } else {
            installed = brewStore.module(lang as AllAppModule).installed
          }
          this.fromType = lang
          const saved = CodePlay.langBin?.[lang]
          if (saved && installed.some((f) => f.path === saved)) {
            this.fromPath = saved
          } else if (installed.length > 0) {
            const find = installed[0]
            this.fromPath = find.path
            CodePlay.langBin[lang] = find.path
            CodePlay.save()
          }
        }
      }
    )
    this.watcher2 = watch(
      () =>
        JSON.stringify({
          type: this.fromType,
          path: this.fromPath
        }),
      (v) => {
        this.initFromModelLanguage()
        const json = JSON.parse(v)
        const lang = json.type
        const installed: ModuleInstalledItem[] = []
        const brewStore = BrewStore()
        if (lang === 'typescript' || lang === 'javascript') {
          const jsModules: AllAppModule[] = ['node', 'bun', 'deno']
          for (const m of jsModules) {
            installed.push(...brewStore.module(m).installed)
          }
        } else {
          installed.push(...brewStore.module(lang as AllAppModule).installed)
        }
        const binPath = json.path
        if (binPath && installed.some((f) => f.path === binPath)) {
          CodePlay.langBin[lang] = binPath
          CodePlay.save()
          return
        }
        const saved = CodePlay.langBin?.[lang]
        if (saved && installed.some((f) => f.path === saved)) {
          this.fromPath = saved
        } else if (installed.length > 0) {
          const find = installed[0]
          this.fromPath = find.path
          CodePlay.langBin[lang] = find.path
          CodePlay.save()
        }
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

  async transformTo(sort?: 'asc' | 'desc') {
    const model = this.editor().getModel()!
    if (this.to === 'raw') {
      this.toLang = 'json'
      editor.setModelLanguage(model, 'json')
      this.editor().setValue(this.toValue)
      return
    }
    let value = this.toValue
    if (this.to === 'json') {
      try {
        this.json = javascriptToJson(this.value)
      } catch {
        this.json = null
      }
      if (this.json) {
        let json = JSON.parse(JSON.stringify(this.json))
        if (sort) {
          json = JSONSort(json, sort)
        }
        this.toLang = 'json'
        editor.setModelLanguage(model, 'json')
        value = JSON.stringify(json, null, 4)
      } else {
        this.toLang = 'json'
        editor.setModelLanguage(model, 'json')
      }
    } else if (this.to === 'json-minify') {
      try {
        this.json = javascriptToJson(this.value)
      } catch {
        this.json = null
      }
      if (this.json) {
        let json = JSON.parse(JSON.stringify(this.json))
        if (sort) {
          json = JSONSort(json, sort)
        }
        this.toLang = 'json'
        editor.setModelLanguage(model, 'json')
        value = JSON.stringify(json)
      } else {
        this.toLang = 'json'
        editor.setModelLanguage(model, 'json')
      }
    } else if (this.to === 'js') {
      try {
        this.json = javascriptToJson(this.value)
      } catch {
        this.json = null
      }
      if (this.json) {
        let json = JSON.parse(JSON.stringify(this.json))
        if (sort) {
          json = JSONSort(json, sort)
        }
        this.toLang = 'javascript'
        editor.setModelLanguage(model, 'javascript')
        value = jsonToJSON(json)
      } else {
        this.toLang = 'javascript'
        editor.setModelLanguage(model, 'javascript')
      }
    } else if (this.to === 'php') {
      try {
        this.json = phpToJson(this.value)
      } catch {
        this.json = null
      }
      if (this.json) {
        let json = JSON.parse(JSON.stringify(this.json))
        if (sort) {
          json = JSONSort(json, sort)
        }
        this.toLang = 'php'
        editor.setModelLanguage(model, 'php')
        value = JSON.stringify(json, null, 4)
        value = value.replace(/": /g, `" => `).replace(/\{/g, '[').replace(/\}/g, ']')
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
      } else {
        this.toLang = 'php'
        editor.setModelLanguage(model, 'php')
      }
    } else if (this.to === 'xml') {
      try {
        this.json = xmlToJson(this.value)
      } catch {
        this.json = null
      }
      if (this.json) {
        let json = JSON.parse(JSON.stringify(this.json))
        if (sort) {
          json = JSONSort(json, sort)
        }
        this.toLang = 'xml'
        editor.setModelLanguage(model, 'xml')
        value = jsonToXML(json)
        console.log('xml value: ', value)
        FormatHtml(value)
          .then((xml: string) => {
            this.editor().setValue(xml)
          })
          .catch(() => {
            this.editor().setValue(value)
          })
        return
      } else {
        this.toLang = 'xml'
        editor.setModelLanguage(model, 'xml')
      }
    } else if (this.to === 'plist') {
      try {
        this.json = plistToJson(this.value)
      } catch {
        this.json = null
      }
      if (this.json) {
        let json = JSON.parse(JSON.stringify(this.json))
        if (sort) {
          json = JSONSort(json, sort)
        }
        this.toLang = 'xml'
        editor.setModelLanguage(model, 'xml')
        value = jsonToPList(json)
        FormatHtml(value)
          .then((xml: string) => {
            this.editor().setValue(xml)
          })
          .catch(() => {
            this.editor().setValue(value)
          })
        return
      } else {
        this.toLang = 'xml'
        editor.setModelLanguage(model, 'xml')
      }
    } else if (this.to === 'yaml') {
      try {
        this.json = yamlToJson(this.value)
      } catch {
        this.json = null
      }
      if (this.json) {
        let json = JSON.parse(JSON.stringify(this.json))
        if (sort) {
          json = JSONSort(json, sort)
        }
        this.toLang = 'yaml'
        editor.setModelLanguage(model, 'yaml')
        value = jsonToYAML(json)
        FormatYaml(value)
          .then((xml: string) => {
            this.editor().setValue(xml)
          })
          .catch(() => {
            this.editor().setValue(value)
          })
        return
      } else {
        this.toLang = 'yaml'
        editor.setModelLanguage(model, 'yaml')
      }
    } else if (this.to === 'ts') {
      try {
        this.json = javascriptToJson(this.value)
      } catch {
        this.json = null
      }
      if (this.json) {
        let json = JSON.parse(JSON.stringify(this.json))
        if (sort) {
          json = JSONSort(json, sort)
        }
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
      } else {
        this.toLang = 'typescript'
        editor.setModelLanguage(model, 'typescript')
      }
    } else if (this.to === 'toml') {
      try {
        this.json = await tomlToJson(this.value)
      } catch {
        this.json = null
      }
      if (this.json) {
        let json = JSON.parse(JSON.stringify(this.json))
        if (sort) {
          json = JSONSort(json, sort)
        }
        this.toLang = 'toml'
        editor.setModelLanguage(model, 'toml')
        jsonToTOML(json).then((res) => {
          value = res
          this.editor().setValue(value)
        })
      } else {
        this.toLang = 'toml'
        editor.setModelLanguage(model, 'toml')
      }
    } else if (this.to === 'goStruct') {
      try {
        this.json = javascriptToJson(this.value)
      } catch {
        this.json = null
      }
      if (this.json) {
        let json = JSON.parse(JSON.stringify(this.json))
        if (sort) {
          json = JSONSort(json, sort)
        }
        this.toLang = 'go'
        editor.setModelLanguage(model, 'go')
        value = jsonToGoStruct(json)
      } else {
        this.toLang = 'go'
        editor.setModelLanguage(model, 'go')
      }
    } else if (this.to === 'goBson') {
      try {
        this.json = javascriptToJson(this.value)
      } catch {
        this.json = null
      }
      if (this.json) {
        let json = JSON.parse(JSON.stringify(this.json))
        if (sort) {
          json = JSONSort(json, sort)
        }
        this.toLang = 'go'
        editor.setModelLanguage(model, 'go')
        value = jsonToGoBase(json)
      } else {
        this.toLang = 'go'
        editor.setModelLanguage(model, 'go')
      }
    } else if (this.to === 'Java') {
      try {
        this.json = javascriptToJson(this.value)
      } catch {
        this.json = null
      }
      if (this.json) {
        let json = JSON.parse(JSON.stringify(this.json))
        if (sort) {
          json = JSONSort(json, sort)
        }
        this.toLang = 'java'
        editor.setModelLanguage(model, 'java')
        value = jsonToJava(json)
      } else {
        this.toLang = 'java'
        editor.setModelLanguage(model, 'java')
      }
    } else if (this.to === 'Kotlin') {
      try {
        this.json = javascriptToJson(this.value)
      } catch {
        this.json = null
      }
      if (this.json) {
        let json = JSON.parse(JSON.stringify(this.json))
        if (sort) {
          json = JSONSort(json, sort)
        }
        this.toLang = 'kotlin'
        editor.setModelLanguage(model, 'kotlin')
        value = jsonToKotlin(json)
      } else {
        this.toLang = 'kotlin'
        editor.setModelLanguage(model, 'kotlin')
      }
    } else if (this.to === 'rustSerde') {
      try {
        this.json = javascriptToJson(this.value)
      } catch {
        this.json = null
      }
      if (this.json) {
        let json = JSON.parse(JSON.stringify(this.json))
        if (sort) {
          json = JSONSort(json, sort)
        }
        this.toLang = 'rust'
        editor.setModelLanguage(model, 'rust')
        value = jsonToRust(json)
      } else {
        this.toLang = 'rust'
        editor.setModelLanguage(model, 'rust')
      }
    } else if (this.to === 'MySQL') {
      try {
        this.json = javascriptToJson(this.value)
      } catch {
        this.json = null
      }
      if (this.json) {
        let json = JSON.parse(JSON.stringify(this.json))
        if (sort) {
          json = JSONSort(json, sort)
        }
        this.toLang = 'mysql'
        editor.setModelLanguage(model, 'mysql')
        value = jsonToMySQL(json)
      } else {
        this.toLang = 'mysql'
        editor.setModelLanguage(model, 'mysql')
      }
    } else if (this.to === 'JSDoc') {
      try {
        this.json = javascriptToJson(this.value)
      } catch {
        this.json = null
      }
      if (this.json) {
        let json = JSON.parse(JSON.stringify(this.json))
        if (sort) {
          json = JSONSort(json, sort)
        }
        this.toLang = 'javascript'
        editor.setModelLanguage(model, 'javascript')
        value = jsonToJSDoc(json)
      } else {
        this.toLang = 'javascript'
        editor.setModelLanguage(model, 'javascript')
      }
    }
    this.editor().setValue(value)
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
      .getItem('flyenv-code-playground')
      .then((res: any) => {
        if (res && res?.langBin) {
          CodePlay.langBin = reactive(res.langBin)
        }
        if (res && res?.tabs) {
          let index = 0
          for (const k in res.tabs) {
            const i = Number(k.split('-').pop())
            index = Math.max(index, i)
            CodePlay.tabs?.[k]?.destroy?.()
            CodePlay.tabs[k] = reactive(new CodePlayTab(res.tabs[k]))
            CodePlay.tabs[k].initWatch()
          }
          CodePlay.index = index
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
        fromType: v.fromType,
        fromPath: v.fromPath,
        to: v.to,
        toValue: v.toValue,
        toLang: v.toLang
      }
    }
    localForage.setItem('flyenv-code-playground', {
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
