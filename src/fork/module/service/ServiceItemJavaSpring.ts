import type { AppHost } from '@shared/app'
import { ForkPromise } from '@shared/ForkPromise'
import { join } from 'path'
import { existsSync, mkdirp, readFile, remove, writeFile } from 'fs-extra'
import { execPromise, waitTime } from '../../Fn'
import { I18nT } from '../../lang'
import { execPromiseRoot } from '@shared/Exec'
import { ServiceItem } from './ServiceItem'

export class ServiceItemJavaSpring extends ServiceItem {
  start(item: AppHost): ForkPromise<boolean> {
    return new ForkPromise<boolean>(async (resolve, reject) => {
      if (this.exit) {
        reject(new Error('Exit'))
        return
      }
      this.host = item
      await this.stop()
      const javaDir = join(global.Server.BaseDir!, 'java')
      await mkdirp(javaDir)
      const pid = join(javaDir, `${item.id}.pid`)
      const log = join(javaDir, `${item.id}.log`)
      if (existsSync(pid)) {
        await remove(pid)
      }
      const handleEnv = async () => {
        if (item?.envVarType === 'none') {
          return undefined
        }
        const getEnv = (content: string) => {
          const arr = content
            ?.split('\n')
            ?.filter((s) => !!s.trim())
            ?.map((s) => {
              const a = s.trim().split('=')
              const k = a.shift()
              const v = a.join('')
              if (k && v) {
                return {
                  k,
                  v
                }
              }
              return undefined
            })
            ?.filter((o) => !!o)
          return arr
        }
        let arr: any[] | undefined = undefined
        if (item?.envVarType === 'specify') {
          arr = getEnv(item?.envVar ?? '')
        } else if (item?.envVarType === 'file') {
          const file = item?.envFile ?? ''
          if (file && existsSync(file)) {
            const content = await readFile(file, 'utf-8')
            arr = getEnv(content)
          }
        }
        if (arr && arr.length > 0) {
          const env: any = {}
          arr.forEach((item) => {
            env[item.k] = item.v
          })
          return { env }
        }
        return undefined
      }
      const checkpid = async (time = 0) => {
        const pids = await this.checkState()
        console.log('pids: ', pids)
        if (pids.length > 0) {
          this.watch()
          resolve(true)
        } else {
          if (time < 20) {
            await waitTime(1000)
            await checkpid(time + 1)
          } else {
            reject(new Error(I18nT('fork.startFail')))
          }
        }
      }
      this.command = `nohup ${item?.startCommand} --PWSAPPFLAG=${global.Server.BaseDir!} --PWSAPPID=${this.id} &>> ${log} &`
      console.log('command: ', this.command)
      const sh = join(global.Server.Cache!, `service-${this.id}.sh`)
      await writeFile(sh, `#!/bin/zsh\n${this.command}\necho $! > ${pid}`)
      await execPromiseRoot([`chmod`, '777', sh])
      try {
        const opt = await handleEnv()
        const res = await execPromise(`zsh ${sh}`, opt)
        console.log('start res: ', res)
        await waitTime(1000)
        await checkpid()
      } catch (e) {
        console.log('start e: ', e)
        reject(e)
      }
    })
  }
}
