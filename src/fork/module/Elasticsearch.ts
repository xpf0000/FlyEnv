import { basename, join } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  serviceStartExecCMD,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  mkdirp
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
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
      await mkdirp(baseDir)
      const execEnv = `set "ES_HOME=${version.path}"
set "ES_PATH_CONF=${join(version.path, 'config')}"
`
      const execArgs = `-d -p "${this.pidPath}"`

      try {
        const res = await serviceStartExecCMD(
          version,
          this.pidPath,
          baseDir,
          bin,
          execArgs,
          execEnv,
          on,
          120,
          1000
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
        all.forEach((a: any) => {
          const dir = join(
            global.Server.AppDir!,
            'elasticsearch',
            `v${a.version}`,
            'bin/elasticsearch.bat'
          )
          const zip = join(global.Server.Cache!, `elasticsearch-${a.version}.zip`)
          a.appDir = join(global.Server.AppDir!, 'elasticsearch', `v${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
        })
        resolve(all)
      } catch {
        resolve({})
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      Promise.all([versionLocalFetch(setup?.elasticsearch?.dirs ?? [], 'elasticsearch.bat')])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `${basename(item.bin)} --version`
            const reg = /(Version: )(\d+(\.\d+){1,4})(.*?)/g
            return TaskQueue.run(versionBinVersion, item.bin, command, reg)
          })
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
          resolve(versionSort(versions))
        })
        .catch(() => {
          resolve([])
        })
    })
  }
}
export default new Elasticsearch()
