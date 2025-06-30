import { reactive, markRaw } from 'vue'
import { join, basename } from '@/util/path-browserify'
import { DirWatcher, FileWatcher, fs } from '@/util/NodeFn'

type NginxRewriteItem = {
  name: string
  content: string
}

export const HostNginxRewriteSetup: {
  nginxRewriteDefault: Record<string, NginxRewriteItem>
  nginxRewriteCustom: Record<string, NginxRewriteItem>
  fileWatcher: FileWatcher | null
  templateWatcher: DirWatcher | null
  initFileWatch: (file: string, fn: () => void) => void
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
    HostNginxRewriteSetup.templateWatcher?.close()
    HostNginxRewriteSetup.templateWatcher = null
  },
  initNginxRewriteCustomWatch() {
    HostNginxRewriteSetup.templateWatcher?.close()
    const dir = join(window.Server.BaseDir!, 'NginxRewriteTemplate')
    HostNginxRewriteSetup.templateWatcher = markRaw(
      new DirWatcher(dir, async (file: string) => {
        const name = basename(file)
        const exists = await fs.existsSync(file)
        if (exists) {
          HostNginxRewriteSetup.nginxRewriteCustom[file] = reactive({
            name,
            content: ''
          })
        } else {
          delete HostNginxRewriteSetup.nginxRewriteCustom[file]
        }
      })
    )
  },
  initNginxRewrites() {
    if (Object.keys(HostNginxRewriteSetup.nginxRewriteDefault).length === 0) {
      const dir = join(window.Server.Static!, 'rewrite')
      fs.readdir(dir, false).then((files) => {
        console.log('initNginxRewrites dir files: ', files)
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
      const dir = join(window.Server.BaseDir!, 'NginxRewriteTemplate')
      fs.mkdirp(dir).then().catch()
      fs.readdir(dir, false).then(async (files) => {
        files = files.sort()
        for (const file of files) {
          const k = join(dir, file)
          const exists = await fs.existsSync(k)
          if (!exists) {
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
  initFileWatch(file: string, fn: () => void) {
    console.log('initFileWatch !!!', file)
    HostNginxRewriteSetup.fileWatcher?.close()
    HostNginxRewriteSetup.fileWatcher = markRaw(new FileWatcher(file, fn))
  },
  deinitFileWatch() {
    HostNginxRewriteSetup.fileWatcher?.close()
    HostNginxRewriteSetup.fileWatcher = null
  },
  save() {}
})
