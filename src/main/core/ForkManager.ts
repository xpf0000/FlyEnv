import { ChildProcess, fork } from 'child_process'
import { uuid } from '../utils'
import { ForkPromise } from '@shared/ForkPromise'
import { appendFile } from 'fs-extra'
import { join } from 'path'
import { cpus } from 'os'

class ForkItem {
  forkFile: string
  child: ChildProcess
  autoDestory: boolean
  destoryTimer?: NodeJS.Timeout
  taskFlag: Array<number> = []
  _on: Function = () => {}
  callback: {
    [k: string]: {
      resolve: Function
      on: Function
    }
  }
  waitDestory() {
    if (this.autoDestory && this.taskFlag.length === 0) {
      this.destoryTimer = setTimeout(() => {
        if (this.taskFlag.length === 0) {
          this.destory()
        }
      }, 10000)
    }
  }
  onMessage({ on, key, info }: { on?: boolean; key: string; info: any }) {
    if (on) {
      this._on({ key, info })
      return
    }
    const fn = this.callback?.[key]
    if (fn) {
      if (info?.code === 0 || info?.code === 1) {
        fn.resolve(info)
        delete this.callback?.[key]
        this.taskFlag.pop()
        this.waitDestory()
      } else if (info?.code === 200) {
        fn.on(info)
      }
    }
  }
  onError(err: Error) {
    appendFile(join(global.Server.BaseDir!, 'fork.error.txt'), `\n${err?.message}`).then()
    for (const k in this.callback) {
      const fn = this.callback?.[k]
      if (fn) {
        fn.resolve({
          code: 1,
          msg: err.toString()
        })
      }
      delete this.callback?.[k]
    }
    this.taskFlag.pop()
    this.waitDestory()
  }

  constructor(file: string, autoDestory: boolean) {
    this.forkFile = file
    this.autoDestory = autoDestory
    this.callback = {}
    this.onMessage = this.onMessage.bind(this)
    this.onError = this.onError.bind(this)
    const child = fork(file)
    child.send({ Server })
    child.on('message', this.onMessage)
    child.on('error', this.onError)
    this.child = child
  }

  isChildDisabled() {
    return this?.child?.killed || !this?.child?.connected || !this?.child?.channel
  }

  send(...args: any) {
    return new ForkPromise((resolve, reject, on) => {
      this.destoryTimer && clearTimeout(this.destoryTimer)
      this.taskFlag.push(1)
      const thenKey = uuid()
      this.callback[thenKey] = {
        resolve,
        on
      }
      let child = this.child
      if (this.isChildDisabled()) {
        child = fork(this.forkFile)
        child.on('message', this.onMessage)
        child.on('error', this.onError)
      }
      child.send({ Server })
      child.send([thenKey, ...args])
      this.child = child
    })
  }

  destory() {
    try {
      const pid = this?.child?.pid
      if (this?.child?.connected) {
        this?.child?.disconnect?.()
      }
      if (pid) {
        process.kill(pid)
      }
    } catch (e) {}
  }
}

export class ForkManager {
  file: string
  forks: Array<ForkItem> = []
  fenciFork?: ForkItem
  ftpFork?: ForkItem
  dnsFork?: ForkItem
  _on: Function = () => {}
  constructor(file: string) {
    this.file = file
  }

  on(fn: Function) {
    this._on = fn
  }

  send(...args: any) {
    if (args.includes('tools') && args.includes('wordSplit')) {
      if (!this.fenciFork) {
        this.fenciFork = new ForkItem(this.file, true)
      }
      return this.fenciFork!.send(...args)
    }
    if (args.includes('pure-ftpd')) {
      if (!this.ftpFork) {
        this.ftpFork = new ForkItem(this.file, false)
      }
      return this.ftpFork!.send(...args)
    }
    if (args.includes('dns')) {
      if (!this.dnsFork) {
        this.dnsFork = new ForkItem(this.file, false)
      }
      return this.dnsFork!.send(...args)
    }
    /**
     * 找到没有任务的线程
     * 未找到, 小于CPU核心数, 新建一个线程, 执行完任务, 10秒后自动销毁, 等于CPU核心数, 从前往后轮询
     */
    let find = this.forks.find((p) => p.taskFlag.length === 0)
    if (!find) {
      if (this.forks.length < cpus().length) {
        find = new ForkItem(this.file, true)
        this.forks.push(find)
      } else {
        find = this.forks.shift()!
        this.forks.push(find)
      }
    }
    return find.send(...args)
  }

  destory() {
    this.fenciFork && this.fenciFork.destory()
    this.ftpFork && this.ftpFork.destory()
    this.forks.forEach((fork) => {
      fork.destory()
    })
  }
}
