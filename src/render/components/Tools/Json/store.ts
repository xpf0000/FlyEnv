import { reactive } from 'vue'
import {
  javascriptToJson,
  jsonToJSON,
  jsonToPList,
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
import { FormatHtml, FormatPHP, FormatTOML, FormatTS, FormatYaml } from '@shared/FormatCode'

export class JSONStoreTab {
  value = ''
  json: any = null
  type = ''
  to = 'json'
  toValue = ''
  toLang = 'javascript'
  editor!: () => editor.IStandaloneCodeEditor
  constructor() {
    this.value = '输入 JSON, JavaScript对象或数组, PHP Array, XML, YAML, PList. 自动转换成所选格式'
    this.type = '请输入内容'
  }

  transformTo(sort?: 'asc' | 'desc') {
    if (!this.json) {
      this.editor().setValue('输入内容格式不正确')
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
      FormatPHP(value).then((php: string) => {
        this.editor().setValue(php)
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
      FormatHtml(value).then((xml: string) => {
        this.editor().setValue(xml)
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
      FormatHtml(value).then((xml: string) => {
        this.editor().setValue(xml)
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
      FormatYaml(value).then((xml: string) => {
        this.editor().setValue(xml)
      })
      return
    } else if (this.to === 'ts') {
      this.toLang = 'typescript'
      editor.setModelLanguage(model, 'typescript')
      value = jsonToTs(json)
      FormatTS(value).then((ts) => {
        this.editor().setValue(ts)
      })
      return
    } else if (this.to === 'toml') {
      this.toLang = 'toml'
      editor.setModelLanguage(model, 'toml')
      if (this.type === 'TOML') {
        value = this.value
      } else {
        value = jsonToTOML(json)
      }
      FormatTOML(value).then((ts) => {
        this.editor().setValue(ts)
      })
      return
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

    this.type = '未识别'
    this.transformTo()
  }
}

export type JSONStoreType = {
  index: number
  currentTab: string
  tabs: { [k: string]: JSONStoreTab }
}

const JSONStore: JSONStoreType = {
  index: 1,
  currentTab: 'tab-1',
  tabs: {
    'tab-1': new JSONStoreTab()
  }
}

export default reactive(JSONStore)
