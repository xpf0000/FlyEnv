import { reactive } from 'vue'

export type JSONStoreTab = {
  value: string
  json: any
  type: string
  to: string
  toValue: string
  toLang: string
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
    'tab-1': {
      value: '输入 JSON, JavaScript对象或数组, PHP Array, XML, YAML, PList. 自动转换成所选格式',
      json: null,
      type: '请输入内容',
      to: 'json',
      toValue: '',
      toLang: 'javascript'
    }
  }
}

export default reactive(JSONStore)
