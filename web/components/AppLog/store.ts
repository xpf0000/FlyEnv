import { reactive } from 'vue'

type AppLogType = {
  log: string[]
  timer: any
  index: number
  open: () => void
  clean: () => void
  init: () => Promise<undefined>
  save: () => Promise<undefined>
  checkLogFile: () => boolean
}

export const AppLogStore = reactive({
  log: [],
  timer: undefined,
  index: 0,
  checkLogFile() {
    if (this.index < 0) {
      return false
    }
    return true
  },
  open() {},
  clean() {
    this.log.splice(0)
  },
  async save() {},
  async init() {
    import('@web/config/app.log.txt?raw').then((res) => {
      const content = res.default
      this.log = reactive(content.split('\n'))
    })
  }
} as AppLogType)

AppLogStore.init()
