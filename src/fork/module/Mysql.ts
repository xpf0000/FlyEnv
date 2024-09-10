import { join, dirname, basename } from 'path'
import { existsSync, readdirSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '../lang'
import type { MysqlGroupItem, SoftInstalled } from '@shared/app'
import { execPromise, waitTime, execPromiseRoot } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { mkdirp, writeFile, chmod, unlink, remove } from 'fs-extra'
import axios from 'axios'
import { compareVersions } from 'compare-versions'

class Mysql extends Base {
  constructor() {
    super()
    this.type = 'mysql'
  }

  init() {
    this.pidPath = join(global.Server.MysqlDir!, 'mysql.pid')
  }

  _initPassword(version: SoftInstalled) {
    return new ForkPromise((resolve, reject) => {
      const bin = join(dirname(version.bin), 'mysqladmin.exe')
      execPromise(`mysqladmin.exe -uroot password "root"`, {
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
      await this.initLocalApp(version, 'mysql')
      let bin = version.bin
      const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
      const m = join(global.Server.MysqlDir!, `my-${v}.cnf`)
      const oldm = join(global.Server.MysqlDir!, 'my.cnf')
      const dataDir = join(global.Server.MysqlDir!, `data-${v}`).split('\\').join('/')
      if (!existsSync(m)) {
        const conf = `[mysqld]
# Only allow connections from localhost
bind-address = 127.0.0.1
sql-mode=NO_ENGINE_SUBSTITUTION
#设置数据目录
#brew安装的mysql, 数据目录是一样的, 会导致5.x版本和8.x版本无法互相切换, 所以为每个版本单独设置自己的数据目录
#如果配置文件已更改, 原配置文件在: ${oldm}
#可以复制原配置文件的内容, 使用原来的配置
datadir="${dataDir}"`
        await writeFile(m, conf)
      }

      const p = join(global.Server.MysqlDir!, 'mysql.pid')
      const s = join(global.Server.MysqlDir!, 'slow.log')
      const e = join(global.Server.MysqlDir!, 'error.log')
      const params = [
        `--defaults-file="${m}"`,
        `--pid-file="${p}"`,
        '--user=mysql',
        `--slow-query-log-file="${s}"`,
        `--log-error="${e}"`
      ]

      try {
        if (existsSync(p)) {
          await unlink(p)
        }
      } catch (e) { }

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
        params.push('--initialize-insecure')

        process.chdir(dirname(bin));
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
        params.push('--standalone')
        process.chdir(dirname(bin));
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

  stopGroupService(version: MysqlGroupItem) {
    console.log(version)
    return new ForkPromise(async (resolve, reject) => {
      const id = version?.id ?? ''
      const conf = 'PhpWebStudy-Data' + join(global.Server.MysqlDir!, `group/my-group-${id}.cnf`).split('PhpWebStudy-Data').pop()
      const serverName = 'mysqld'
      const command = `wmic process get commandline,ProcessId | findstr "${serverName}"`
      console.log('_stopServer command: ', command)
      let res: any = null
      try {
        res = await execPromiseRoot(command)
      } catch (e) { }
      const pids = res?.stdout?.trim()?.split('\n') ?? []
      const arr: Array<string> = []
      for (const p of pids) {
        if (p.includes(conf)) {
          const pid = p.split(' ').filter((s: string) => {
            return !!s.trim()
          }).pop()
          if (pid) {
            arr.push(pid)
          }
        }
      }
      if (arr.length > 0) {
        const str = arr.map((s) => `/pid ${s}`).join(' ')
        await execPromiseRoot(`taskkill /f /t ${str}`)

        // for (const pid of arr) {
        //   try {
        //     await execPromiseRoot(`wmic process where processid="${pid}" delete`)
        //   } catch (e) { }
        // }
      }
      await waitTime(500)
      resolve(true)
    })
  }

  startGroupServer(version: MysqlGroupItem) {
    return new ForkPromise(async (resolve, reject, on) => {
      await this.initLocalApp(version.version as any, 'mysql')
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
        `--defaults-file="${m}"`,
        `--datadir="${dataDir}"`,
        `--port="${version.port}"`,
        `--pid-file="${p}"`,
        '--user=mysql',
        `--slow-query-log-file="${s}"`,
        `--log-error="${e}"`,
        `--socket="${sock}"`
      ]

      try {
        if (existsSync(p)) {
          await unlink(p)
        }
      } catch (e) { }

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

      const initPassword = () => {
        return new ForkPromise((resolve, reject) => {
          const bin = join(dirname(version.version.bin!), 'mysqladmin.exe')
          execPromise(`${basename(bin)} -P${version.port} -S"${sock}" -uroot password "root"`,
            {
              cwd: dirname(bin)
            }
          )
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

      let command = ''
      if (!existsSync(dataDir) || readdirSync(dataDir).length === 0) {
        await mkdirp(dataDir)
        await chmod(dataDir, '0777')
        params.push('--initialize-insecure')
        process.chdir(dirname(bin!));
        command = `${basename(bin!)} ${params.join(' ')}`
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
          await this.startGroupServer(version).on(on)
          await waitTime(500)
          await initPassword()
          on(I18nT('fork.postgresqlInit', { dir: dataDir }))
          resolve(true)
        } catch (e) {
          await unlinkDirOnFail()
          reject(e)
        }

      } else {
        params.push('--standalone')
        process.chdir(dirname(bin!));
        command = `start /b ./${basename(bin!)} ${params.join(' ')}`
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
          // 'https://dev.mysql.com/get/Downloads/MySQL-5.6/mysql-5.6.51-winx64.zip',
          // 'https://dev.mysql.com/get/Downloads/MySQL-8.0/mysql-8.0.37-winx64.zip',
          // 'https://downloads.mysql.com/archives/get/p/23/file/mysql-8.2.0-winx64.zip',
          // 'https://downloads.mysql.com/archives/get/p/23/file/mysql-5.6.51-winx64.zip',
          // 'https://downloads.mysql.com/archives/get/p/23/file/mysql-5.5.62-winx64.zip',
          'https://dev.mysql.com/downloads/mysql/',
          'https://downloads.mysql.com/archives/community/'
        ]
        const fetchVersions = async (url: string) => {
          const all: any = []
          const res = await axios({
            url,
            method: 'get',
            proxy: this.getAxiosProxy()
          })
          const html = res.data
          const regSelect = /<select name="version"([\s\S\n]*?)<\/select>/g
          html.match(regSelect).forEach((select: string) => {
            const reg = /<option ([a-z="\d\.\s\n]+)>(\d[\d\.]+)([a-zA-Z\s\n]*?)<\/option>/g
            let r
            while ((r = reg.exec(select)) !== null) {
              const version = r[2]
              const mv = version.split('.').slice(0, 2).join('.')
              const u = `https://dev.mysql.com/get/Downloads/MySQL-${mv}/mysql-${version}-winx64.zip`
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
        list.filter((l: any) => Number(l.mVersion) > 5.6).forEach((l: any) => {
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
          const dir = join(global.Server.AppDir!, `mysql-${a.version}`, `mysql-${a.version}-winx64`, 'bin/mysqld.exe')
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
}
export default new Mysql()
