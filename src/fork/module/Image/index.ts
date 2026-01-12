import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import { getAllFileAsync } from '../../util/Dir'
import { stat } from '@shared/fs-extra'
import { basename, extname, join, normalize, sep } from 'node:path'
import { TaskQueue, TaskQueueProgress } from '@shared/TaskQueue'
import { ImageInfoFetchTask } from './ImageInfoFetchTask'
import { ImageCompressTask } from './ImageCompressTask'
import { cpus } from 'node:os'
import type { SharpConfig } from './imageCompress.type'
import axios from 'axios'
import {
  imageBaseTest,
  imageCompressTest,
  imageEffectsTest,
  imageTextureTest,
  imageWatermarkTest
} from './ImageCompressTest'

type ImageFileItemType = {
  path: string
}

class Image extends Base {
  exts = ['jpeg', 'jpg', 'png', 'webp', 'avif', 'gif', 'tiff', 'heif']

  constructor() {
    super()
  }

  fetchDirFile(dirs: string[]) {
    return new ForkPromise(async (resolve, reject, on) => {
      const all: Array<ImageFileItemType> = []
      for (const dir of dirs) {
        try {
          const dirStat = await stat(dir)
          if (dirStat.isFile()) {
            const ext = extname(dir.toLowerCase()).replace('.', '').toLowerCase()
            if (this.exts.includes(ext)) {
              all.push({
                path: dir
              })
            }
          } else if (dirStat.isDirectory()) {
            const list = await getAllFileAsync(dir)
            const arr = list
              .filter((f: string) => {
                const ext = extname(f).replace('.', '').toLowerCase()
                return this.exts.includes(ext)
              })
              .map((m) => {
                return {
                  path: m
                }
              })
            all.push(...arr)
          }
        } catch (e) {
          reject(e)
          return
        }
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
            return new ImageInfoFetchTask(p.path)
          })
        )
        .run()
    })
  }

  /**
   * 获取 N 条文件路径的最长公共前缀路径
   * @param {string[]} paths - 文件路径数组
   * @returns {string} - 最长公共前缀路径
   */
  private getLongestCommonPath(paths: string[]) {
    // 1. 边界条件处理
    if (!paths || paths.length === 0) {
      return ''
    }
    if (paths.length === 1) {
      return normalize(paths[0])
    }

    // 2. 获取当前系统的路径分隔符 (Windows是 '\', macOS/Linux是 '/')
    const separator = sep

    // 3. 将所有路径标准化并拆分为片段数组
    // 例如: '/usr/local/bin' -> ['', 'usr', 'local', 'bin']
    const splitPaths = paths.map((p) => normalize(p).split(separator))

    // 4. 以第一条路径为基准进行循环
    const firstPathParts = splitPaths[0]
    const commonParts = []

    for (let i = 0; i < firstPathParts.length; i++) {
      const currentPart = firstPathParts[i]

      // 检查所有其他路径在当前位置是否也是这个目录名
      const isMatch = splitPaths.every((parts) => parts[i] === currentPart)

      if (isMatch) {
        commonParts.push(currentPart)
      } else {
        // 一旦遇到不匹配，立即停止
        break
      }
    }

    // 5. 将公共部分重新组合成路径字符串
    // 如果没有任何公共部分（比如一个是 C:\ 一个是 D:\），则返回空
    if (commonParts.length === 0) return ''

    // 如果是根路径 (比如 Linux 下 split 结果第一个是空字符串)，join 可能会丢失开头的斜杠
    // 使用 path.join 可以自动处理，但有时需要根据 split 结果手动补全根符号
    const result = commonParts.join(separator)

    // 特殊处理：如果是 Linux/macOS 绝对路径，split 产生的数组第一个元素是空字符串
    // join 连接后开头可能是 "/usr" 这种形式，通常没问题。
    // 如果 commonParts 只有 [""] (即根目录)，join 结果可能是 ""，需要转回 separator
    if (result === '' && commonParts.length > 0 && commonParts[0] === '') {
      return separator
    }

    return result
  }

  doCompressTask(
    files: ImageInfoFetchTask[],
    config: SharpConfig,
    savePath: string,
    backPath: string
  ) {
    return new ForkPromise((resolve, reject, on) => {
      const format = config.format
      const commonPath = this.getLongestCommonPath(files.map((f) => f.path))
      console.log('doCompressTask commonPath', commonPath)
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
            let name = basename(p.path)
            if (commonPath) {
              name = p.path.replace(`${commonPath}${sep}`, '')
            }
            console.log('doCompressTask name', name)
            let path = savePath ? join(savePath, name) : p.path
            let backupPath = backPath ? join(backPath, name) : ''
            if (format !== 'none') {
              path = path.replace(extname(path), `.${format}`)
              backupPath = backupPath.replace(extname(backupPath), `.${format}`)
            }
            return new ImageCompressTask(p, config, path, backupPath)
          })
        )
        .run()
    })
  }

  /**
   * 下载图片，返回base64编码格式
   */
  initTestImage() {
    return new ForkPromise(async (resolve, reject) => {
      const url = 'https://oss.macphpstudy.com/image/flyenv-image-compress-test.png'

      try {
        const response = await axios({
          url: url,
          method: 'GET',
          responseType: 'arraybuffer' // 重要：设置为 arraybuffer 格式接收二进制数据
        })

        // 将二进制数据转换为 base64
        const buffer = Buffer.from(response.data, 'binary')
        const base64 = buffer.toString('base64')

        // const mimeType = 'image/png'
        // const dataUrl = `data:${mimeType};base64,${base64}`

        // 根据你的需要选择返回纯 base64 还是完整的 data URL
        resolve({
          base64: base64
        })
      } catch (e) {
        console.error('图片下载失败:', e)
        reject(e)
      }
    })
  }

  /**
   * 压缩测试
   * 1. 对原始图片进行压缩
   * 2. 返回压缩前后的图片base64字符串和文件尺寸大小
   * @param base64OrFilepath  图片文件路径或图片base64字符串
   * @param config  压缩配置
   */
  imageCompressTest(
    base64OrFilepath: string,
    config: SharpConfig,
    format: 'jpeg' | 'png' | 'webp' | 'avif'
  ) {
    return imageCompressTest(base64OrFilepath, config, format)
  }

  imageEffectsTest(base64OrFilepath: string, config: SharpConfig) {
    return imageEffectsTest(base64OrFilepath, config)
  }

  imageWatermarkTest(base64OrFilepath: string, config: SharpConfig) {
    return imageWatermarkTest(base64OrFilepath, config)
  }

  imageTextureTest(base64OrFilepath: string, config: SharpConfig) {
    return imageTextureTest(base64OrFilepath, config)
  }

  imageBaseTest(base64OrFilepath: string, config: SharpConfig) {
    return imageBaseTest(base64OrFilepath, config)
  }
}
export default new Image()
