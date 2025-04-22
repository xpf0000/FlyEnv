import { basename, dirname, join } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '@lang/index'
import type { SoftInstalled } from '@shared/app'
import {
  AppLog,
  brewInfoJson,
  execPromise,
  portSearch,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { chmod, mkdirp, unlink, writeFile } from 'fs-extra'
import TaskQueue from '../TaskQueue'
class Memcached extends Base {
  constructor() {
    super()
    this.type = 'memcached'
  }

  init() {
    this.pidPath = join(global.Server.MemcachedDir!, 'logs/memcached.pid')
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `${this.type}-${version.version}` })
        )
      })
      const bin = version.bin
      const common = join(global.Server.MemcachedDir!, 'logs')
      const pid = join(common, 'memcached.pid')
      const log = join(common, 'memcached.log')

      const commands: string[] = ['#!/bin/zsh']
      commands.push(`cd "${dirname(bin)}"`)
      commands.push(`./${basename(bin)} -d -P "${pid}" -vv >> "${log}" 2>&1 &`)
      commands.push(`echo $!`)
      const command = commands.join('\n')
      console.log('command: ', command)
      const sh = join(global.Server.MemcachedDir!, `start.sh`)
      await writeFile(sh, command)
      await chmod(sh, '0777')
      try {
        if (existsSync(pid)) {
          await unlink(pid)
        }
      } catch (e) {}

      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.execStartCommand'))
      })
      try {
        await mkdirp(common)
        const res = await execPromise(`zsh "${sh}"`)
        console.log('res: ', res)
      } catch (e: any) {
        on({
          'APP-On-Log': AppLog(
            'error',
            I18nT('appLog.execStartCommandFail', {
              error: e,
              service: `${this.type}-${version.version}`
            })
          )
        })
        reject(e)
        return
      }
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.execStartCommandSuccess'))
      })
      on({
        'APP-Service-Start-Success': true
      })
      const res = await this.waitPidFile(pid)
      if (res && res?.pid) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.startServiceSuccess', { pid: res.pid }))
        })
        resolve({
          'APP-Service-Start-PID': res.pid
        })
        return
      }
      on({
        'APP-On-Log': AppLog(
          'error',
          I18nT('appLog.execStartCommandFail', {
            error: log,
            service: `${this.type}-${version.version}`
          })
        )
      })
      reject(new Error('Start failed'))
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      Promise.all([versionLocalFetch(setup?.memcached?.dirs ?? [], 'memcached', 'memcached')])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `${item.bin} -V`
            const reg = /(\s)(\d+(\.\d+){1,4})(.*?)/g
            return TaskQueue.run(versionBinVersion, command, reg)
          })
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

  brewinfo() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const all: Array<string> = ['memcached']
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
        `^memcached\\d*$`,
        (f) => {
          return f.includes('A high performance, distributed memory object caching system.')
        },
        (name) => {
          return existsSync(join('/opt/local/bin', name))
        }
      )
      resolve(Info)
    })
  }
}
export default new Memcached()
