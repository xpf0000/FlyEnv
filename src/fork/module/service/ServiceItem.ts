import type { AppHost } from '@shared/app'
import { watch, existsSync, FSWatcher, readFile } from 'fs-extra'
import { ForkPromise } from '@shared/ForkPromise'
import { waitTime, execPromiseRoot } from '../../Fn'

export const getHostItemEnv = async (item: AppHost) => {
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

export class ServiceItem {
  host?: AppHost
  id: string = ''
  command: string = ''
  watchDir: string = ''
  checkTime = 15000
  exit = false
  watcher?: FSWatcher
  timer: any
  pidFile?: string
  constructor() {}
  async checkState(): Promise<string[]> {
    return []
  }
  start(item: AppHost): ForkPromise<any> {
    return new ForkPromise<boolean>((resolve) => resolve(!!item.id))
  }
  stop(exit = false) {
    return new ForkPromise(async (resolve) => {
      this.exit = exit
      this.timer && clearInterval(this.timer)
      this.timer = undefined
      this.watcher?.close()
      this.watcher = undefined

      const arr = await this.checkState()
      if (arr.length > 0) {
        const str = arr.map((s) => `/pid ${s}`).join(' ')
        try {
          await execPromiseRoot(`taskkill /f /t ${str}`)
        } catch (e) {}
      }
      if (this.pidFile && existsSync(this.pidFile)) {
        try {
          await execPromiseRoot(`del -Force ${this.pidFile}`)
        } catch (e) {}
      }
      resolve({
        'APP-Service-Stop-PID': arr
      })
    })
  }
  daemon() {
    this.timer && clearInterval(this.timer)
    this.timer = setInterval(() => {
      this.checkState()
        .then((res) => {
          if (res.length === 0) {
            return this.start(this.host!)
          }
          return Promise.resolve(true)
        })
        .then(() => {})
        .catch()
    }, this.checkTime)
  }
  watch() {
    this.watcher?.close()
    if (this.watchDir && existsSync(this.watchDir)) {
      this.watcher = watch(
        this.watchDir,
        {
          recursive: true
        },
        () => {
          try {
            this.start(this.host!)
              .then(() => {})
              .catch()
          } catch (e) {}
        }
      )
    }
  }
  checkPid() {
    return new Promise((resolve, reject) => {
      const doCheck = async (time: number) => {
        if (this.pidFile && existsSync(this.pidFile)) {
          const pid = (await readFile(this.pidFile, 'utf-8')).trim()
          resolve(pid)
        } else {
          if (time < 20) {
            await waitTime(1000)
            await doCheck(time + 1)
          } else {
            reject(new Error('pid file not found'))
          }
        }
      }
      doCheck(0).then().catch(reject)
    })
  }
}
