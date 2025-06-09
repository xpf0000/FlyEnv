import { ChildProcess, fork } from 'child_process'
import { uuid, appendFile } from '../utils'
import { ForkPromise } from '@shared/ForkPromise'
import { join } from 'path'
import { cpus } from 'os'

type CallBack = (...args: any) => void

class ForkItem {
  forkFile: string
  child: ChildProcess
  autodestroy: boolean
  destroyTimer?: NodeJS.Timeout
  taskFlag: Array<number> = []
  _on: CallBack = () => {}
  callback: {
    [k: string]: {
      resolve: CallBack
      on: CallBack
    }
  }
  waitdestroy() {
    if (this.autodestroy && this.taskFlag.length === 0) {
      this.destroyTimer = setTimeout(() => {
        if (this.taskFlag.length === 0) {
          this.destroy()
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
        this.waitdestroy()
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
    this.waitdestroy()
  }

  constructor(file: string, autodestroy: boolean) {
    this.forkFile = file
    this.autodestroy = autodestroy
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
      clearTimeout(this.destroyTimer)
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

  destroy() {
    try {
      const pid = this?.child?.pid
      if (this?.child?.connected) {
        this?.child?.disconnect?.()
      }
      if (pid) {
        process.kill(pid)
      }
    } catch {}
  }
}

export class ForkManager {
  file: string
  forks: Array<ForkItem> = []
  ftpFork?: ForkItem
  dnsFork?: ForkItem
  serviceFork?: ForkItem
  ollamaChatFork?: ForkItem

  _on: CallBack = () => {}

  constructor(file: string) {
    this.file = file
  }

  on(fn: CallBack) {
    this._on = fn
  }

  send(...args: any) {
    const param = [...args]
    const module = param.shift()
    if (module === 'service') {
      if (!this.serviceFork) {
        this.serviceFork = new ForkItem(this.file, false)
        this.serviceFork._on = this._on
      }
      return this.serviceFork!.send(...args)
    }
    if (module === 'pure-ftpd') {
      if (!this.ftpFork) {
        this.ftpFork = new ForkItem(this.file, false)
        this.ftpFork._on = this._on
      }
      return this.ftpFork!.send(...args)
    }
    if (module === 'dns') {
      if (!this.dnsFork) {
        this.dnsFork = new ForkItem(this.file, false)
        this.dnsFork._on = this._on
      }
      return this.dnsFork!.send(...args)
    }
    const fn = param.shift()
    if (module === 'ollama' && ['chat', 'stopOutput'].includes(fn)) {
      if (!this.ollamaChatFork) {
        this.ollamaChatFork = new ForkItem(this.file, true)
      }
      return this.ollamaChatFork!.send(...args)
    }
    /**
     * 找到没有任务的线程
     * 未找到, 小于CPU核心数, 新建一个线程, 执行完任务, 10秒后自动销毁, 等于CPU核心数, 从前往后轮询
     */
    let find = this.forks.find((p) => p.taskFlag.length === 0)
    if (!find) {
      if (this.forks.length < cpus().length) {
        find = new ForkItem(this.file, true)
        find._on = this._on
        this.forks.push(find)
      } else {
        find = this.forks.shift()!
        this.forks.push(find)
      }
    }
    return find.send(...args)
  }

  destroy() {
    this.serviceFork?.destroy()
    this.ftpFork?.destroy()
    this.dnsFork?.destroy()
    this.ollamaChatFork?.destroy()
    this.forks.forEach((fork) => {
      fork.destroy()
    })
  }
}
