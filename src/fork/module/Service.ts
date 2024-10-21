import { Base } from './Base'
import { join } from 'path'
import { watch, FSWatcher, existsSync, mkdirp, remove, writeFile } from 'fs-extra'
import { execPromise, execPromiseRoot } from '@shared/Exec'
import { ForkPromise } from '@shared/ForkPromise'
import type { AppHost } from '@shared/app'
import { waitTime } from '../Fn'
import { I18nT } from '../lang'

class ServiceItem {
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
  stop() {
    return new ForkPromise(async (resolve) => {
      this.exit = true
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

class ServiceItemJavaSpring extends ServiceItem {
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
        const res = await execPromise(`zsh ${sh}`)
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

class Service extends Base {
  all: Record<string, ServiceItem> = {}
  start(host: AppHost) {
    return new ForkPromise(async (resolve, reject) => {
      if (this.all[`${host.id}`]) {
        const task = this.all[`${host.id}`]
        await task.stop()
      }
      if (host?.subType === 'springboot') {
        const item = new ServiceItemJavaSpring()
        item.id = `${host.id}`
        item.watchDir = host.root
        item.start(host).then(resolve).catch(reject)
        this.all[`${host.id}`] = item
      }
    })
  }
  stop(host: AppHost) {
    return new ForkPromise(async (resolve, reject) => {
      const task = this.all[`${host.id}`]
      if (task) {
        task
          .stop()
          .then(resolve)
          .catch(reject)
          .finally(() => {
            delete this.all?.[`${host.id}`]
          })
      } else {
        reject(new Error('No Task'))
      }
    })
  }
}

export default new Service()
