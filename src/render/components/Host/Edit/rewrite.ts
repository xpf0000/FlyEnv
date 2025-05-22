import { reactive, markRaw } from 'vue'
import { getAllFileAsync } from '@shared/file'
import type { FSWatcher, WatchEventType } from 'fs'

const { join } = require('path')
const { existsSync, mkdirp } = require('fs-extra')
const fsWatch = require('fs').watch

type NginxRewriteItem = {
  name: string
  content: string
}

export const HostNginxRewriteSetup: {
  nginxRewriteDefault: Record<string, NginxRewriteItem>
  nginxRewriteCustom: Record<string, NginxRewriteItem>
  fileWatcher: FSWatcher | null
  templateWatcher: FSWatcher | null
  initFileWatch: (file: string, fn: Function) => void
  deinitFileWatch: () => void
  initNginxRewrites: () => void
  deinitNginxRewriteCustomWatch: () => void
  initNginxRewriteCustomWatch: () => void
  save: () => void
} = reactive({
  nginxRewriteDefault: {},
  nginxRewriteCustom: {},
  fileWatcher: null,
  templateWatcher: null,
  deinitNginxRewriteCustomWatch() {
    HostNginxRewriteSetup.templateWatcher && HostNginxRewriteSetup.templateWatcher.close()
    HostNginxRewriteSetup.templateWatcher = null
  },
  initNginxRewriteCustomWatch() {
    HostNginxRewriteSetup.templateWatcher && HostNginxRewriteSetup.templateWatcher.close()
    const dir = join(global.Server.BaseDir!, 'NginxRewriteTemplate')
    HostNginxRewriteSetup.templateWatcher = markRaw(
      fsWatch(
        dir,
        {
          recursive: true
        },
        (event: WatchEventType, filename: string) => {
          console.log('event & filename: ', event, filename)
          if (filename) {
            const file = join(dir, filename)
            const k = filename.split('.').shift()!
            if (existsSync(file)) {
              HostNginxRewriteSetup.nginxRewriteCustom[file] = reactive({
                name: k,
                content: ''
              })
            } else {
              delete HostNginxRewriteSetup.nginxRewriteCustom[file]
            }
          }
        }
      )
    )
  },
  initNginxRewrites() {
    if (Object.keys(HostNginxRewriteSetup.nginxRewriteDefault).length === 0) {
      const dir = join(global.Server.Static!, 'rewrite')
      getAllFileAsync(dir, false).then((files) => {
        files = files.sort()
        for (const file of files) {
          const name = file.replace('.conf', '')
          const k = join(dir, file)
          HostNginxRewriteSetup.nginxRewriteDefault[k] = reactive({
            name,
            content: ''
          })
        }
      })
    }

    if (Object.keys(HostNginxRewriteSetup.nginxRewriteCustom).length === 0) {
      const dir = join(global.Server.BaseDir!, 'NginxRewriteTemplate')
      mkdirp(dir).then().catch()
      getAllFileAsync(dir, false).then((files) => {
        files = files.sort()
        for (const file of files) {
          const k = join(dir, file)
          if (!existsSync(k)) {
            continue
          }
          const name = file.split('.').shift()!
          HostNginxRewriteSetup.nginxRewriteCustom[k] = {
            name,
            content: ''
          }
        }
      })
    }
  },
  initFileWatch(file: string, fn: Function) {
    HostNginxRewriteSetup.fileWatcher && HostNginxRewriteSetup.fileWatcher.close()
    HostNginxRewriteSetup.fileWatcher = markRaw(fsWatch(file, fn))
  },
  deinitFileWatch() {
    HostNginxRewriteSetup.fileWatcher && HostNginxRewriteSetup.fileWatcher.close()
    HostNginxRewriteSetup.fileWatcher = null
  },
  save() {}
})
