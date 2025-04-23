import { join, basename, dirname } from 'path'
import { existsSync, readdirSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '@lang/index'
import type { SoftInstalled } from '@shared/app'
import {
  execPromise,
  waitTime,
  versionLocalFetch,
  versionMacportsFetch,
  versionFixed,
  versionSort,
  getSubDirAsync,
  versionBinVersion,
  brewInfoJson,
  brewSearch,
  portSearch,
  versionFilterSame,
  AppLog
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { writeFile, mkdirp, chmod, remove } from 'fs-extra'
import TaskQueue from '../TaskQueue'
import Helper from '../Helper'

class Manager extends Base {
  constructor() {
    super()
    this.type = 'mariadb'
  }

  init() {
    this.pidPath = join(global.Server.MariaDBDir!, 'mariadb.pid')
  }

  _initPassword(version: SoftInstalled) {
    return new ForkPromise((resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.initDBPass'))
      })
      execPromise('./mariadb-admin --socket=/tmp/mysql.sock -uroot password "root"', {
        cwd: dirname(version.bin)
      })
        .then((res) => {
          console.log('_initPassword res: ', res)
          on({
            'APP-On-Log': AppLog(
              'info',
              I18nT('appLog.initDBPassSuccess', { user: 'root', pass: 'root' })
            )
          })
          resolve(true)
        })
        .catch((err) => {
          on({
            'APP-On-Log': AppLog('error', I18nT('appLog.initDBPassFail', { error: err }))
          })
          console.log('_initPassword err: ', err)
          reject(err)
        })
    })
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `${this.type}-${version.version}` })
        )
      })
      const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
      const m = join(global.Server.MariaDBDir!, `my-${v}.cnf`)
      const dataDir = join(global.Server.MariaDBDir!, `data-${v}`)
      if (!existsSync(m)) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInit'))
        })
        const conf = `[mariadbd]
# Only allow connections from localhost
bind-address = 127.0.0.1
sql-mode=NO_ENGINE_SUBSTITUTION
port = 3306
datadir=${dataDir}`
        await writeFile(m, conf)
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInitSuccess', { file: m }))
        })
      }

      const unlinkDirOnFail = async () => {
        if (existsSync(dataDir)) {
          await remove(dataDir)
        }
        if (existsSync(m)) {
          await remove(m)
        }
      }

      const doStart = async () => {
        return new Promise(async (resolve, reject) => {
          const p = join(global.Server.MariaDBDir!, 'mariadb.pid')
          const s = join(global.Server.MariaDBDir!, 'slow.log')
          const e = join(global.Server.MariaDBDir!, 'error.log')
          const params = [
            `--defaults-file=${m}`,
            `--pid-file=${p}`,
            '--slow-query-log=ON',
            `--slow-query-log-file=${s}`,
            `--log-error=${e}`,
            `--socket=/tmp/mysql.sock`
          ]
          if (version?.flag === 'macports') {
            params.push(`--lc-messages-dir=/opt/local/share/${basename(version.path)}/english`)
          }

          if (existsSync(p)) {
            try {
              await remove(p)
            } catch (e) {}
          }

          const startLog = join(global.Server.MariaDBDir!, 'start.log')
          const startErrorLog = join(global.Server.MariaDBDir!, 'start.error.log')
          if (existsSync(startErrorLog)) {
            try {
              await remove(startErrorLog)
            } catch (e) {}
          }

          const bin = version.bin
          const commands: string[] = ['#!/bin/zsh']
          commands.push(`cd "${dirname(bin)}"`)
          commands.push(
            `nohup ./${basename(bin)} ${params.join(' ')} > "${startLog}" 2>"${startErrorLog}" &`
          )
          commands.push(`echo $!`)
          const command = commands.join('\n')
          console.log('command: ', command)
          const sh = join(global.Server.MariaDBDir!, `start.sh`)
          await writeFile(sh, command)
          await chmod(sh, '0777')
          on({
            'APP-On-Log': AppLog('info', I18nT('appLog.execStartCommand'))
          })
          let res: any
          try {
            res = await execPromise(`zsh "${sh}"`)
            console.log('start res: ', res)
          } catch (e) {
            on({
              'APP-On-Log': AppLog(
                'error',
                I18nT('appLog.execStartCommandFail', {
                  error: e,
                  service: `${this.type}-${version.version}`
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
          res = await this.waitPidFile(p, startErrorLog)
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
                error: res ? res?.error : 'Start failed',
                service: `${this.type}-${version.version}`
              })
            )
          })
          reject(new Error('Start failed'))
        })
      }

      if (!existsSync(dataDir) || readdirSync(dataDir).length === 0) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.initDBDataDir'))
        })
        await mkdirp(dataDir)
        await chmod(dataDir, '0777')
        let bin = join(version.path, 'bin/mariadb-install-db')
        if (!existsSync(bin)) {
          bin = join(version.path, 'bin/mysql_install_db')
        }
        const params: string[] = []
        params.push(`--datadir=${dataDir}`)
        params.push(`--basedir=${version.path}`)
        params.push('--auth-root-authentication-method=normal')
        params.push(`--defaults-file=${m}`)
        if (version?.flag === 'macports') {
          const enDir = join(version.path, 'share')
          if (!existsSync(enDir)) {
            const shareDir = `/opt/local/share/${basename(version.path)}`
            if (existsSync(shareDir)) {
              await Helper.send('mariadb', 'macportsDirFixed', enDir, shareDir)
            }
          }
        }
        try {
          await execPromise(`cd "${dirname(bin)}" && ./${basename(bin)} ${params.join(' ')}`)
        } catch (e) {
          on({
            'APP-On-Log': AppLog('error', I18nT('appLog.initDBDataDirFail', { error: e }))
          })
          reject(e)
          return
        }
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.initDBDataDirSuccess', { dir: dataDir }))
        })
        await waitTime(500)
        try {
          const res = await doStart()
          await waitTime(500)
          await this._initPassword(version).on(on)
          on(I18nT('fork.postgresqlInit', { dir: dataDir }))
          resolve(res)
        } catch (e) {
          await unlinkDirOnFail()
          reject(e)
        }
      } else {
        doStart().then(resolve).catch(reject)
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise(async (resolve) => {
      const base = '/opt/local/'
      const allLibFile = await getSubDirAsync(join(base, 'lib'), false)
      const fpms = allLibFile
        .filter((f) => f.startsWith('mariadb'))
        .map((f) => `lib/${f}/bin/mariadbd-safe`)
      let versions: SoftInstalled[] = []
      Promise.all([
        versionLocalFetch(setup?.mariadbd?.dirs ?? [], 'mariadbd-safe', 'mariadb'),
        versionMacportsFetch(fpms)
      ])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const bin = item.bin.replace('-safe', '')
            const command = `${bin} -V`
            const reg = /(Ver )(\d+(\.\d+){1,4})([-\s])/g
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
        let all: Array<string> = ['mariadb']
        const cammand = 'brew search -q --formula "/mariadb@[\\d\\.]+$/"'
        all = await brewSearch(all, cammand)
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
        '^mariadb-([\\d\\.]*)\\d$',
        (f) => {
          return f.includes('Multithreaded SQL database server')
        },
        (name) => {
          return (
            existsSync(join('/opt/local/lib', name, 'bin/mariadbd-safe')) ||
            existsSync(join('/opt/local/lib', name, 'bin/mysqld_safe'))
          )
        }
      )
      resolve(Info)
    })
  }
}

export default new Manager()
