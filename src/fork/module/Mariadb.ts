import { join, dirname, basename } from 'path'
import { existsSync, readdirSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '../lang'
import type { SoftInstalled } from '@shared/app'
import { execPromise, waitTime, execPromiseRoot } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { writeFile, mkdirp, chmod, unlink, remove } from 'fs-extra'
import { zipUnPack } from '@shared/file'
import axios from 'axios'
import { compareVersions } from 'compare-versions'

class Manager extends Base {
  constructor() {
    super()
    this.type = 'mariadb'
  }

  init() {
    this.pidPath = join(global.Server.MariaDBDir!, 'mariadb.pid')
  }

  #initLocalApp(version: SoftInstalled) {
    return new Promise((resolve, reject) => {
      console.log('initLocalApp: ', version.bin, global.Server.AppDir)
      if (!existsSync(version.bin) && version.bin.includes(join(global.Server.AppDir!, `mariadb-${version.version}`))) {
        zipUnPack(join(global.Server.Static!, `zip/mariadb-${version.version}.7z`), global.Server.AppDir!)
        .then(resolve)
        .catch((err: any) => {
          console.log('initLocalApp err: ', err)
          reject(err)
        })
        return
      }
      resolve(true)
    })
  }

  _initPassword(version: SoftInstalled) {
    return new ForkPromise((resolve, reject) => {
      const bin = join(dirname(version.bin), 'mariadb-admin.exe')
      const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
      const m = join(global.Server.MariaDBDir!, `my-${v}.cnf`)

      execPromise(`${basename(bin)} --defaults-file="${m}" --port=3306 -uroot password "root"`, {
        cwd: dirname(bin)
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

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      await this.#initLocalApp(version)

      let bin = version.bin
      const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
      const m = join(global.Server.MariaDBDir!, `my-${v}.cnf`)
      const dataDir = join(global.Server.MariaDBDir!, `data-${v}`).split('\\').join('/')
      if (!existsSync(m)) {
        const conf = `[mariadbd]
# Only allow connections from localhost
bind-address = 127.0.0.1
sql-mode=NO_ENGINE_SUBSTITUTION
port = 3306
datadir="${dataDir}"`
        await writeFile(m, conf)
      }

      const p = join(global.Server.MariaDBDir!, 'mariadb.pid')
      const s = join(global.Server.MariaDBDir!, 'slow.log')
      const e = join(global.Server.MariaDBDir!, 'error.log')
      const params = [
        `--defaults-file="${m}"`,
        `--pid-file="${p}"`,
        '--slow-query-log=ON',
        `--slow-query-log-file="${s}"`,
        `--log-error="${e}"`
      ]

      try {
        if (existsSync(p)) {
          await unlink(p)
        }
      } catch (e) {}

      const unlinkDirOnFail = async () => {
        if (existsSync(dataDir)) {
          await remove(dataDir)
        }
        if (existsSync(m)) {
          await remove(m)
        }
      }

      const waitPid = async (time = 0): Promise<boolean> => {
        let res = false
        if (existsSync(p)) {
          res = true
        } else {
          if (time < 40) {
            await waitTime(500)
            res = res || await waitPid(time + 1)
          } else {
            res = false
          }
        }
        console.log('waitPid: ', time, res)
        return res
      }

      let command = ''
      if (!existsSync(dataDir) || readdirSync(dataDir).length === 0) {
        await mkdirp(dataDir)
        await chmod(dataDir, '0777')

        bin = join(version.path, 'bin/mariadb-install-db.exe')
        params.splice(0)
        params.push(`--datadir="${dataDir}"`)
        params.push(`--config="${m}"`)

        try {
          process.chdir(dirname(bin));
          console.log(`新的工作目录: ${process.cwd()}`);
        } catch (err) {
          console.error(`改变工作目录失败: ${err}`);
        }
        command = `${basename(bin)} ${params.join(' ')}`
        console.log('command: ', command)
        try {
          const res = await execPromiseRoot(command)
          console.log('init res: ', res)
          on(res.stdout)        
        } catch (e: any) {
          reject(e)
          return
        }
        await waitTime(500)
        try {
          await this._startServer(version).on(on)
          await waitTime(500)
          await this._initPassword(version)
          on(I18nT('fork.postgresqlInit', { dir: dataDir }))
          resolve(true)
        } catch (e) {
          await unlinkDirOnFail()
          reject(e)
        }

      } else {
        try {
          process.chdir(dirname(bin));
          console.log(`新的工作目录: ${process.cwd()}`);
        } catch (err) {
          console.error(`改变工作目录失败: ${err}`);
        }
        params.push('--standalone')
        command = `start /b ./${basename(bin)} ${params.join(' ')}`
        console.log('command: ', command)
        try {
          const res = await execPromiseRoot(command)
          console.log('start res: ', res)
          on(res.stdout)
          const check = await waitPid()
          if (check) {
            resolve(0)
          } else {
            reject(new Error('Start failed'))
          }
        } catch (e: any) {
          reject(e)
        }
      }
    })
  }

  fetchAllOnLineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const urls = [
          'https://mariadb.com/downloads/'
      ]
      const fetchVersions = async (url: string) => {
          const all: any = []
          const res = await axios({
            url,
            method: 'get'
        })
        const html = res.data
        const regSelect = /<select id="version-select-community_server"([\s\S\n]*?)<\/select>/g
        html.match(regSelect).forEach((select: string) => {
          const reg = /<option ([a-z="\d\.\s\n]+)>(\d[\d\.]+)([a-zA-Z\-\s\n]*?)<\/option>/g
          let r
          while((r = reg.exec(select)) !== null) {
              const version = r[2]
              const mv = version.split('.').slice(0, 2).join('.')
              const u = `https://downloads.mariadb.com/MariaDB/mariadb-${version}/winx64-packages/mariadb-${version}-winx64.zip`
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
        })        
        return all
      }
      const all: any = []
      const res = await Promise.all(urls.map((u) => fetchVersions(u)))
      const list = res.flat()
      list.filter((l:any) => Number(l.mVersion) > 11.0).forEach((l: any) => {
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
  
      all.sort((a: any, b: any) => {
        return compareVersions(b.version, a.version)
      })
  
      all.forEach((a: any) => {
        const dir = join(global.Server.AppDir!, `mariadb-${a.version}`, `mariadb-${a.version}-winx64`, 'bin/mariadbd.exe')
        const zip = join(global.Server.Cache!, `mariadb-${a.version}.zip`)
        a.appDir = join(global.Server.AppDir!, `mariadb-${a.version}`)
        a.zip = zip
        a.bin = dir
        a.downloaded = existsSync(zip)
        a.installed = existsSync(dir)
      })
          resolve(all)
      } catch(e) {
        resolve([])
      }    
    })
  }
}

export default new Manager()
