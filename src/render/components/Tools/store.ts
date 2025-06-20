import type { AppToolModuleItem } from '@/core/type'
import { reactive } from 'vue'
import { uuid } from '@/util/Index'
import { join } from '@/util/path-browserify'
import { shell, fs } from '@/util/NodeFn'

const getToolData = async () => {
  let obj = {
    like: [],
    custom: []
  }
  const file = join(window.Server.BaseDir!, 'app.tools.json')
  const exists = await fs.existsSync(file)
  if (exists) {
    const json = await fs.readFile(file)
    try {
      obj = JSON.parse(json)
    } catch {
      /* empty */
    }
  }
  return obj
}

const setToolData = async (data: any) => {
  const file = join(window.Server.BaseDir!, 'app.tools.json')
  await fs.writeFile(file, JSON.stringify(data))
}

export type AppToolStoreType = {
  id: string
  expand: boolean
  search: string
  custom: AppToolModuleItem[]
  like: string[]
  adding: boolean
  init: () => void
  doAdd: (item: AppToolModuleItem) => Promise<undefined>
  doDel: (item: AppToolModuleItem) => void
  doLike: (item: AppToolModuleItem) => void
  doUnLike: (item: AppToolModuleItem) => void
  openUrl: (url: string) => void
}

export const AppToolStore = reactive({
  id: 'home',
  expand: true,
  search: '',
  custom: [],
  like: [],
  adding: false,
  openUrl(url: string) {
    shell.openExternal(url)
  },
  init() {
    getToolData()
      .then((res) => {
        const custom = res?.custom ?? []
        const like = res?.like ?? []
        this.custom = reactive(custom)
        this.like = reactive(like)
      })
      .catch()
  },
  async doAdd(item: AppToolModuleItem) {
    if (this.adding) {
      return
    }
    this.adding = true
    if (item?.id) {
      const find = this.custom.find((c: any) => c.id === item.id)
      if (find) {
        Object.assign(find, item)
      }
    } else {
      item.isCustom = true
      item.id = uuid()
      item.type = 'Custom'
      item.index = 0
      this.custom.unshift(item)
    }
    setToolData({ custom: this.custom, like: this.like }).then().catch()
    this.adding = false
    return
  },
  doDel(item: AppToolModuleItem) {
    let index = this.custom.findIndex((f) => f.id === item.id)
    if (index >= 0) {
      this.custom.splice(index, 1)
    }
    index = this.like.findIndex((f) => f === item.id)
    if (index >= 0) {
      this.like.splice(index, 1)
    }
    setToolData({ custom: this.custom, like: this.like }).then().catch()
  },
  doLike(item: AppToolModuleItem) {
    if (this.like.includes(item.id)) {
      return
    }
    this.like.push(item.id)
    setToolData({ custom: this.custom, like: this.like }).then().catch()
  },
  doUnLike(item: AppToolModuleItem) {
    const index = this.like.indexOf(item.id)
    if (index >= 0) {
      this.like.splice(index, 1)
    }
    setToolData({ custom: this.custom, like: this.like }).then().catch()
  }
} as AppToolStoreType)
