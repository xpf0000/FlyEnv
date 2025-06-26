import request from '@shared/request'
import Config from './Config'
import { checkIsExcludeUrl } from './Fn'
import { Store } from './Store'
import { wait, existsSync, mkdirp, createWriteStream, removeSync, stat } from '../../utils'
import { dirname } from 'path'
import type { LinkItem } from './LinkItem'

class LinkTaskItem {
  isDestroy?: boolean

  constructor() {}

  #retry(link: LinkItem) {
    const index = Store.Links.findIndex((f) => f === link)
    if (index >= 0) {
      Store.Links.splice(index, 1)
    }
    link.state = 'wait'
    Store.Links.push(link)
  }

  async run() {
    if (this.isDestroy) {
      return
    }
    const link = Store.Links.shift()
    if (!link) {
      await wait()
      this.run().then()
      return
    }
    if (link) {
      if (checkIsExcludeUrl(link.url, false)) {
        this.run().then()
        return
      }

      if (link.retry && link.retry >= Config.maxRetryTimes) {
        console.log('fetchLink retryCount out: ', link.retry, link)
        link.state = 'fail'
        this.run().then()
        return
      }

      link.state = 'running'

      if (!link.retry) {
        link.retry = 1
      } else {
        link.retry += 1
      }

      let timer: NodeJS.Timeout
      const next = () => {
        clearTimeout(timer)
        link.state = 'success'
        this.run().then()
      }
      const saveFile = link.saveFile
      let size = 0
      if (existsSync(saveFile)) {
        const info = await stat(saveFile)
        size = info.size
      }
      if (size > 0) {
        next()
      } else {
        const dir = dirname(saveFile)
        try {
          await mkdirp(dir)
        } catch {}
        const stream = createWriteStream(saveFile)
        const onError = () => {
          this.#retry(link)
          try {
            stream.close(() => {
              if (existsSync(saveFile)) {
                removeSync(saveFile)
              }
              this.run().then()
            })
          } catch {
            this.run().then()
          }
        }
        stream.on('finish', () => {
          stream.close(() => {
            next()
          })
        })
        stream.on('error', () => {
          onError()
        })
        const controller = new AbortController()
        const taskFail = () => {
          try {
            controller.abort()
          } catch {}
          onError()
        }
        timer = setTimeout(taskFail, Config.timeout)
        request({
          url: link.url,
          timeout: Config.timeout,
          method: 'get',
          responseType: 'stream',
          headers: {
            cookie: Store.cookie
          },
          signal: controller.signal
        })
          .then((res) => {
            clearTimeout(timer)
            const type = res.headers['content-type']
            const size = parseInt(res.headers['content-length'] ?? '0')
            link.type = type
            link.size = size
            if (type.startsWith('image/')) {
              if (size > 0 && Config.maxImgSize > 0 && size > Config.maxImgSize * 1024 * 1024) {
                taskFail()
                return
              }
            } else if (type.startsWith('audio/') || type.startsWith('video/')) {
              if (size > 0 && Config.maxVideoSize > 0 && size > Config.maxVideoSize * 1024 * 1024) {
                taskFail()
                return
              }
            }
            if (!stream.destroyed) {
              res.data.pipe(stream)
            }
            /**
             * Some links take too long, set a timeout to skip them
             */
            timer = setTimeout(taskFail, Config.timeout)
          })
          .catch(() => {
            clearTimeout(timer)
            taskFail()
          })
      }
    }
  }

  destroy() {
    this.isDestroy = true
  }
}

class LinkTask {
  private task: LinkTaskItem[] = []
  init(num: number) {
    for (let i = 0; i < num; i += 1) {
      const item = new LinkTaskItem()
      this.task.push(item)
    }
  }
  async run() {
    for (const item of this.task) {
      item.run().then()
      await wait(350)
    }
  }

  destroy() {
    this.task.forEach((t) => {
      t.isDestroy = true
    })
    this.task.splice(0)
  }
}

export default new LinkTask()
