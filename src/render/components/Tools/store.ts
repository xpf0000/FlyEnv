import type { AppToolModuleItem } from '@/core/type'
import { reactive } from 'vue'
import IPC from '@/util/IPC'
import { MessageError, MessageSuccess } from '@/util/Element'
import { I18nT } from '@shared/lang'

export type AppToolStoreType = {
  id: string
  expand: boolean
  search: string
  custom: AppToolModuleItem[]
  like: string[]
  adding: boolean
  init: () => void
  toDo: (action: string, item?: AppToolModuleItem) => Promise<boolean>
  doAdd: (item: AppToolModuleItem) => Promise<undefined>
  doDel: (item: AppToolModuleItem) => void
  doLike: (item: AppToolModuleItem) => void
  doUnLike: (item: AppToolModuleItem) => void
}

export const AppToolStore = reactive({
  id: 'home',
  expand: true,
  search: '',
  custom: [],
  like: [],
  adding: false,
  toDo(action: string, item?: AppToolModuleItem) {
    return new Promise((resolve) => {
      IPC.send('app-fork:tools', action, JSON.parse(JSON.stringify(item ?? {}))).then(
        (key: string, res: any) => {
          IPC.off(key)
          if (res?.code === 0) {
            const custom = res?.data?.custom ?? []
            const like = res?.data?.like ?? []
            this.custom = reactive(custom)
            this.like = reactive(like)
            MessageSuccess(I18nT('base.success'))
          } else {
            MessageError(I18nT('base.fail'))
          }
          resolve(true)
        }
      )
    })
  },
  init() {
    this.toDo('initTools').then().catch()
  },
  async doAdd(item: AppToolModuleItem) {
    if (this.adding) {
      return
    }
    this.adding = true
    await this.toDo('addCustomTools', item)
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
    this.toDo('delCustomTools', item).then().catch()
  },
  doLike(item: AppToolModuleItem) {
    if (this.like.includes(item.id)) {
      return
    }
    this.like.push(item.id)
    this.toDo('toolsLike', item).then().catch()
  },
  doUnLike(item: AppToolModuleItem) {
    const index = this.like.indexOf(item.id)
    if (index >= 0) {
      this.like.splice(index, 1)
    }
    this.toDo('toolsUnLike', item).then().catch()
  }
} as AppToolStoreType)
