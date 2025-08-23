import { join, basename, dirname, isAbsolute } from 'path'
import { existsSync, readdirSync } from 'fs'
import { Base } from '../Base'
import { I18nT } from '@lang/index'
import type { MysqlGroupItem, OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
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
  AppLog,
  serviceStartExec,
  mkdirp,
  writeFile,
  chmod,
  remove,
  serviceStartExecCMD,
  spawnPromise,
  readFile
} from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import TaskQueue from '../../TaskQueue'
import Helper from '../../Helper'
import { isWindows, pathFixedToUnix } from '@shared/utils'
import { ProcessListSearch } from '@shared/Process.win'
import type { PItem } from '@shared/Process'
import { EOL } from 'os'
import { createConnection } from 'mysql2/promise'
import type { Connection } from 'mysql2/promise'
import { parse as iniParse } from 'ini'
import { compareVersions } from 'compare-versions'
import { format } from 'date-fns'

class Mysql extends Base {
  constructor() {
    super()
    this.type = 'mysql'
  }

  init() {
    this.pidPath = join(global.Server.MysqlDir!, 'mysql.pid')
  }

  _initPassword(version: SoftInstalled, password?: string) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.initDBPass'))
      })
      password = password ?? 'root'
      if (isWindows()) {
        const bin = join(dirname(version.bin), 'mysqladmin.exe')
        if (existsSync(bin)) {
          process.chdir(dirname(bin))
          try {
            await execPromise(`mysqladmin.exe --host="127.0.0.1" -uroot password "${password}"`)
          } catch (e) {
            on({
              'APP-On-Log': AppLog('error', I18nT('appLog.initDBPassFail', { error: e }))
            })
            console.log('_initPassword err: ', e)
            reject(e)
            return
          }
          on({
            'APP-On-Log': AppLog(
              'info',
              I18nT('appLog.initDBPassSuccess', { user: 'root', pass: 'root' })
            )
          })
        } else {
          on({
            'APP-On-Log': AppLog(
              'error',
              I18nT('appLog.initDBPassFail', { error: 'mysqladmin.exe not found' })
            )
          })
        }
        resolve(true)
      } else {
        execPromise(`./mysqladmin --socket=/tmp/mysql.sock -uroot password "${password}"`, {
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
      }
    })
  }

  _stopServer(version: SoftInstalled): ForkPromise<any> {
    if (!isWindows()) {
      return super._stopServer(version)
    }

    return new ForkPromise(async (resolve, reject, on) => {
      const pids = new Set<string>()
      const appPidFile = join(global.Server.BaseDir!, `pid/${this.type}.pid`)
      if (existsSync(appPidFile)) {
        const pid = (await readFile(appPidFile, 'utf-8')).trim()
        pids.add(pid)
        TaskQueue.run(remove, appPidFile).then().catch()
      }
      if (version?.pid) {
        pids.add(`${version.pid}`)
      }
      if (pids.size > 0) {
        const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
        const m = join(global.Server.MysqlDir!, `my-${v}.cnf`)
        const bin = join(dirname(version.bin), 'mysqladmin.exe')
        const password = version?.rootPassword ?? 'root'

        const content = await readFile(m, 'utf8')
        const config = iniParse(content)
        const port = config?.mysqld?.port ?? 3306

        let success = false
        /**
         * ./mysqladmin.exe --defaults-file="C:\Program Files\PhpWebStudy-Data\server\mysql\my-5.7.cnf" -v --connect-timeout=1 --shutdown-timeout=1 --protocol=tcp --host="127.0.0.1" -uroot -proot001 shutdown
         */
        const command = `"${bin}" --defaults-file="${m}" --connect-timeout=1 --shutdown-timeout=1 --protocol=tcp --host="127.0.0.1" --port=${port} -uroot -p${password} shutdown`
        console.log('mysql _stopServer command: ', command)
        try {
          await execPromise(command)
          success = true
        } catch (e) {
          success = false
          console.log('mysql _stopServer command error: ', e)
        }

        if (!success) {
          const arr: string[] = Array.from(pids)
          const str = arr.map((s) => `/pid ${s}`).join(' ')
          try {
            await execPromise(`taskkill /f /t ${str}`)
          } catch {}
        } else {
          await waitTime(1500)
        }
      }

      on({
        'APP-Service-Stop-Success': true
      })
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.stopServiceEnd', { service: this.type }))
      })
      return resolve({
        'APP-Service-Stop-PID': [...pids].map((p) => Number(p))
      })
    })
  }

  _startServer(version: SoftInstalled, skipGrantTables?: boolean, password?: string) {
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
datadir=${pathFixedToUnix(dataDir)}`
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
          const bin = version.bin
          const baseDir = global.Server.MysqlDir!
          await mkdirp(baseDir)
          const execEnv = ''

          const content = await readFile(m, 'utf8')
          const config = iniParse(content)
          const port = config?.mysqld?.port ?? 3306
          const ddir = config?.mysqld?.datadir ?? dataDir

          if (isWindows()) {
            const params = [
              `--defaults-file="${m}"`,
              `--pid-file="${p}"`,
              '--user=mysql',
              '--slow-query-log=ON',
              `--slow-query-log-file="${s}"`,
              `--log-error="${e}"`,
              '--standalone'
            ]

            if (skipGrantTables) {
              params.push(`--datadir="${ddir}"`)
              params.push('--bind-address="127.0.0.1"')
              params.push(`--port=${port}`)
              params.push(`--enable-named-pipe`)
              params.push('--skip-grant-tables')
            }

            const execArgs = params.join(' ')

            console.log('execArgs: ', execArgs)

            try {
              const res = await serviceStartExecCMD({
                version,
                pidPath: p,
                baseDir,
                bin,
                execArgs,
                execEnv,
                on,
                timeToWait: 1000
              })
              resolve(res)
            } catch (e: any) {
              console.log('-k start err: ', e)
              reject(e)
              return
            }
          } else {
            const params = [
              `--defaults-file="${m}"`,
              `--pid-file="${p}"`,
              '--user=mysql',
              `--slow-query-log-file="${s}"`,
              `--log-error="${e}"`
            ]
            if (version?.flag === 'macports') {
              params.push(`--lc-messages-dir="/opt/local/share/${basename(version.path)}/english"`)
            }

            if (skipGrantTables) {
              params.push(`--socket=/tmp/mysql.${version.version}.sock`)
              params.push(`--datadir="${ddir}"`)
              params.push('--bind-address="127.0.0.1"')
              params.push(`--port=${port}`)
              params.push('--skip-grant-tables')
            } else {
              params.push(`--socket=/tmp/mysql.sock`)
            }

            const execArgs = params.join(' ')

            try {
              const res = await serviceStartExec({
                version,
                pidPath: p,
                baseDir,
                bin,
                execArgs,
                execEnv,
                on
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

      if (!existsSync(dataDir) || readdirSync(dataDir).length === 0) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.initDBDataDir'))
        })
        await mkdirp(dataDir)
        await chmod(dataDir, '0777')
        let bin = version.bin
        if (isWindows()) {
          const params = [
            `--defaults-file="${m}"`,
            `--pid-file="${p}"`,
            '--user=mysql',
            '--slow-query-log=ON',
            `--slow-query-log-file="${s}"`,
            `--log-error="${e}"`,
            '--initialize-insecure'
          ]

          process.chdir(dirname(bin))
          const command = `${basename(bin)} ${params.join(' ')}`
          console.log('command: ', command)
          try {
            const res = await execPromise(command)
            console.log('init res: ', res)
            on(res.stdout)
          } catch (e: any) {
            on({
              'APP-On-Log': AppLog('error', I18nT('appLog.initDBDataDirFail', { error: e }))
            })
            reject(e)
            return
          }
        } else {
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
                  await Helper.send(
                    'mysql',
                    'macportsDirFixed',
                    enDir,
                    shareDir,
                    langDir,
                    langEnDir
                  )
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
        }

        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.initDBDataDirSuccess', { dir: dataDir }))
        })
        await waitTime(500)
        try {
          const res = await doStart()
          await waitTime(500)
          if (!skipGrantTables) {
            await this._initPassword(version, password).on(on)
          }
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
      if (isWindows()) {
        const conf =
          'PhpWebStudy-Data' +
          join(global.Server.MysqlDir!, `group/my-group-${id}.cnf`).split('PhpWebStudy-Data').pop()
        const arr: Array<string> = []
        let all: PItem[] = []
        try {
          all = await ProcessListSearch(conf, false)
        } catch {}

        all.forEach((item) => arr.push(item.PID))

        if (arr.length > 0) {
          try {
            await Helper.send('tools', 'kill', '-INT', arr)
          } catch {}
        }
        await waitTime(500)
        resolve({
          'APP-Service-Stop-PID': arr
        })
      } else {
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
      }
    })
  }

  startGroupServer(version: MysqlGroupItem) {
    return new ForkPromise(async (resolve, reject, on) => {
      await this.stopGroupService(version)
      let bin = version.version.bin!
      const id = version?.id ?? ''
      const m = join(global.Server.MysqlDir!, `group/my-group-${id}.cnf`)
      const dataDir = version.dataDir
      await mkdirp(dirname(m))
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

      const unlinkDirOnFail = async () => {
        if (existsSync(dataDir)) {
          await remove(dataDir)
        }
        if (existsSync(m)) {
          await remove(m)
        }
      }

      const baseDir = join(global.Server.MysqlDir!, `group`)
      await mkdirp(baseDir)

      const doStart = () => {
        const execEnv = ''
        return new Promise(async (resolve, reject) => {
          if (isWindows()) {
            const params = [
              `--defaults-file="${m}"`,
              `--datadir="${dataDir}"`,
              `--port="${version.port}"`,
              `--pid-file="${p}"`,
              '--user=mysql',
              '--slow-query-log=ON',
              `--slow-query-log-file="${s}"`,
              `--log-error="${e}"`,
              `--socket="${sock}"`,
              '--standalone'
            ]

            const execArgs = params.join(' ')

            try {
              const res = await serviceStartExecCMD({
                version: version.version as any,
                pidPath: p,
                baseDir,
                bin,
                execArgs,
                execEnv,
                on,
                timeToWait: 1000
              })
              resolve(res)
            } catch (e: any) {
              console.log('-k start err: ', e)
              reject(e)
              return
            }
          } else {
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
              params.push(
                `--lc-messages-dir=/opt/local/share/${basename(version.version.path!)}/english`
              )
            }

            const execArgs = params.join(' ')

            try {
              const res = await serviceStartExec({
                version: version.version as any,
                pidPath: p,
                baseDir,
                bin,
                execArgs,
                execEnv,
                on
              })
              resolve(res)
            } catch (e: any) {
              console.log('-k start err: ', e)
              reject(e)
              return
            }
          }

          if (existsSync(p)) {
            try {
              await remove(p)
            } catch {}
          }

          const startLogFile = join(global.Server.MysqlDir!, `group/start.${id}.log`)
          const startErrLogFile = join(global.Server.MysqlDir!, `start.error.${id}.log`)
          if (existsSync(startErrLogFile)) {
            try {
              await remove(startErrLogFile)
            } catch {}
          }
          const params = [
            `--defaults-file="${m}"`,
            `--datadir="${dataDir}"`,
            `--port="${version.port}"`,
            `--pid-file="${p}"`,
            '--user=mysql',
            '--slow-query-log=ON',
            `--slow-query-log-file="${s}"`,
            `--log-error="${e}"`,
            `--socket="${sock}"`,
            '--standalone'
          ]

          const commands: string[] = [
            '@echo off',
            'chcp 65001>nul',
            `cd /d "${dirname(bin!)}"`,
            `start /B ./${basename(bin!)} ${params.join(' ')} > "${startLogFile}" 2>"${startErrLogFile}"`
          ]

          command = commands.join(EOL)
          console.log('command: ', command)

          const cmdName = `start-${id}.cmd`
          const sh = join(global.Server.MysqlDir!, cmdName)
          await writeFile(sh, command)

          process.chdir(global.Server.MysqlDir!)
          try {
            await spawnPromise(cmdName, [], {
              shell: 'cmd.exe',
              cwd: global.Server.MysqlDir!
            })
          } catch (e: any) {
            console.log('-k start err: ', e)
            reject(e)
            return
          }
          const res = await this.waitPidFile(p)
          if (res) {
            if (res?.pid) {
              resolve(true)
              return
            }
            reject(new Error(res?.error ?? 'Start Fail'))
            return
          }
          let msg = 'Start Fail'
          if (existsSync(startLogFile)) {
            msg = await readFile(startLogFile, 'utf-8')
          }
          reject(new Error(msg))
        })
      }

      const initPassword = () => {
        return new ForkPromise(async (resolve, reject) => {
          if (isWindows()) {
            const bin = join(dirname(version.version.bin!), 'mysqladmin.exe')
            if (existsSync(bin)) {
              process.chdir(dirname(bin))
              try {
                await execPromise(
                  `${basename(bin)} -P${version.port} -S"${sock}" -uroot password "root"`
                )
              } catch (e) {
                console.log('_initPassword err: ', e)
                reject(e)
                return
              }
            }
          } else {
            try {
              await execPromise(`./mysqladmin -P${version.port} -S${sock} -uroot password "root"`, {
                cwd: dirname(version.version.bin!)
              })
            } catch (e) {
              console.log('_initPassword err: ', e)
              reject(e)
            }
          }
          resolve(true)
        })
      }

      let command = ''
      if (!existsSync(dataDir) || readdirSync(dataDir).length === 0) {
        await mkdirp(dataDir)
        await chmod(dataDir, '0777')
        if (isWindows()) {
          const params = [
            `--defaults-file="${m}"`,
            `--datadir="${dataDir}"`,
            `--port="${version.port}"`,
            `--pid-file="${p}"`,
            '--user=mysql',
            '--slow-query-log=ON',
            `--slow-query-log-file="${s}"`,
            `--log-error="${e}"`,
            `--socket="${sock}"`,
            '--initialize-insecure'
          ]
          process.chdir(dirname(bin!))
          command = `${basename(bin!)} ${params.join(' ')}`
          console.log('command: ', command)
          try {
            const res = await execPromise(command)
            console.log('init res: ', res)
            on(res.stdout)
          } catch (e: any) {
            reject(e)
            return
          }
        } else {
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
            params.push(
              `--lc-messages-dir=/opt/local/share/${basename(version.version.path!)}/english`
            )
          }
          const currentVersion = version.version!
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
                  await Helper.send(
                    'mysql',
                    'macportsDirFixed',
                    enDir,
                    shareDir,
                    langDir,
                    langEnDir
                  )
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
            reject(e)
            return
          }
        }

        await waitTime(500)
        try {
          await doStart()
          await waitTime(500)
          await initPassword()
          on(I18nT('fork.postgresqlInit', { dir: dataDir }))
          resolve(true)
        } catch (e) {
          await unlinkDirOnFail()
          reject(e)
        }
      } else {
        doStart().then(resolve).catch(reject)
      }
    })
  }

  fetchAllOnlineVersion() {
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
          a.name = `MySQL-${a.version}`
        })
        resolve(all)
      } catch {
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
      let all: Promise<SoftInstalled[]>[] = []
      if (isWindows()) {
        all = [versionLocalFetch(setup?.mysql?.dirs ?? [], 'mysqld.exe')]
      } else {
        all = [
          versionLocalFetch(setup?.mysql?.dirs ?? [], 'mysqld_safe', 'mysql'),
          versionMacportsFetch(fpms)
        ]
      }
      Promise.all(all)
        .then(async (list) => {
          versions = list.flat().filter((v) => !v.bin.includes('mariadb'))
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            let command = ''
            if (isWindows()) {
              command = `"${item.bin}" -V`
            } else {
              const bin = join(dirname(item.bin), 'mysqld')
              command = `"${bin}" -V`
            }
            const reg = /(Ver )(\d+(\.\d+){1,4})( )/g
            return TaskQueue.run(versionBinVersion, item.bin, command, reg)
          })
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

  brewinfo() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        let all: Array<string> = ['mysql']
        const command = 'brew search -q --formula "/^mysql@[\\d\\.]+$/"'
        all = await brewSearch(all, command)
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
        `"^mysql([\\d]+)?$"`,
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

  passwordChange(version: SoftInstalled, user: string, password: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const res: any = await this._startServer(version, true, password)
        console.log('rootPasswordChange _startServer res: ', res)
        const pid = res?.['APP-Service-Start-PID']
        version.pid = pid
      } catch (e) {
        console.log('rootPasswordChange _startServer e: ', e)
        return reject(e)
      }
      await waitTime(1000)

      if (isWindows()) {
        const bin = join(dirname(version.bin), 'mysql.exe')
        if (compareVersions(version.version!, '8.0.0') === 1) {
          try {
            await execPromise(
              `"${bin}" -u root --protocol=pipe -e "FLUSH PRIVILEGES;ALTER USER '${user}'@'localhost' IDENTIFIED WITH caching_sha2_password BY '${password}';FLUSH PRIVILEGES;"`
            )
          } catch (e) {
            console.log('mysql.exe error0: ', e)
          }
          try {
            await execPromise(
              `"${bin}" -u root --protocol=pipe -e "FLUSH PRIVILEGES;ALTER USER '${user}'@'127.0.0.1' IDENTIFIED WITH caching_sha2_password BY '${password}';FLUSH PRIVILEGES;"`
            )
          } catch (e) {
            console.log('mysql.exe error1: ', e)
          }
        } else if (compareVersions(version.version!, '5.7.5') === 1) {
          try {
            await execPromise(
              `"${bin}" -u root --protocol=pipe -e "FLUSH PRIVILEGES;ALTER USER '${user}'@'localhost' IDENTIFIED BY '${password}';FLUSH PRIVILEGES;"`
            )
          } catch (e) {
            console.log('mysql.exe error2: ', e)
          }
          try {
            await execPromise(
              `"${bin}" -u root --protocol=pipe -e "FLUSH PRIVILEGES;ALTER USER '${user}'@'127.0.0.1' IDENTIFIED BY '${password}';FLUSH PRIVILEGES;"`
            )
          } catch (e) {
            console.log('mysql.exe error3: ', e)
          }
        } else {
          try {
            await execPromise(
              `"${bin}" -u root --protocol=pipe -e "FLUSH PRIVILEGES;UPDATE mysql.user SET Password=PASSWORD('${password}') WHERE User='${user}';FLUSH PRIVILEGES;"`
            )
          } catch (e) {
            console.log('mysql.exe error2: ', e)
          }
        }
      } else {
        const bin = join(dirname(version.bin), 'mysql')
        const socket = `/tmp/mysql.${version.version}.sock`

        if (compareVersions(version.version!, '8.0.0') === 1) {
          try {
            await execPromise(
              `"${bin}" -u root --protocol=socket --socket="${socket}" -e "FLUSH PRIVILEGES;ALTER USER '${user}'@'localhost' IDENTIFIED WITH caching_sha2_password BY '${password}';FLUSH PRIVILEGES;"`
            )
          } catch (e) {
            console.log('mysql.exe error0: ', e)
          }
          try {
            await execPromise(
              `"${bin}" -u root --protocol=socket --socket="${socket}" -e "FLUSH PRIVILEGES;ALTER USER '${user}'@'127.0.0.1' IDENTIFIED WITH caching_sha2_password BY '${password}';FLUSH PRIVILEGES;"`
            )
          } catch (e) {
            console.log('mysql.exe error1: ', e)
          }
        } else if (compareVersions(version.version!, '5.7.5') === 1) {
          try {
            await execPromise(
              `"${bin}" -u root --protocol=socket --socket="${socket}" -e "FLUSH PRIVILEGES;ALTER USER '${user}'@'localhost' IDENTIFIED BY '${password}';FLUSH PRIVILEGES;"`
            )
          } catch (e) {
            console.log('mysql.exe error2: ', e)
          }
          try {
            await execPromise(
              `"${bin}" -u root --protocol=socket --socket="${socket}" -e "FLUSH PRIVILEGES;ALTER USER '${user}'@'127.0.0.1' IDENTIFIED BY '${password}';FLUSH PRIVILEGES;"`
            )
          } catch (e) {
            console.log('mysql.exe error3: ', e)
          }
        } else {
          try {
            await execPromise(
              `"${bin}" -u root --protocol=socket --socket="${socket}" -e "FLUSH PRIVILEGES;UPDATE mysql.user SET Password=PASSWORD('${password}') WHERE User='${user}';FLUSH PRIVILEGES;"`
            )
          } catch (e) {
            console.log('mysql.exe error2: ', e)
          }
        }
      }

      version.rootPassword = password
      try {
        await super._stopServer(version)
      } catch {}

      resolve(true)
    })
  }

  getDatabasesWithUsers(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject) => {
      const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
      const m = join(global.Server.MysqlDir!, `my-${v}.cnf`)

      const content = await readFile(m, 'utf8')
      const config = iniParse(content)
      const port = config?.mysqld?.port ?? 3306
      console.log('rootPasswordChange port: ', port)
      let connection: Connection | undefined
      try {
        connection = await createConnection({
          host: '127.0.0.1',
          user: 'root',
          password: version?.rootPassword ?? 'root',
          port
        })
      } catch (e) {
        console.log('rootPasswordChange Connection err 0: ', e)
      }

      if (!connection) {
        try {
          connection = await createConnection({
            host: 'localhost',
            user: 'root',
            port
          })
        } catch (e) {
          console.log('rootPasswordChange Connection err 1: ', e)
          return reject(e)
        }
      }

      try {
        const [databases]: any = await connection.query(`
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name NOT IN (
        'mysql', 'information_schema', 'performance_schema', 'sys'
      )
    `)

        const [dbPrivileges]: any = await connection.query(`
      SELECT * FROM mysql.db
      WHERE Db NOT IN ('mysql', 'sys') and
        Select_priv = 'Y' and
        Insert_priv = 'Y' and
        Update_priv = 'Y' and
        Delete_priv = 'Y' and
        Create_priv = 'Y' and
        Drop_priv = 'Y' and
        References_priv = 'Y' and
        Index_priv = 'Y' and
        Alter_priv = 'Y' and
        Create_tmp_table_priv = 'Y' and
        Lock_tables_priv = 'Y' and
        Create_view_priv = 'Y' and
        Show_view_priv = 'Y' and
        Create_routine_priv = 'Y' and
        Alter_routine_priv = 'Y' and
        Execute_priv = 'Y' and
        Event_priv = 'Y' and
        Trigger_priv = 'Y'
    `)

        const [globalUsers]: any = await connection.query(`
      SELECT DISTINCT User, Host
      FROM mysql.user
      WHERE
        Select_priv = 'Y' and
        Insert_priv = 'Y' and
        Update_priv = 'Y' and
        Delete_priv = 'Y' and
        Create_priv = 'Y' and
        Drop_priv = 'Y' and
        References_priv = 'Y' and
        Index_priv = 'Y' and
        Alter_priv = 'Y' and
        Create_tmp_table_priv = 'Y' and
        Lock_tables_priv = 'Y' and
        Create_view_priv = 'Y' and
        Show_view_priv = 'Y' and
        Create_routine_priv = 'Y' and
        Alter_routine_priv = 'Y' and
        Execute_priv = 'Y' and
        Event_priv = 'Y' and
        Trigger_priv = 'Y'
    `)

        const [allUsers]: any = await connection.query(`
      SELECT DISTINCT User, Host
      FROM mysql.user
    `)

        const list = databases.map((db: any) => {
          const dbName = db?.SCHEMA_NAME ?? db.schema_name

          const directUsers = dbPrivileges
            .filter((priv: any) => priv.Db.replace(/[\\]+/g, '') === dbName)
            .map((priv: any) => `${priv.User}`)

          const globalUserList = globalUsers.map((u: any) => `${u.User}`)

          return {
            name: dbName,
            users: [...new Set([...directUsers, ...globalUserList])]
          }
        })
        resolve({
          list,
          databases,
          dbPrivileges,
          globalUsers,
          allUsers
        })
      } finally {
        await connection.end()
      }
    })
  }

  addDatabase(version: SoftInstalled, data: any) {
    return new ForkPromise(async (resolve, reject) => {
      const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
      const m = join(global.Server.MysqlDir!, `my-${v}.cnf`)

      const content = await readFile(m, 'utf8')
      const config = iniParse(content)
      const port = config?.mysqld?.port ?? 3306
      console.log('rootPasswordChange port: ', port)
      let connection: Connection | undefined
      try {
        connection = await createConnection({
          host: '127.0.0.1',
          user: 'root',
          password: version?.rootPassword ?? 'root',
          port
        })
      } catch (e) {
        console.log('rootPasswordChange Connection err 0: ', e)
      }

      if (!connection) {
        try {
          connection = await createConnection({
            host: 'localhost',
            user: 'root',
            port
          })
        } catch (e) {
          console.log('rootPasswordChange Connection err 1: ', e)
          return reject(e)
        }
      }

      let userExists = false

      try {
        await connection.query('FLUSH PRIVILEGES')
        // 1. 创建数据库
        await connection.query(
          `CREATE DATABASE IF NOT EXISTS \`${data.database}\` CHARACTER SET ${data.charset}`
        )

        const [plugin]: any = await connection.query(
          `SELECT * FROM mysql.plugin WHERE name = 'caching_sha2_password';`
        )

        const [users]: any = await connection.query(
          `SELECT User FROM mysql.user WHERE User = ? AND Host = 'localhost'`,
          [data.user]
        )
        if (!users || users.length === 0) {
          if (plugin && plugin.length > 0) {
            await connection.query(
              `CREATE USER IF NOT EXISTS '${data.user}'@'localhost' IDENTIFIED WITH caching_sha2_password BY '${data.password}'`
            )
          } else {
            // MySQL 5.7.5及以下版本
            await connection.query(`CREATE USER ?@'localhost' IDENTIFIED BY ?`, [
              data.user,
              data.password
            ])
          }
        } else {
          if (compareVersions(version.version!, '8.0.0') === 1) {
            if (plugin && plugin.length > 0) {
              await connection.query(
                `ALTER USER '${data.user}'@'localhost' IDENTIFIED WITH caching_sha2_password BY '${data.password}';`
              )
            } else {
              await connection.query(
                `ALTER USER '${data.user}'@'localhost' IDENTIFIED BY '${data.password}';`
              )
            }
          } else if (compareVersions(version.version!, '5.7.5') === 1) {
            await connection.query(
              `ALTER USER '${data.user}'@'localhost' IDENTIFIED BY '${data.password}';`
            )
          } else {
            await connection.query(
              `UPDATE mysql.user SET Password=PASSWORD('${data.password}') WHERE User='${data.user}';`
            )
          }
          userExists = true
        }

        // 3. 授予用户对数据库的所有权限
        await connection.query(
          `GRANT ALL PRIVILEGES ON \`${data.database}\`.* TO '${data.user}'@'localhost'`
        )

        // 4. 刷新权限
        await connection.query('FLUSH PRIVILEGES')
        await connection?.end()
      } catch (e) {
        console.log('addDatabase Error: ', e)
        await connection?.end()
        return reject(e)
      }

      resolve({
        userExists
      })
    })
  }

  backupDatabase(version: SoftInstalled, databases: string[], saveDir: string) {
    return new ForkPromise(async (resolve, reject) => {
      if (!isAbsolute(saveDir)) {
        return reject(new Error(I18nT('mysql.saveDirError')))
      }

      try {
        await mkdirp(saveDir)
      } catch {
        return reject(new Error(I18nT('mysql.saveDirError')))
      }

      let bin = ''
      if (isWindows()) {
        bin = join(dirname(version.bin), 'mysqldump.exe')
      } else {
        bin = join(dirname(version.bin), 'mysqldump')
      }

      const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
      const m = join(global.Server.MysqlDir!, `my-${v}.cnf`)

      const content = await readFile(m, 'utf8')
      const config = iniParse(content)
      const port = config?.mysqld?.port ?? 3306
      const password = version?.rootPassword ?? 'root'
      const error: any = []

      const time = format(new Date(), 'yyyy-MM-dd-HH-mm-ss')
      for (const database of databases) {
        const file = join(saveDir, `${database}-backup-${time}.sql`)
        let cammand = ``
        if (compareVersions(version.version!, '8.0.0') === 1) {
          cammand = `"${bin}" -uroot -p${password} --port=${port} --host="127.0.0.1" --single-transaction --column-statistics=0 --no-tablespaces ${database} > "${file}"`
        } else {
          cammand = `"${bin}" -uroot -p${password} --port=${port} --host="127.0.0.1" --single-transaction --no-tablespaces ${database} > "${file}"`
        }
        try {
          await execPromise(cammand)
        } catch (e) {
          error.push(I18nT('mysql.backupFail', { database, error: `${e}` }))
        }
      }

      resolve(error)
    })
  }
}
export default new Mysql()
