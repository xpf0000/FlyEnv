import { join, dirname } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '../lang'
import type { SoftInstalled } from '@shared/app'
import { execPromiseRoot, waitTime } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { copyFile, unlink, readFile, writeFile } from 'fs-extra'
import { zipUnPack } from '@shared/file'
import axios from 'axios'
import { compareVersions } from 'compare-versions'

class Manager extends Base {
  constructor() {
    super()
    this.type = 'postgresql'
  }

  init() { }

  #initLocalApp(version: SoftInstalled) {
    return new Promise((resolve) => {
      console.log('initLocalApp: ', version.bin, global.Server.AppDir)
      if (!existsSync(version.bin) && version.bin.includes(join(global.Server.AppDir!, `postgresql-${version.version}`))) {
        zipUnPack(join(global.Server.Static!, `zip/postgresql-${version.version}.7z`), global.Server.AppDir!)
          .then(resolve)
          .catch(resolve)
        return
      }
      resolve(true)
    })
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      await this.#initLocalApp(version)

      const bin = version.bin
      const versionTop = version?.version?.split('.')?.shift() ?? ''
      const dbPath = join(global.Server.PostgreSqlDir!, `postgresql${versionTop}`)
      const confFile = join(dbPath, 'postgresql.conf')
      const pidFile = join(dbPath, 'postmaster.pid')
      const logFile = join(dbPath, 'pg.log')
      let sendUserPass = false
      try {
        if (existsSync(pidFile)) {
          await unlink(pidFile)
        }
      } catch (e) { }

      const checkpid = async (time = 0) => {
        if (existsSync(pidFile)) {
          if (sendUserPass) {
            on(I18nT('fork.postgresqlInit', { dir: dbPath }))
          }
          resolve(true)
        } else {
          if (time < 40) {
            await waitTime(500)
            await checkpid(time + 1)
          } else {
            reject(new Error('Start Failed'))
          }
        }
      }
      const doRun = async () => {
        const command = `start /b ${bin} -D ${dbPath} -l ${logFile} start`
        try {
          await execPromiseRoot(command)
        } catch (e) {
          reject(e)
          return
        }
        await waitTime(1000)
        await checkpid()
      }
      if (existsSync(confFile)) {
        await doRun()
      } else if (!existsSync(dbPath)) {

        process.env.LC_ALL = global.Server.Local!
        process.env.LANG = global.Server.Local!

        console.log('global.Server.Local: ', global.Server.Local)

        const binDir = dirname(bin)
        const initDB = join(binDir, 'initdb.exe')
        const command = `start /b ${initDB} -D ${dbPath} -U root`
        try {
          await execPromiseRoot(command)
        } catch (e) {
          reject(e)
          return
        }
        await waitTime(1000)
        if (!existsSync(confFile)) {
          reject(new Error(`Data Dir ${dbPath} create faild`))
          return
        }
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

        const defaultConfFile = join(dbPath, 'postgresql.conf.default')
        await copyFile(confFile, defaultConfFile)
        sendUserPass = true
        await this._stopServer(version)
        await doRun()
      } else {
        reject(new Error(`Data Dir ${dbPath} has exists, but conf file not found in dir`))
      }
    })
  }

  fetchAllOnLineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const urls = [
          'https://www.enterprisedb.com/downloads/postgres-postgresql-downloads',
        ]
        const fetchVersions = async (url: string) => {
          const all: any = []
          const res = await axios({
            url,
            method: 'get'
          })
          const html = res.data
          const reg = /<tbody((?!<\/table>)[\s\S]*?)<\/tbody>/g
          let r
          while ((r = reg.exec(html)) !== null) {
            let table = r[0]
            table = table.replace(/<svg((?!<\/svg>)[\s\S]*?)<\/svg>/g, '')
              .replace(/[\n]+/g, '')
              .replace(/[\s]+/g, ' ')
              .replace(/<\!--(.*?)-->/g, ' ')

            const reg1 = /<tr(.*?)<td(.*?)>(.*?)<\/td><td(.*?)>(.*?)<\/td><td(.*?)>(.*?)<\/td><td(.*?)>(.*?)<\/td><td(.*?)>(.*?)href="(.*?)"(.*?)<\/td><td(.*?)>(.*?)<\/td><\/tr>/g
            let r1
            while ((r1 = reg1.exec(table)) !== null) {
              console.log(r1)
              const version = r1[3]
              const mv = version.split('.').slice(0, 2).join('.')
              const u = `https://get.enterprisedb.com/postgresql/postgresql-${version}-1-windows-x64-binaries.zip`
              const item = {
                url: u,
                version,
                mVersion: mv
              }
              const find = all.find((f: any) => f.mVersion === item.mVersion)
              if (!find) {
                all.push(item)
              } else {
                if (compareVersions(item.version, find.version) > 0) {
                  const index = all.indexOf(find)
                  all.splice(index, 1, item)
                }
              }
            }
          }
          return all
        }
        const all: any = []
        const res = await Promise.all(urls.map((u) => fetchVersions(u)))
        const list = res.flat()
        console.log('list: ', list)
        list.filter((l: any) => compareVersions(l.mVersion, '10.0') > 0).forEach((l: any) => {
          const find = all.find((f: any) => f.mVersion === l.mVersion)
          if (!find) {
            all.push(l)
          } else {
            if (compareVersions(l.version, find.version) > 0) {
              const index = all.indexOf(find)
              all.splice(index, 1, l)
            }
          }
        })
        console.log('all: ', all)
        all.sort((a: any, b: any) => {
          return compareVersions(b.version, a.version)
        })

        all.forEach((a: any) => {
          const dir = join(global.Server.AppDir!, `postgresql-${a.version}`, `pgsql`, 'bin/pg_ctl.exe')
          const zip = join(global.Server.Cache!, `postgresql-${a.version}.zip`)
          a.appDir = join(global.Server.AppDir!, `postgresql-${a.version}`)
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
}

export default new Manager()
