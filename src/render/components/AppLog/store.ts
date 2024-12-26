import { reactive } from 'vue'
import IPC from '@/util/IPC'

const { writeFile, readFile, existsSync } = require('fs-extra')
const { writeFileSync } = require('fs')
const { join } = require('path')
const { shell } = require('@electron/remote')

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
    const file = join(global.Server.BaseDir!, 'app.log')
    return existsSync(file)
  },
  open() {
    const file = join(global.Server.BaseDir!, 'app.log')
    if (existsSync(file)) {
      shell.showItemInFolder(file)
    }
  },
  clean() {
    this.timer && clearTimeout(this.timer)
    const file = join(global.Server.BaseDir!, 'app.log')
    writeFileSync(file, '')
    this.log.splice(0)
  },
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
