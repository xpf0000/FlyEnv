import { reactive } from 'vue'
import localForage from 'localforage'

type SearchHistoryTypeType = 'port' | 'process'

type SearchHistoryType = {
  inited: boolean
  search: Partial<Record<SearchHistoryTypeType, Array<string>>>
  init: () => void
  save: () => void
  add: (type: SearchHistoryTypeType, key: string) => void
}

const SearchHistoryKey = 'flyenv-search-history-key'

const SearchHistory = reactive<SearchHistoryType>({
  inited: false,
  search: {},
  init() {
    if (this.inited) {
      return
    }
    this.inited = true
    localForage
      .getItem(SearchHistoryKey)
      .then((res: any) => {
        if (res) {
          this.search = reactive(res?.search ?? {})
        }
      })
      .catch()
  },
  save() {
    const data = JSON.parse(JSON.stringify(this))
    delete data.inited
    localForage.setItem(SearchHistoryKey, data).catch()
  },
  add(type: SearchHistoryTypeType, key: string) {
    if (!this.search?.[type]) {
      this.search[type] = reactive([])
    }
    const arr = this.search[type]!.filter((s) => s !== key)
    if (arr.length >= 10) {
      arr.pop()
    }
    arr.unshift(key)
    this.search[type] = reactive(arr)
    this.save()
  }
})

SearchHistory.init = SearchHistory.init.bind(SearchHistory)
SearchHistory.save = SearchHistory.save.bind(SearchHistory)
SearchHistory.add = SearchHistory.add.bind(SearchHistory)

export { SearchHistory }
