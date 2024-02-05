import { ChildProcess, fork } from 'child_process'
import { uuid } from '../utils'
import { ForkPromise } from '@shared/ForkPromise'
import { cpus } from 'os'
import { appendFile } from 'fs-extra'
import { join } from 'path'

class ForkItem {
  forkFile: string
  child: ChildProcess
  _on: Function = () => {}
  callback: {
    [k: string]: {
      resolve: Function
      on: Function
    }
  }
  onMessage({ on, key, info }: { on?: boolean; key: string; info: any }) {
    console.log('fork message: ', info)
    if (on) {
      this._on({ key, info })
      return
    }
    const fn = this.callback?.[key]
    if (fn) {
      if (info?.code === 0 || info?.code === 1) {
        fn.resolve(info)
        delete this.callback?.[key]
      } else if (info?.code === 200) {
        fn.on(info)
      }
    }
  }
  onError(err: Error) {
    console.log('fork child error: ', err)
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
  }

  constructor(file: string) {
    this.forkFile = file
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
    console.log('fork send: ', ...args)
    return new ForkPromise((resolve, reject, on) => {
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
  forks: Array<ForkItem> = []
  fenciFork?: ForkItem
  _on: Function = () => {}
  constructor(file: string) {
    /**
     * 开启子线程 最小3个 最大7个 加上分词线程 最终子线程数 4-8个
     */
    const cpuNun = Math.min(Math.max(cpus().length, 3), 7)
    /**
     * 分词单开一条线程
     */
    this.fenciFork = new ForkItem(file)
    for (let i = 0; i < cpuNun; i += 1) {
      const child = new ForkItem(file)
      this.forks.push(child)
    }
  }

  on(fn: Function) {
    this._on = fn
  }

  send(...args: any) {
    if (args.includes('tools') && args.includes('wordSplit')) {
      return this.fenciFork!.send(...args)
    }
    const child = this.forks.shift()!
    this.forks.push(child)
    return child.send(...args)
  }

  destory() {
    this.forks.forEach((fork) => {
      fork.destory()
    })
  }
}
