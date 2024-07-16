import { join, dirname } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '../lang'
import type { SoftInstalled } from '@shared/app'
import { execPromise, waitTime } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { copyFile, unlink } from 'fs-extra'
class Manager extends Base {
  constructor() {
    super()
    this.type = 'postgresql'
  }

  init() {}

  async #handleLockFileRole() {
    try {
      let lsal: any = await execPromise(`ls -al`, {
        cwd: global.Server.BaseDir
      })
      lsal = lsal.stdout
        .split('\n')
        .filter((s: string) => s.includes('..'))
        .pop()
        .split(' ')
        .filter((s: string) => !!s.trim())
        .map((s: string) => s.trim())
      console.log('lsal: ', lsal)
      const user = lsal[2]
      const group = lsal[3]
      const command = `echo "${global.Server.Password}" | sudo -S chown -R ${user}:${group} /var/run/postgresql`    
      const res = await execPromise(command)
      console.log('handleLockFileRole: ', command, res)
    } catch(e) {
      console.log('handleLockFileRole err: ', e)
    }
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      await this.#handleLockFileRole()
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
}

export default new Manager()
