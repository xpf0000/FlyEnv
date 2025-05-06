import { join } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  brewInfoJson,
  portSearch,
  serviceStartExec,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { readdir } from 'fs-extra'
import { I18nT } from '@lang/index'
import TaskQueue from '../TaskQueue'

class Elasticsearch extends Base {
  constructor() {
    super()
    this.type = 'elasticsearch'
  }

  init() {
    this.pidPath = join(global.Server.BaseDir!, 'elasticsearch/elasticsearch.pid')
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `elasticsearch-${version.version}` })
        )
      })
      const bin = version.bin

      const baseDir = join(global.Server.BaseDir!, `elasticsearch`)
      const execEnv = `export ES_HOME="${version.path}"
export ES_PATH_CONF="${join(version.path, 'config')}"
`
      const execArgs = `-d -p "${this.pidPath}"`

      try {
        const res = await serviceStartExec(
          version,
          this.pidPath,
          baseDir,
          bin,
          execArgs,
          execEnv,
          on,
          60,
          2000
        )
        resolve(res)
      } catch (e: any) {
        console.log('-k start err: ', e)
        reject(e)
        return
      }
    })
  }

  fetchAllOnLineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('elasticsearch')
        const dict: any = {}
        all.forEach((a: any) => {
          const dir = join(
            global.Server.AppDir!,
            'elasticsearch',
            `v${a.version}`,
            'bin/elasticsearch'
          )
          const zip = join(global.Server.Cache!, `static-elasticsearch-${a.version}.tar.gz`)
          a.appDir = join(global.Server.AppDir!, 'elasticsearch', `v${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          dict[`elasticsearch-${a.version}`] = a
        })
        resolve(dict)
      } catch (e) {
        resolve({})
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      Promise.all([
        versionLocalFetch(setup?.elasticsearch?.dirs ?? [], 'elasticsearch', 'elasticsearch')
      ])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) =>
            TaskQueue.run(
              versionBinVersion,
              `${item.bin} --version`,
              /(Version: )(\d+(\.\d+){1,4})(.*?)/g
            )
          )
          if (all.length === 0) {
            return Promise.resolve([])
          }
          return Promise.all(all)
        })
        .then(async (list) => {
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

          const dir = join(global.Server.AppDir!, 'elasticsearch')
          if (existsSync(dir)) {
            const dirs = await readdir(dir)
            const appVersions: SoftInstalled[] = dirs
              .filter((s) => s.startsWith('v') && existsSync(join(dir, s, 'bin/elasticsearch')))
              .map((s) => {
                const version = s.replace('v', '').trim()
                const path = join(dir, s)
                const bin = join(dir, s, 'bin/elasticsearch')
                const num = version
                  ? Number(versionFixed(version).split('.').slice(0, 2).join(''))
                  : null
                return {
                  run: false,
                  running: false,
                  typeFlag: 'node',
                  path,
                  bin,
                  version,
                  num,
                  enable: true
                }
              })
            versions.push(...appVersions)
          }
          resolve(versionSort(versions))
        })
        .catch(() => {
          resolve([])
        })
    })
  }

  brewinfo() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const all = ['elasticsearch']
        const info = await brewInfoJson(all)
        resolve(info)
      } catch (e) {
        reject(e)
        return
      }
    })
  }

  portinfo() {
    return new ForkPromise(async (resolve) => {
      const Info: { [k: string]: any } = await portSearch(
        `^elasticsearch\\d*$`,
        (f) => {
          return (
            f.includes('www') && f.includes('Fast, multi-platform web server with automatic HTTPS')
          )
        },
        (name) => {
          return existsSync(join('/opt/local/bin/', name))
        }
      )
      resolve(Info)
    })
  }
}
export default new Elasticsearch()
