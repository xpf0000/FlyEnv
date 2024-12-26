import { reactive } from 'vue'
import IPC from '@/util/IPC'

const { writeFile, readFile, existsSync } = require('fs-extra')
const { join } = require('path')

type AppLogType = {
  log: string[]
  timer: any
  init: () => Promise<undefined>
  save: () => Promise<undefined>
}

export const AppLogStore = reactive({
  log: [],
  timer: undefined,
  async save() {
    const file = join(global.Server.BaseDir!, 'app.log')
    await writeFile(file, this.log.join('\n'))
  },
  async init() {
    const file = join(global.Server.BaseDir!, 'app.log')
    if (existsSync(file)) {
      const content = await readFile(file, 'utf-8')
      this.log = reactive(content.split('\n'))
    }
    IPC.on('APP-On-Log').then((key: string, info: string) => {
      this.log.push(info)
      this.timer && clearTimeout(this.timer)
      this.timer = setTimeout(async () => {
        await this.save()
      }, 1000)
    })
  }
} as AppLogType)
