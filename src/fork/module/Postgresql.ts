import { join, dirname } from 'path'
import { copyFileSync, existsSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '../lang'
import type { SoftInstalled } from '@shared/app'
import { execPromise, waitTime } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
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
      const checkpid = (time = 0) => {
        if (existsSync(pidFile)) {
          if (sendUserPass) {
            on(I18nT('fork.postgresqlInit', { dir: dbPath }))
          }
          resolve(true)
        } else {
          if (time < 40) {
            setTimeout(() => {
              checkpid(time + 1)
            }, 500)
          } else {
            reject(new Error('Start Failed'))
          }
        }
      }
      const doRun = async () => {
        const command = `${bin} -D ${dbPath} -l ${logFile} start`
        try {
          await execPromise(command)
        } catch (e) {
          reject(e)
          return
        }
        await waitTime(1000)
        checkpid()
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
        copyFileSync(confFile, defaultConfFile)
        sendUserPass = true
        await doRun()
      } else {
        reject(new Error(`Data Dir ${dbPath} has exists, but conf file not found in dir`))
      }
    })
  }

  _stopServer(version: SoftInstalled) {
    console.log(version)
    return new ForkPromise(async (resolve) => {
      const command = `ps aux | grep 'postgresql' | awk '{print $2,$11,$12,$13}'`
      const res = await execPromise(command)
      const pids = res?.stdout?.toString()?.trim()?.split('\n') ?? []
      const arr: Array<string> = []
      for (const p of pids) {
        if (p.includes(global.Server.PostgreSqlDir!)) {
          arr.push(p.split(' ')[0])
        }
      }
      if (arr.length === 0) {
        resolve(true)
      } else {
        const pids = arr.join(' ')
        const sig = '-INT'
        try {
          await execPromise(`echo '${global.Server.Password}' | sudo -S kill ${sig} ${pids}`)
        } catch (e) {}
        resolve(true)
      }
    })
  }
}

export default new Manager()
