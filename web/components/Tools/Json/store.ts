import { reactive } from 'vue'
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
} from '@shared/transform'
import { JSONSort } from '@shared/JsonSort'
import { editor } from 'monaco-editor/esm/vs/editor/editor.api.js'
import { FormatHtml, FormatPHP, FormatTS, FormatYaml } from '@shared/FormatCode'
import { I18nT } from '@shared/lang'

export class JSONStoreTab {
  value = ''
  json: any = null
  type = ''
  to = 'json'
  toValue = ''
  toLang = 'javascript'
  editor!: () => editor.IStandaloneCodeEditor
  constructor() {
    this.value = I18nT('tools.inputTips')
    this.type = I18nT('tools.noInputTips')
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
      value = jsonToTOML(json)
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

  checkFrom() {
    let type = ''
    try {
      this.json = javascriptToJson(this.value)
      type = 'JSON'
    } catch (e) {
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
    } catch (e) {
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
    } catch (e) {
      console.log('e 222: ', e)
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
    } catch (e) {
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
    } catch (e) {
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
      this.json = tomlToJson(this.value)
      type = 'TOML'
    } catch (e) {
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

export type JSONStoreType = {
  index: number
  currentTab: string
  style: any
  tabs: { [k: string]: JSONStoreTab }
}

let style: any = localStorage.getItem('PWS-JSON-LeftStle')
if (style) {
  style = JSON.parse(style)
}

const JSONStore: JSONStoreType = {
  index: 1,
  currentTab: 'tab-1',
  style: style,
  tabs: {
    'tab-1': new JSONStoreTab()
  }
}

export default reactive(JSONStore)
