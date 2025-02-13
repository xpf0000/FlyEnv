import { basename, dirname, join } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  brewInfoJson,
  execPromise,
  portSearch,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  waitTime
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { readFile, writeFile, remove, chmod, readdir, mkdirp } from 'fs-extra'
import { I18nT } from '../lang'
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
      if (existsSync(this.pidPath)) {
        try {
          await remove(this.pidPath)
        } catch (e) {}
      }

      const checkPid = async (time = 0) => {
        console.log('checkPid: ', time)
        if (existsSync(this.pidPath)) {
          const pid = await readFile(this.pidPath, 'utf-8')
          on({
            'APP-On-Log': AppLog('info', I18nT('appLog.startServiceSuccess', { pid: pid.trim() }))
          })
          resolve({
            'APP-Service-Start-PID': pid.trim()
          })
        } else {
          if (time < 120) {
            await waitTime(1000)
            await checkPid(time + 1)
          } else {
            on({
              'APP-On-Log': AppLog(
                'error',
                I18nT('appLog.startServiceFail', {
                  error: I18nT('fork.startFail'),
                  service: `elasticsearch-${version.version}`
                })
              )
            })
            reject(new Error(I18nT('fork.startFail')))
          }
        }
      }

      const commands: string[] = ['#!/bin/zsh']
      commands.push(`export ES_HOME="${version.path}"`)
      commands.push(`export ES_PATH_CONF="${join(version.path, 'config')}"`)
      commands.push(`cd "${dirname(bin)}"`)
      commands.push(`nohup ./${basename(bin)} -d -p "${this.pidPath}" > /dev/null 2>&1 &`)
      commands.push(`echo $!`)
      const command = commands.join('\n')
      console.log('command: ', command)
      const sh = join(global.Server.BaseDir!, `elasticsearch/start.sh`)
      await mkdirp(dirname(sh))
      await writeFile(sh, command)
      await chmod(sh, '0777')
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.execStartCommand'))
      })
      try {
        const res = await execPromise(`zsh "${sh}"`)
        console.log('start res: ', res)
      } catch (e) {
        on({
          'APP-On-Log': AppLog(
            'error',
            I18nT('appLog.execStartCommandFail', {
              error: e,
              service: `elasticsearch-${version.version}`
            })
          )
        })
        console.log('start e: ', e)
        reject(e)
        return
      }
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.execStartCommandSuccess'))
      })
      on({
        'APP-Service-Start-Success': true
      })
      await checkPid()
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
            TaskQueue.run(versionBinVersion, `${item.bin} version`, /(v)(\d+(\.\d+){1,4})(.*?)/g)
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
