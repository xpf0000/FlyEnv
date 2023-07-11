import { ref, Ref } from 'vue'
export type Ext = {
  ext: string
  count: number
}
export type BomCleanStore = {
  path: string
  files: Array<string>
  exclude: string
  allExt: Array<Ext>
  allowExt: Array<string>
  running: boolean
  end: boolean
  progress: {
    count: number
    finish: number
    fail: number
    failTask: Array<any>
    success: number
    successTask: Array<any>
  }
}
const store: Ref<BomCleanStore> = ref({
  path: '',
  files: [],
  exclude: `.idea
.git
.vscode
node_modules`,
  allExt: [],
  allowExt: [],
  running: false,
  end: false,
  progress: {
    count: 0,
    finish: 0,
    fail: 0,
    failTask: [],
    success: 0,
    successTask: []
  }
})
export default store
