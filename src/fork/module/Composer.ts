import { join } from 'path'
import { createWriteStream, existsSync, unlinkSync } from 'fs'
import { Base } from './Base'
import { ForkPromise } from '@shared/ForkPromise'
import axios from 'axios'
import { copyFile, mkdirp, readFile, remove } from 'fs-extra'
import { execPromiseRoot } from '@shared/Exec'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import { versionFilterSame, versionFixed, versionLocalFetch, versionSort } from '../Fn'
import TaskQueue from '../TaskQueue'

class Composer extends Base {
  constructor() {
    super()
    this.type = 'composer'
  }

  fetchAllOnLineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('composer')
        const dict: any = {}
        all.forEach((a: any) => {
          const dir = join(global.Server.AppDir!, `composer-${a.version}`, 'composer')
          const zip = join(global.Server.Cache!, `composer-${a.version}.phar`)
          a.appDir = join(global.Server.AppDir!, `composer-${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          a.type = 'composer'
          dict[`composer-${a.version}`] = a
        })
        resolve(dict)
      } catch (e) {
        console.log('fetchAllOnLineVersion error: ', e)
        resolve([])
      }
    })
  }

  installSoft(row: any) {
    return new ForkPromise(async (resolve, reject, on) => {
      const refresh = () => {
        row.downloaded = existsSync(row.zip)
        row.installed = existsSync(row.bin)
      }

      const handleComposer = async () => {
        if (!existsSync(row.appDir)) {
          await mkdirp(row.appDir)
        }
        const bin = join(row.appDir, 'composer')
        await copyFile(row.zip, bin)
        await execPromiseRoot([`chmod`, `777`, bin])
      }

      if (existsSync(row.zip)) {
        let success = false
        try {
          await handleComposer()
          success = true
        } catch (e) {}
        if (success) {
          refresh()
          row.downState = 'success'
          row.progress = 100
          on(row)
          resolve(true)
          return
        }
        await remove(row.zip)
      }

      axios({
        method: 'get',
        url: row.url,
        proxy: this.getAxiosProxy(),
        responseType: 'stream',
        onDownloadProgress: (progress) => {
          if (progress.total) {
            const percent = Math.round((progress.loaded * 100.0) / progress.total)
            row.progress = percent
            on(row)
          }
        }
      })
        .then(function (response) {
          const stream = createWriteStream(row.zip)
          response.data.pipe(stream)
          stream.on('error', (err: any) => {
            console.log('stream error: ', err)
            row.downState = 'exception'
            try {
              if (existsSync(row.zip)) {
                unlinkSync(row.zip)
              }
            } catch (e) {}
            refresh()
            on(row)
            setTimeout(() => {
              resolve(false)
            }, 1500)
          })
          stream.on('finish', async () => {
            row.downState = 'success'
            try {
              if (existsSync(row.zip)) {
                await handleComposer()
              }
            } catch (e) {}
            refresh()
            on(row)
            resolve(true)
          })
        })
        .catch((err) => {
          console.log('down error: ', err)
          row.downState = 'exception'
          try {
            if (existsSync(row.zip)) {
              unlinkSync(row.zip)
            }
          } catch (e) {}
          refresh()
          on(row)
          setTimeout(() => {
            resolve(false)
          }, 1500)
        })
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      const binVersion = (bin: string): Promise<{ version?: string; error?: string }> => {
        return new Promise(async (resolve) => {
          const reg = /(public const VERSION = ')(\d+(\.\d+){1,4})(';)/g
          const handleCatch = (err: any) => {
            resolve({
              error: '<br/>' + err.toString().trim().replace(new RegExp('\n', 'g'), '<br/>'),
              version: undefined
            })
          }
          const handleThen = (res: any) => {
            const str = res.stdout + res.stderr
            let version: string | undefined = ''
            try {
              version = reg?.exec(str)?.[2]?.trim()
              reg!.lastIndex = 0
            } catch (e) {}
            resolve({
              version
            })
          }
          try {
            const res = await readFile(bin, 'utf-8')
            handleThen({
              stdout: res,
              stderr: ''
            })
          } catch (e) {
            handleCatch(e)
          }
        })
      }
      let versions: SoftInstalled[] = []
      Promise.all([versionLocalFetch(setup?.composer?.dirs ?? [], 'composer', 'composer')])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => TaskQueue.run(binVersion, item.bin))
          return Promise.all(all)
        })
        .then((list) => {
          list.forEach((v, i) => {
            const { error, version } = v
            const num = version
              ? Number(versionFixed(version).split('.').slice(0, 2).join(''))
              : null
            Object.assign(versions[i], {
              version: version,
              num,
              enable: version !== null,
              error
            })
          })
          resolve(versionSort(versions))
        })
        .catch(() => {
          resolve([])
        })
    })
  }
}
export default new Composer()
