import { reactive, watch } from 'vue'
import localForage from 'localforage'
import { languagesToCheck } from '../CodePlayground/languageDetector'
import { ElMessageBox } from 'element-plus'
import { I18nT } from '@lang/index'
import { uuid } from '@/util/Index'

type CodeLibraryLangItemType = {
  type: string
  show: boolean
}

type CodeLibraryGroupType = {
  id: string
  type: string
  name: string
}

export type CodeLibraryItemType = {
  id: string
  groupID: string
  value: string
  json?: string
  fromType: string
  fromPath?: string
  to?: string
  toValue: string
  toLang?: string
  comment: string
  name: string
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
  addGroup: (langType: string, item?: CodeLibraryGroupType) => void
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
  addGroup(langType: string, item?: CodeLibraryGroupType) {
    ElMessageBox.prompt(I18nT('tools.GroupNameInput'), I18nT('tools.GroupName'), {
      confirmButtonText: I18nT('base.confirm'),
      cancelButtonText: I18nT('base.cancel'),
      inputValue: item?.name ?? ''
    })
      .then(({ value }) => {
        if (!value.trim()) {
          return
        }
        if (item?.id) {
          const find = CodeLibrary.group.find((f) => f.id === item.id)
          if (find) {
            find.name = value.trim()
          }
        } else {
          const item = {
            id: uuid(),
            name: value.trim(),
            type: langType
          }
          CodeLibrary.group.unshift(item)
        }
      })
      .catch()
  },
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
