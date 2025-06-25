import { reactive } from 'vue'
import IPC from '@/util/IPC'
import { join } from '@/util/path-browserify'
import { shell, fs } from '@/util/NodeFn'

type AppLogType = {
  log: string[]
  timer: any
  index: number
  open: () => void
  clean: () => void
  init: () => Promise<undefined>
  save: () => Promise<undefined>
}

export const AppLogStore = reactive({
  log: [],
  timer: undefined,
  index: 0,
  open() {
    const file = join(window.Server.BaseDir!, 'app.log')
    shell.showItemInFolder(file).then().catch()
  },
  clean() {
    clearTimeout(this.timer)
    const file = join(window.Server.BaseDir!, 'app.log')
    fs.writeFile(file, '').then().catch()
    this.log.splice(0)
  },
  async save() {
    const file = join(window.Server.BaseDir!, 'app.log')
    await fs.writeFile(file, this.log.join('\n'))
  },
  async init() {
    const file = join(window.Server.BaseDir!, 'app.log')
    if (await fs.existsSync(file)) {
      const content = await fs.readFile(file)
      this.log = reactive(content.split('\n'))
    }
    IPC.on('APP-On-Log').then((key: string, info: string) => {
      this.log.push(info)
      clearTimeout(this.timer)
      this.timer = setTimeout(async () => {
        await this.save()
      }, 1000)
    })
  }
} as AppLogType)
