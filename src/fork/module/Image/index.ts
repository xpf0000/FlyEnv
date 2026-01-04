import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import { getAllFileAsync } from '../../util/Dir'
import { stat } from '@shared/fs-extra'
import { basename, extname } from 'node:path'
import { TaskQueue, TaskQueueProgress } from '@shared/TaskQueue'
import { ImageInfoFetchTask } from './ImageInfoFetchTask'
import { ImageCompressTask, SharpConfig } from './ImageCompressTask'
import { cpus } from 'node:os'

type ImageFileItemType = {
  path: string
  name: string
}

class Image extends Base {
  exts = ['jpeg', 'jpg', 'png', 'webp', 'avif', 'gif', 'tiff', 'heif']

  constructor() {
    super()
  }

  fetchDirFile(dir: string) {
    return new ForkPromise(async (resolve, reject, on) => {
      let all: Array<ImageFileItemType> = []
      try {
        const dirStat = await stat(dir)
        const ext = extname(dir).replace('.', '').toLowerCase()
        if (dirStat.isFile() && this.exts.includes(ext)) {
          all = [
            {
              path: dir,
              name: basename(dir)
            }
          ]
        } else if (dirStat.isDirectory()) {
          const list = await getAllFileAsync(dir)
          all = list
            .filter((f: string) => {
              const ext = extname(f).replace('.', '').toLowerCase()
              return this.exts.includes(ext)
            })
            .map((m) => {
              return {
                path: m,
                name: basename(m)
              }
            })
        }
      } catch (e) {
        reject(e)
        return
      }
      if (!all.length) {
        return resolve([])
      }
      on({
        allFile: all
      })
      const taskQueue = new TaskQueue(cpus().length)
      taskQueue
        .progress((progress: TaskQueueProgress) => {
          on(progress)
        })
        .end(() => {
          resolve(true)
        })
        .initQueue(
          all.map((p) => {
            return new ImageInfoFetchTask(p.path, p.name)
          })
        )
        .run()
    })
  }

  doCompressTask(files: ImageInfoFetchTask[], config: SharpConfig) {
    return new ForkPromise((resolve, reject, on) => {
      const taskQueue = new TaskQueue(cpus().length)
      taskQueue
        .progress((progress: TaskQueueProgress) => {
          on(progress)
        })
        .end(() => {
          resolve(true)
        })
        .initQueue(
          files.map((p) => {
            return new ImageCompressTask(p, config)
          })
        )
        .run()
    })
  }
}
export default new Image()
