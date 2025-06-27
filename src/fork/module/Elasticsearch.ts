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
  versionSort,
  readdir,
  mkdirp,
  serviceStartExecCMD,
  execPromise,
  waitTime,
  remove,
  zipUnPack,
  moveChildDirToParent
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { I18nT } from '@lang/index'
import TaskQueue from '../TaskQueue'
import { isMacOS, isWindows } from '@shared/utils'

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

      if (isMacOS()) {
        const execEnv = `export ES_HOME="${version.path}"
export ES_PATH_CONF="${join(version.path, 'config')}"
`
        const execArgs = `-d -p "${this.pidPath}"`

        try {
          const res = await serviceStartExec({
            version,
            pidPath: this.pidPath,
            baseDir,
            bin,
            execArgs,
            execEnv,
            on,
            maxTime: 60,
            timeToWait: 2000
          })
          resolve(res)
        } catch (e: any) {
          console.log('-k start err: ', e)
          reject(e)
          return
        }
      } else if (isWindows()) {
        const execEnv = `set "ES_HOME=${version.path}"
set "ES_PATH_CONF=${join(version.path, 'config')}"
`
        const execArgs = `-d -p "${this.pidPath}"`

        try {
          const res = await serviceStartExecCMD({
            version,
            pidPath: this.pidPath,
            baseDir,
            bin,
            execArgs,
            execEnv,
            on,
            maxTime: 120,
            timeToWait: 1000
          })
          resolve(res)
        } catch (e: any) {
          console.log('-k start err: ', e)
          reject(e)
          return
        }
      }
    })
  }

  fetchAllOnLineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('elasticsearch')
        all.forEach((a: any) => {
          let dir = ''
          let zip = ''
          if (isMacOS()) {
            dir = join(global.Server.AppDir!, 'elasticsearch', `v${a.version}`, 'bin/elasticsearch')
            zip = join(global.Server.Cache!, `static-elasticsearch-${a.version}.tar.gz`)
          } else if (isWindows()) {
            dir = join(
              global.Server.AppDir!,
              'elasticsearch',
              `v${a.version}`,
              'bin/elasticsearch.bat'
            )
            zip = join(global.Server.Cache!, `elasticsearch-${a.version}.zip`)
          }
          a.appDir = join(global.Server.AppDir!, 'elasticsearch', `v${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          a.name = `Elasticsearch-${a.version}`
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
      let all: Promise<SoftInstalled[]>[] = []
      if (isMacOS()) {
        all = [
          versionLocalFetch(setup?.elasticsearch?.dirs ?? [], 'elasticsearch', 'elasticsearch')
        ]
      } else if (isWindows()) {
        all = [versionLocalFetch(setup?.elasticsearch?.dirs ?? [], 'elasticsearch.bat')]
      }
      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `"${item.bin}" --version`
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
          if (isMacOS()) {
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
          }
          resolve(versionSort(versions))
        })
        .catch(() => {
          resolve([])
        })
    })
  }

  async _installSoftHandle(row: any): Promise<void> {
    if (isMacOS()) {
      const dir = row.appDir
      await super._installSoftHandle(row)
      const subDirs = await readdir(dir)
      const subDir = subDirs.pop()
      if (subDir) {
        await execPromise(`cd ${join(dir, subDir)} && mv ./* ../`)
        await waitTime(300)
        await remove(join(dir, subDir))
      }
    } else if (isWindows()) {
      await remove(row.appDir)
      await mkdirp(row.appDir)
      await zipUnPack(row.zip, row.appDir)
      await moveChildDirToParent(row.appDir)
    }
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
        `"^elasticsearch\\d*$"`,
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
