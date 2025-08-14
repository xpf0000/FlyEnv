import { reactive, watch } from 'vue'
import localForage from 'localforage'
import { languagesToCheck } from '../CodePlayground/languageDetector'
import { ElMessageBox } from 'element-plus'
import { I18nT } from '@lang/index'
import { uuid } from '@/util/Index'
import Base from '@/core/Base'

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
  onLangChange: () => void
  addGroup: (langType: string, item?: CodeLibraryGroupType) => void
  delGroup: (langType: string, item: CodeLibraryGroupType) => void
  itemMoveToTop: (item: CodeLibraryItemType) => void
  groupMoveToTop: (item: CodeLibraryGroupType) => void
}

let timer: any
let inited: boolean = false
const CodeLibrary: CodeLibraryType = reactive({
  langs: [],
  group: [],
  items: [],
  langType: '',
  groupID: '',
  itemID: '',
  onLangChange() {
    CodeLibrary.groupID = ''
    CodeLibrary.itemID = ''
    let find: any = CodeLibrary.items.find((f) => f.fromType === CodeLibrary.langType && !f.groupID)
    if (find) {
      CodeLibrary.itemID = find.id
      return
    }
    find = CodeLibrary.group.find((f) => f.type === CodeLibrary.langType)
    if (find) {
      CodeLibrary.groupID = find.id
      return
    }
  },
  groupMoveToTop(item: CodeLibraryGroupType) {
    CodeLibrary.group = CodeLibrary.group.filter((f) => f.id !== item.id)
    CodeLibrary.group.unshift(item)
  },
  itemMoveToTop(item: CodeLibraryItemType) {
    CodeLibrary.items = CodeLibrary.items.filter((f) => f.id !== item.id)
    CodeLibrary.items.unshift(item)
  },
  delGroup(langType: string, item: CodeLibraryGroupType) {
    Base._Confirm(I18nT('tools.GroupDelTips'), I18nT('tools.GroupDelTitle'), {
      customClass: 'confirm-del',
      type: 'warning'
    })
      .then(() => {
        CodeLibrary.group = CodeLibrary.group.filter((f) => f.id !== item.id)
        CodeLibrary.items = CodeLibrary.items.filter((f) => f.groupID !== item.id)
        if (CodeLibrary.groupID === item.id) {
          const groups = CodeLibrary.group.filter((f) => f.type === langType)
          if (groups.length > 0) {
            const group = groups[0]
            CodeLibrary.groupID = group.id
            CodeLibrary.itemID = ''
          }
        }
      })
      .catch(() => {})
  },
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
        if (!CodeLibrary.langs.length) {
          CodeLibrary.langs = languagesToCheck.sort().map((m: string) => {
            return {
              type: m,
              show: true
            }
          })
        }
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
      .catch(() => {
        if (!CodeLibrary.langs.length) {
          CodeLibrary.langs = languagesToCheck.sort().map((m: string) => {
            return {
              type: m,
              show: true
            }
          })
        }
      })
  },
  save() {
    localForage.setItem('flyenv-code-library', JSON.parse(JSON.stringify(CodeLibrary))).catch()
  }
})

export default CodeLibrary
