import { reactive, watch } from 'vue'
import localForage from 'localforage'
import { languagesToCheck } from '../CodePlayground/languageDetector'

type CodeLibraryLangItemType = {
  type: string
  show: boolean
}

type CodeLibraryGroupType = {
  id: string
  type: string
  name: string
}

type CodeLibraryItemType = {
  id: string
  groupID: string
  value: string
  json?: string
  fromType: string
  fromPath?: string
  to?: string
  toValue: string
  toLang?: string
}

export type CodeLibraryType = {
  langs: CodeLibraryLangItemType[]
  group: CodeLibraryGroupType[]
  items: CodeLibraryItemType[]
  langType: string
  groupID: string
  itemID: string
  init: () => void
  save: () => void
}

let timer: any
let inited: boolean = false
const CodeLibrary: CodeLibraryType = reactive({
  langs: languagesToCheck.sort().map((m: string) => {
    return {
      type: m,
      show: true
    }
  }),
  group: [],
  items: [],
  langType: '',
  groupID: '',
  itemID: '',
  init() {
    if (inited) {
      return
    }
    inited = true
    localForage
      .getItem('flyenv-code-library')
      .then((res: any) => {
        Object.assign(CodeLibrary, res)
        if (!CodeLibrary.langType) {
          const find = CodeLibrary.langs.find((f) => f.show)
          if (find) {
            CodeLibrary.langType = find.type
          }
        }
        watch(
          CodeLibrary,
          () => {
            clearTimeout(timer)
            setTimeout(CodeLibrary.save, 800)
          },
          {
            deep: true
          }
        )
      })
      .catch()
  },
  save() {
    localForage.setItem('flyenv-code-library', JSON.parse(JSON.stringify(CodeLibrary))).catch()
  }
})

export default CodeLibrary
