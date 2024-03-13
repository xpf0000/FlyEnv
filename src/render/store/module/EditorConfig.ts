import { reactive } from 'vue'

export type EditorTheme = 'vs-dark' | 'vs-light' | 'hc-dark' | 'hc-light' | 'auto'
export class EditorConfig {
  theme: EditorTheme
  fontSize: number
  lineHeight: number

  constructor() {
    this.theme = 'auto'
    this.fontSize = 16
    this.lineHeight = 2.0
  }

  init(obj: any) {
    Object.assign(this, obj)
  }
}

export default reactive(new EditorConfig())
