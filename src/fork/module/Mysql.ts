import { join, basename, dirname } from 'path'
import { existsSync, readdirSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '@lang/index'
import type { MysqlGroupItem, OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  spawnPromiseMore,
  execPromise,
  waitTime,
  versionLocalFetch,
  versionMacportsFetch,
  versionBinVersion,
  versionFixed,
  versionSort,
  getSubDirAsync,
  brewSearch,
  brewInfoJson,
  portSearch,
  versionFilterSame,
  AppLog
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { mkdirp, writeFile, chmod, unlink, remove } from 'fs-extra'
import TaskQueue from '../TaskQueue'
import Helper from '../Helper'

class Mysql extends Base {
  constructor() {
    super()
    this.type = 'mysql'
  }

  init() {
    this.pidPath = join(global.Server.MysqlDir!, 'mysql.pid')
  }

  _initPassword(version: SoftInstalled) {
    return new ForkPromise((resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.initDBPass'))
      })
      execPromise('./mysqladmin --socket=/tmp/mysql.sock -uroot password "root"', {
        cwd: dirname(version.bin)
      })
        .then((res) => {
          on({
            'APP-On-Log': AppLog(
              'info',
              I18nT('appLog.initDBPassSuccess', { user: 'root', pass: 'root' })
            )
          })
          console.log('_initPassword res: ', res)
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
      const m = join(global.Server.MysqlDir!, `my-${v}.cnf`)
      const dataDir = join(global.Server.MysqlDir!, `data-${v}`)
      const p = join(global.Server.MysqlDir!, 'mysql.pid')
      const s = join(global.Server.MysqlDir!, 'slow.log')
      const e = join(global.Server.MysqlDir!, 'error.log')
      if (!existsSync(m)) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInit'))
        })
        const conf = `[mysqld]
# Only allow connections from localhost
bind-address = 127.0.0.1
sql-mode=NO_ENGINE_SUBSTITUTION
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

      const doStart = () => {
        return new Promise(async (resolve, reject) => {
          if (existsSync(p)) {
            try {
              await remove(p)
            } catch (e) {}
          }
          const bin = version.bin
          const params = [
            `--defaults-file=${m}`,
            `--pid-file=${p}`,
            '--user=mysql',
            `--slow-query-log-file=${s}`,
            `--log-error=${e}`,
            '--socket=/tmp/mysql.sock'
          ]
          if (version?.flag === 'macports') {
            params.push(`--lc-messages-dir=/opt/local/share/${basename(version.path)}/english`)
          }

          const startLog = join(global.Server.MysqlDir!, 'start.log')
          const startErrorLog = join(global.Server.MysqlDir!, 'start.error.log')
          if (existsSync(startErrorLog)) {
            try {
              await remove(startErrorLog)
            } catch (e) {}
          }

          const commands: string[] = ['#!/bin/zsh']
          commands.push(`cd "${dirname(bin)}"`)
          commands.push(
            `nohup ./${basename(bin)} ${params.join(' ')} > "${startLog}" 2>"${startErrorLog}" &`
          )
          commands.push(`echo $!`)
          const command = commands.join('\n')
          console.log('command: ', command)
          const sh = join(global.Server.MysqlDir!, `start.sh`)
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
                error: res ? res?.error : 'Start Fail',
                service: `${this.type}-${version.version}`
              })
            )
          })
          reject(new Error('Start Fail'))
        })
      }

      if (!existsSync(dataDir) || readdirSync(dataDir).length === 0) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.initDBDataDir'))
        })
        await mkdirp(dataDir)
        await chmod(dataDir, '0777')
        let bin = version.bin
        const params = [
          `--defaults-file=${m}`,
          `--pid-file=${p}`,
          '--user=mysql',
          `--slow-query-log-file=${s}`,
          `--log-error=${e}`,
          '--socket=/tmp/mysql.sock'
        ]
        const installdb = join(version.path, 'bin/mysql_install_db')
        if (existsSync(installdb) && version.num! < 57) {
          bin = installdb
          params.splice(0)
          params.push(`--defaults-file=${m}`)
          params.push(`--datadir=${dataDir}`)
          params.push(`--basedir=${version.path}`)
          if (version?.flag === 'macports') {
            const enDir = join(version.path, 'share')
            if (!existsSync(enDir)) {
              const shareDir = `/opt/local/share/${basename(version.path)}`
              if (existsSync(shareDir)) {
                const langDir = join(enDir, basename(version.path))
                const langEnDir = join(shareDir, 'english')
                await Helper.send('mysql', 'macportsDirFixed', enDir, shareDir, langDir, langEnDir)
              }
            }
          }
        } else {
          params.push('--initialize-insecure')
        }

        try {
          await execPromise(
            `cd "${dirname(bin)}" && ./${basename(bin)} ${params.join(' ')} && wait && exit 0`
          )
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

  stopGroupService(version: MysqlGroupItem) {
    console.log(version)
    return new ForkPromise(async (resolve, reject) => {
      const id = version?.id ?? ''
      const conf = join(global.Server.MysqlDir!, `group/my-group-${id}.cnf`)
      const serverName = 'mysqld'
      const command = `ps aux | grep '${serverName}' | awk '{print $2,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20}'`
      console.log('_stopServer command: ', command)
      try {
        const res = await execPromise(command)
        const pids = res?.stdout?.trim()?.split('\n') ?? []
        const arr: Array<string> = []
        for (const p of pids) {
          if (p.includes(conf)) {
            arr.push(p.split(' ')[0])
          }
        }
        if (arr.length > 0) {
          const sig = '-TERM'
          await Helper.send('tools', 'kill', sig, arr)
        }
        await waitTime(500)
        resolve(true)
      } catch (e) {
        reject(e)
      }
    })
  }

  startGroupServer(version: MysqlGroupItem) {
    return new ForkPromise(async (resolve, reject, on) => {
      await this.stopGroupService(version)
      let bin = version.version.bin
      const id = version?.id ?? ''
      const m = join(global.Server.MysqlDir!, `group/my-group-${id}.cnf`)
      const dataDir = version.dataDir
      if (!existsSync(m)) {
        const conf = `[mysqld]
# Only allow connections from localhost
bind-address = 127.0.0.1
sql-mode=NO_ENGINE_SUBSTITUTION`
        await writeFile(m, conf)
      }

      const p = join(global.Server.MysqlDir!, `group/my-group-${id}.pid`)
      const s = join(global.Server.MysqlDir!, `group/my-group-${id}-slow.log`)
      const e = join(global.Server.MysqlDir!, `group/my-group-${id}-error.log`)
      const sock = join(global.Server.MysqlDir!, `group/my-group-${id}.sock`)
      const params = [
        `--defaults-file=${m}`,
        `--datadir=${dataDir}`,
        `--port=${version.port}`,
        `--pid-file=${p}`,
        '--user=mysql',
        `--slow-query-log-file=${s}`,
        `--log-error=${e}`,
        `--socket=${sock}`
      ]
      if (version?.version?.flag === 'macports') {
        params.push(`--lc-messages-dir=/opt/local/share/${basename(version.version.path!)}/english`)
      }
      let needRestart = false
      if (!existsSync(dataDir) || readdirSync(dataDir).length === 0) {
        const currentVersion = version.version!
        needRestart = true
        await mkdirp(dataDir)
        await chmod(dataDir, '0755')
        const installdb = join(currentVersion.path!, 'bin/mysql_install_db')
        if (existsSync(installdb) && version.version.num! < 57) {
          bin = installdb
          params.splice(0)
          params.push(`--defaults-file=${m}`)
          params.push(`--datadir=${dataDir}`)
          params.push(`--basedir=${currentVersion.path}`)
          if (currentVersion?.flag === 'macports') {
            const enDir = join(currentVersion.path!, 'share')
            if (!existsSync(enDir)) {
              const shareDir = `/opt/local/share/${basename(currentVersion.path!)}`
              if (existsSync(shareDir)) {
                const langDir = join(enDir, basename(currentVersion.path!))
                const langEnDir = join(shareDir, 'english')
                await Helper.send('mysql', 'macportsDirFixed', enDir, shareDir, langDir, langEnDir)
              }
            }
          }
        } else {
          params.push('--initialize-insecure')
        }
      }
      try {
        if (existsSync(p)) {
          await unlink(p)
        }
      } catch (e) {}
      console.log('mysql start: ', bin, params.join(' '))
      on(I18nT('fork.command') + `: ${bin} ${params.join(' ')}`)
      const { promise, spawn } = await spawnPromiseMore(bin!, params)
      let success = false
      let checking = false
      const initPassword = () => {
        return new ForkPromise((resolve, reject) => {
          execPromise(`./mysqladmin -P${version.port} -S${sock} -uroot password "root"`, {
            cwd: dirname(version.version.bin!)
          })
            .then((res) => {
              console.log('_initPassword res: ', res)
              resolve(true)
            })
            .catch((err) => {
              console.log('_initPassword err: ', err)
              reject(err)
            })
        })
      }
      async function checkpid(time = 0) {
        if (existsSync(p)) {
          console.log('time: ', time)
          success = true
          try {
            await execPromise(`kill -9 ${spawn.pid}`)
          } catch (e) {}
        } else {
          if (time < 40) {
            await waitTime(500)
            await checkpid(time + 1)
          } else {
            try {
              await execPromise(`kill -9 ${spawn.pid}`)
            } catch (e) {}
          }
        }
      }
      const unlinkDirOnFail = async () => {
        if (existsSync(dataDir)) {
          await remove(dataDir)
        }
        if (existsSync(m)) {
          await remove(m)
        }
      }
      promise
        .on(async (data) => {
          on(data)
          if (!checking) {
            checking = true
            await checkpid()
          }
        })
        .then(async (code) => {
          if (success) {
            resolve(code)
          } else {
            if (needRestart) {
              try {
                await this.startGroupServer(version).on(on)
                await initPassword()
                on(I18nT('fork.postgresqlInit', { dir: dataDir }))
                resolve(code)
              } catch (e) {
                await unlinkDirOnFail()
                reject(e)
              }
            } else {
              reject(code)
            }
          }
        })
        .catch(async (err) => {
          if (needRestart) {
            await unlinkDirOnFail()
          }
          reject(err)
        })
    })
  }

  fetchAllOnLineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('mysql')
        all.forEach((a: any) => {
          const dir = join(
            global.Server.AppDir!,
            `mysql-${a.version}`,
            `mysql-${a.version}-winx64`,
            'bin/mysqld.exe'
          )
          const zip = join(global.Server.Cache!, `mysql-${a.version}.zip`)
          a.appDir = join(global.Server.AppDir!, `mysql-${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
        })
        resolve(all)
      } catch (e) {
        resolve([])
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise(async (resolve) => {
      const base = '/opt/local/'
      const allLibFile = await getSubDirAsync(join(base, 'lib'), false)
      const fpms = allLibFile
        .filter((f) => f.startsWith('mysql'))
        .map((f) => `lib/${f}/bin/mysqld_safe`)
      let versions: SoftInstalled[] = []
      Promise.all([
        versionLocalFetch(setup?.mysql?.dirs ?? [], 'mysqld_safe', 'mysql'),
        versionMacportsFetch(fpms)
      ])
        .then(async (list) => {
          versions = list.flat().filter((v) => !v.bin.includes('mariadb'))
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const bin = item.bin.replace('_safe', '')
            const command = `${bin} -V`
            const reg = /(Ver )(\d+(\.\d+){1,4})( )/g
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
        let all: Array<string> = ['mysql']
        const cammand = 'brew search -q --formula "/^mysql@[\\d\\.]+$/"'
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
        `^mysql([\\d]+)?$`,
        (f) => {
          return f.includes('Multithreaded SQL database server')
        },
        (name) => {
          return existsSync(join('/opt/local/lib', name, 'bin/mysqld_safe'))
        }
      )
      resolve(Info)
    })
  }
}
export default new Mysql()
