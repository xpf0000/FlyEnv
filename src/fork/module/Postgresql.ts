import { join, dirname } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '@lang/index'
import type { SoftInstalled } from '@shared/app'
import {
  AppLog,
  brewInfoJson,
  brewSearch,
  execPromise,
  getSubDirAsync,
  portSearch,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionMacportsFetch,
  versionSort,
  waitTime
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { chmod, copyFile, readFile, unlink, writeFile } from 'fs-extra'
import axios from 'axios'
import TaskQueue from '../TaskQueue'

class Manager extends Base {
  constructor() {
    super()
    this.type = 'postgresql'
  }

  init() {}

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `${this.type}-${version.version}` })
        )
      })
      const bin = version.bin
      const versionTop = version?.version?.split('.')?.shift() ?? ''
      const dbPath = join(global.Server.PostgreSqlDir!, `postgresql${versionTop}`)
      const confFile = join(dbPath, 'postgresql.conf')
      const pidFile = join(dbPath, 'postmaster.pid')
      const logFile = join(dbPath, 'pg.log')
      const doRun = async () => {
        try {
          if (existsSync(pidFile)) {
            await unlink(pidFile)
          }
        } catch (e) {}
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.execStartCommand'))
        })
        const command = `${bin} -D ${dbPath} -l ${logFile} start`
        try {
          await execPromise(command, {
            env: {
              LC_ALL: global.Server.Local!,
              LANG: global.Server.Local!
            }
          })
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
          reject(e)
          return
        }
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.execStartCommandSuccess'))
        })
        on({
          'APP-Service-Start-Success': true
        })
        const res = await this.waitPidFile(pidFile)
        if (res && res?.pid) {
          const pid = res.pid.split('\n').shift()?.trim() ?? ''
          on({
            'APP-On-Log': AppLog('info', I18nT('appLog.startServiceSuccess', { pid: pid }))
          })
          resolve({
            'APP-Service-Start-PID': pid
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
        reject(new Error(res ? res?.error : 'Start Fail'))
      }
      if (existsSync(confFile)) {
        await doRun()
      } else if (!existsSync(dbPath)) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.initDBDataDir'))
        })
        const binDir = dirname(bin)
        const initDB = join(binDir, 'initdb')
        const command = `${initDB} -D ${dbPath} -U root && wait`
        try {
          await execPromise(command)
        } catch (e) {
          on({
            'APP-On-Log': AppLog('error', I18nT('appLog.initDBDataDirFail', { error: e }))
          })
          reject(e)
          return
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
        } catch (e) {}
        resolve(arr?.[0]?.name)
      } catch (e) {
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

  allInstalledVersions(setup: any) {
    return new ForkPromise(async (resolve) => {
      const base = '/opt/local/'
      const allLibFile = await getSubDirAsync(join(base, 'lib'), false)
      const fpms = allLibFile
        .filter((f) => f.startsWith('postgresql1'))
        .map((f) => `lib/${f}/bin/pg_ctl`)
      let versions: SoftInstalled[] = []
      Promise.all([
        versionLocalFetch(setup?.apache?.dirs ?? [], 'pg_ctl', 'postgresql'),
        versionMacportsFetch(fpms)
      ])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `${item.bin} --version`
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
        let all: Array<string> = []
        const cammand = 'brew search -q --formula "/^postgresql@[\\d\\.]+$/"'
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
        `^postgresql\\d*$`,
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
