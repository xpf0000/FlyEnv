import { ChildProcess, fork } from 'child_process'
import { uuid } from '../utils'
import { ForkPromise } from '@shared/ForkPromise'
import { cpus } from 'os'
import { appendFile } from 'fs-extra'
import { join } from 'path'

export class ForkManager {
  forkFile: string
  forks: Array<ChildProcess> = []
  callback: {
    [k: string]: {
      resolve: Function
      on: Function
    }
  }
  _on: Function = () => {}

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
    appendFile(join(global.Server.BaseDir!, 'fork.error.txt'), err?.message).then()
  }

  constructor(file: string) {
    this.forkFile = file
    this.onMessage = this.onMessage.bind(this)
    this.onError = this.onError.bind(this)
    this.callback = {}
    const cpuNun = Math.max(cpus().length, 3)
    console.log('cpuNun: ', cpuNun)
    for (let i = 0; i < cpuNun; i += 1) {
      const child = fork(file)
      child.send({ Server })
      child.on('message', this.onMessage)
      child.on('error', this.onError)
      this.forks.push(child)
    }
  }

  on(fn: Function) {
    this._on = fn
  }

  send(...args: any) {
    console.log('fork send: ', ...args)
    return new ForkPromise((resolve, reject, on) => {
      const thenKey = uuid()
      this.callback[thenKey] = {
        resolve,
        on
      }
      let child = this.forks.shift()!
      console.log('child.killed: ', child.killed)
      console.log('child.connected: ', child.connected)
      console.log('child.channel: ', child.channel)
      if (child.killed || !child.connected || !child?.channel) {
        child = fork(this.forkFile)
        child.on('message', this.onMessage)
        child.on('error', this.onError)
      }
      child.send({ Server })
      child.send([thenKey, ...args])
      this.forks.push(child)
    })
  }

  destory() {
    this.forks.forEach((fork) => {
      try {
        const pid = fork.pid
        if (fork.connected) {
          fork.disconnect()
        }
        if (pid) {
          process.kill(pid)
        }
      } catch (e) {}
    })
  }
}
