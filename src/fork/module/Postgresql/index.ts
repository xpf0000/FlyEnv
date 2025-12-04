import { join, dirname, basename } from 'path'
import { existsSync, readdirSync } from 'fs'
import { Base } from '../Base'
import { I18nT } from '@lang/index'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  brewInfoJson,
  brewSearch,
  execPromise,
  getSubDirAsync,
  portSearch,
  serviceStartExec,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionMacportsFetch,
  versionSort,
  waitTime,
  chmod,
  copyFile,
  readFile,
  unlink,
  writeFile,
  remove,
  serviceStartExecCMD,
  mkdirp,
  execPromiseWithEnv
} from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import axios from 'axios'
import TaskQueue from '../../TaskQueue'
import { isWindows } from '@shared/utils'
import { spawnPromise } from '@shared/child-process'

class Manager extends Base {
  constructor() {
    super()
    this.type = 'postgresql'
  }

  init() {}

  _stopServer(
    version: SoftInstalled,
    DATA_DIR?: string
  ): ForkPromise<{ 'APP-Service-Stop-PID': number[] }> {
    return new ForkPromise(async (resolve, reject, on) => {
      const bin = version.bin
      const versionTop = version?.version?.split('.')?.shift() ?? ''
      const dbPath = DATA_DIR ?? join(global.Server.PostgreSqlDir!, `postgresql${versionTop}`)
      const logFile = join(dbPath, 'pg.log')

      const doStop = async () => {
        try {
          await spawnPromise(basename(bin), ['stop', '-D', dbPath, '-l', logFile], {
            cwd: dirname(bin),
            shell: false
          })
        } catch (e) {
          console.log('PostgreSQL shutdown error: ', e)
          console.log('PostgreSQL shutdown error version: ', version, bin)
        }
      }

      if (!isWindows()) {
        const pidFile = join(dbPath, 'postmaster.pid')
        await doStop()
        const check = async (times = 0) => {
          if (times >= 10) {
            console.log('times out: ', times)
            return true
          }
          if (!existsSync(pidFile)) {
            console.log('times success: ', times)
            return true
          } else {
            await waitTime(1000)
            await doStop()
            return await check(times + 1)
          }
        }
        await check()
      } else {
        await doStop()
      }

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

  _startServer(version: SoftInstalled, DATA_DIR?: string) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `${this.type}-${version.version}` })
        )
      })
      const bin = version.bin
      const versionTop = version?.version?.split('.')?.shift() ?? ''
      const dbPath = DATA_DIR ?? join(global.Server.PostgreSqlDir!, `postgresql${versionTop}`)
      const confFile = join(dbPath, 'postgresql.conf')
      const pidFile = join(dbPath, 'postmaster.pid')
      const logFile = join(dbPath, 'pg.log')
      const sendUserPass = false

      await mkdirp(global.Server.PostgreSqlDir!)

      const doRun = async () => {
        const baseDir = global.Server.PostgreSqlDir!
        if (isWindows()) {
          const execArgs = `-D "${dbPath}" -l "${logFile}" start`

          try {
            const res = await serviceStartExecCMD({
              version,
              pidPath: pidFile,
              baseDir,
              bin,
              execArgs,
              execEnv: '',
              on
            })
            if (sendUserPass) {
              on(I18nT('fork.postgresqlInit', { dir: dbPath }))
            }
            const pid = res['APP-Service-Start-PID'].trim().split('\n').shift()!.trim()
            on({
              'APP-On-Log': AppLog('info', I18nT('appLog.startServiceSuccess', { pid: pid }))
            })
            resolve({
              'APP-Service-Start-PID': pid
            })
          } catch (e: any) {
            console.log('-k start err: ', e)
            reject(e)
            return
          }
        } else {
          const execEnv = `export LC_ALL="${global.Server.Local!}"
export LANG="${global.Server.Local!}"
`
          const execArgs = `-D "${dbPath}" -l "${logFile}" start`

          try {
            const res = await serviceStartExec({
              version,
              pidPath: pidFile,
              baseDir,
              bin,
              execArgs,
              execEnv,
              on
            })
            if (sendUserPass) {
              on(I18nT('fork.postgresqlInit', { dir: dbPath }))
            }
            const pid = res['APP-Service-Start-PID'].trim().split('\n').shift()!.trim()
            on({
              'APP-On-Log': AppLog('info', I18nT('appLog.startServiceSuccess', { pid: pid }))
            })
            await waitTime(1000)
            resolve({
              'APP-Service-Start-PID': pid
            })
          } catch (e: any) {
            console.log('-k start err: ', e)
            reject(e)
            return
          }
        }
      }
      if (existsSync(confFile)) {
        await doRun()
      } else if (!existsSync(dbPath) || (existsSync(dbPath) && readdirSync(dbPath).length === 0)) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.initDBDataDir'))
        })
        const binDir = dirname(bin)
        if (isWindows()) {
          process.env.LC_ALL = global.Server.Local!
          process.env.LANG = global.Server.Local!
          await mkdirp(dbPath)
          const initDB = join(binDir, 'initdb.exe')
          process.chdir(dirname(initDB))
          const command = `start /B ./${basename(initDB)} -D "${dbPath}" -U root > NUL 2>&1 &`
          try {
            await execPromise(command)
          } catch (e) {
            on({
              'APP-On-Log': AppLog('error', I18nT('appLog.initDBDataDirFail', { error: e }))
            })
            reject(e)
            return
          }
        } else {
          const initDB = join(binDir, 'initdb')
          const command = `"${initDB}" -D "${dbPath}" -U root --locale=${global.Server.Local} --encoding=UTF8 && wait`
          console.log('global.Server.Local: ', global.Server.Local)
          try {
            await execPromiseWithEnv(command, {
              env: {
                LC_ALL: global.Server.Local!,
                LANG: global.Server.Local!
              }
            })
          } catch (e) {
            on({
              'APP-On-Log': AppLog('error', I18nT('appLog.initDBDataDirFail', { error: e }))
            })
            reject(e)
            return
          }
        }
        await waitTime(1000)
        if (!existsSync(confFile)) {
          on({
            'APP-On-Log': AppLog(
              'error',
              I18nT('appLog.initDBDataDirFail', { error: `Data Dir ${dbPath} create faild` })
            )
          })
          reject(new Error(`Data Dir ${dbPath} create faild`))
          return
        }
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.initDBDataDirSuccess', { dir: dbPath }))
        })

        if (isWindows()) {
          let conf = await readFile(confFile, 'utf-8')
          let find = conf.match(/lc_messages = '(.*?)'/g)
          conf = conf.replace(find?.[0] ?? '###@@@&&&', `lc_messages = '${global.Server.Local}'`)
          find = conf.match(/lc_monetary = '(.*?)'/g)
          conf = conf.replace(find?.[0] ?? '###@@@&&&', `lc_monetary = '${global.Server.Local}'`)
          find = conf.match(/lc_numeric = '(.*?)'/g)
          conf = conf.replace(find?.[0] ?? '###@@@&&&', `lc_numeric = '${global.Server.Local}'`)
          find = conf.match(/lc_time = '(.*?)'/g)
          conf = conf.replace(find?.[0] ?? '###@@@&&&', `lc_time = '${global.Server.Local}'`)

          await writeFile(confFile, conf)
        }

        const defaultConfFile = join(dbPath, 'postgresql.conf.default')
        await copyFile(confFile, defaultConfFile)
        await doRun()
      } else {
        reject(new Error(`Data Dir ${dbPath} has exists, but conf file not found in dir`))
      }
    })
  }

  fetchLastedTag() {
    return new ForkPromise(async (resolve) => {
      try {
        const url = 'https://api.github.com/repos/pgvector/pgvector/tags?page=1&per_page=1'
        const res = await axios({
          url,
          method: 'get',
          proxy: this.getAxiosProxy()
        })
        const html = res.data
        let arr: any
        try {
          if (typeof html === 'string') {
            arr = JSON.parse(html)
          } else {
            arr = html
          }
        } catch {}
        resolve(arr?.[0]?.name)
      } catch {
        resolve('v0.7.4')
      }
    })
  }

  installPgvector(version: SoftInstalled, tag: string) {
    return new ForkPromise(async (resolve, reject) => {
      const sh = join(global.Server.Static!, 'sh/pgsql-pgvector.sh')
      const copyfile = join(global.Server.Cache!, 'pgsql-pgvector.sh')
      if (existsSync(copyfile)) {
        await unlink(copyfile)
      }
      let content = await readFile(sh, 'utf-8')
      content = content.replace('##BIN_PATH##', dirname(version.bin)).replace('##BRANCH##', tag)
      await writeFile(copyfile, content)
      await chmod(copyfile, '0777')
      // const params = [copyfile]
      try {
        // ('zsh', params).then(resolve).catch(reject)
      } catch (e) {
        reject(e)
      }
    })
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('postgresql')
        all.forEach((a: any) => {
          const dir = join(
            global.Server.AppDir!,
            `postgresql-${a.version}`,
            `pgsql`,
            'bin/pg_ctl.exe'
          )
          const zip = join(global.Server.Cache!, `postgresql-${a.version}.zip`)
          a.appDir = join(global.Server.AppDir!, `postgresql-${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          a.name = `PostgreSQL-${a.version}`
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
        .filter((f) => f.startsWith('postgresql'))
        .map((f) => `lib/${f}/bin/pg_ctl`)
      let versions: SoftInstalled[] = []
      let all: Promise<SoftInstalled[]>[] = []
      if (isWindows()) {
        all = [versionLocalFetch(setup?.postgresql?.dirs ?? [], 'pg_ctl.exe')]
      } else {
        all = [
          versionLocalFetch(setup?.apache?.dirs ?? [], 'pg_ctl', 'postgresql'),
          versionMacportsFetch(fpms)
        ]
      }

      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `"${item.bin}" --version`
            const reg = /(\s)(\d+(\.\d+){1,4})(.*?)/g
            return TaskQueue.run(versionBinVersion, item.bin, command, reg)
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
        let all: Array<string> = []
        const command = 'brew search -q --formula "/^postgresql@[\\d\\.]+$/"'
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
        `"^postgresql\\d*$"`,
        (f) => {
          return f.includes('The most advanced open-source database available anywhere.')
        },
        (name) => {
          return existsSync(join('/opt/local/lib', name, 'bin/pg_ctl'))
        }
      )
      resolve(Info)
    })
  }
}

export default new Manager()
