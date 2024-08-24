import { join, dirname } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '../lang'
import type { SoftInstalled } from '@shared/app'
import { execPromise, spawnPromise, waitTime } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { chmod, copyFile, readFile, unlink, writeFile } from 'fs-extra'
import axios from 'axios'

class Manager extends Base {
  constructor() {
    super()
    this.type = 'postgresql'
  }

  init() {}

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
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
      } catch (e) {}
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
        const command = `${bin} -D ${dbPath} -l ${logFile} start`
        try {
          await execPromise(command, {
            env: {
              LC_ALL: global.Server.Local!,
              LANG: global.Server.Local!
            }
          })
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
        const binDir = dirname(bin)
        const initDB = join(binDir, 'initdb')
        const command = `${initDB} -D ${dbPath} -U root`
        try {
          await execPromise(command)
        } catch (e) {
          reject(e)
          return
        }
        await waitTime(1000)
        if (!existsSync(confFile)) {
          reject(new Error(`Data Dir ${dbPath} create faild`))
          return
        }
        const defaultConfFile = join(dbPath, 'postgresql.conf.default')
        await copyFile(confFile, defaultConfFile)
        sendUserPass = true
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
      content = content
        .replace(new RegExp('##PASSWORD##', 'g'), global.Server.Password!)
        .replace('##BIN_PATH##', dirname(version.bin))
        .replace('##BRANCH##', tag)
      await writeFile(copyfile, content)
      await chmod(copyfile, '0777')
      const params = [copyfile]
      try {
        spawnPromise('zsh', params).then(resolve).catch(reject)
      } catch (e) {
        reject(e)
      }
    })
  }
}

export default new Manager()
