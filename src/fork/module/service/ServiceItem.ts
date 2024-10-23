import type { AppHost } from '@shared/app'
import { watch, existsSync, FSWatcher, readFile } from 'fs-extra'
import { execPromise, execPromiseRoot } from '@shared/Exec'
import { ForkPromise } from '@shared/ForkPromise'

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
  constructor() {}
  async checkState() {
    const command = `ps aux | grep 'PWSAPPID=${this.id}'`
    let res: any = null
    try {
      res = await execPromise(command)
    } catch (e) {}
    console.log('checkState: ', res?.stdout?.trim())
    const pids =
      res?.stdout
        ?.trim()
        ?.split('\n')
        ?.filter((v: string) => {
          return (
            !v.includes(` ps aux | grep `) &&
            !v.includes(` grep 'PWSAPPID=`) &&
            !v.includes(` grep "PWSAPPID=`) &&
            !v.includes(` grep PWSAPPID=`)
          )
        }) ?? []
    const arr: Array<string> = []
    for (const p of pids) {
      const parr = p.split(' ').filter((s: string) => {
        return s.trim().length > 0
      })
      parr.shift()
      const pid = parr.shift()
      const runstr = parr.slice(8).join(' ')
      console.log('pid: ', pid)
      console.log('runstr: ', runstr)
      arr.push(pid)
    }
    return arr
  }
  start(item: AppHost): ForkPromise<boolean> {
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
        try {
          await execPromiseRoot([`kill`, '-9', ...arr])
        } catch (e) {}
      }
      resolve(true)
    })
  }
  watch() {
    this.watcher?.close()
    this.timer && clearInterval(this.timer)
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
}
