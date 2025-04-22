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
  serviceFork?: ForkItem
  _on: Function = () => {}
  constructor(file: string) {
    this.file = file
  }

  on(fn: Function) {
    this._on = fn
  }

  send(...args: any) {
    if (args?.[0] === 'service') {
      if (!this.serviceFork) {
        this.serviceFork = new ForkItem(this.file, false)
      }
      return this.serviceFork!.send(...args)
    }
    /**
     * Find a thread with no tasks
     * If not found, and the number of threads is less than the number of CPU cores, create a new thread that will automatically destroy itself 10 seconds after completing the task.
     * If the number of threads equals the number of CPU cores, poll from front to back.
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
    find._on = this._on
    return find.send(...args)
  }

  destory() {
    this.forks.forEach((fork) => {
      fork.destory()
    })
  }
}
