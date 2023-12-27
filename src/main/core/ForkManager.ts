import { ChildProcess, fork } from 'child_process'
import { uuid } from '../utils'
import { ForkPromise } from '@shared/ForkPromise'

export class ForkManager {
  forks: Array<ChildProcess> = []
  callback: {
    [k: string]: {
      resolve: Function
      on: Function
    }
  }
  _on: Function = () => {}

  constructor(file: string) {
    this.callback = {}
    const arr = [0, 0, 0]
    const onMessage = ({ on, key, info }: { on?: boolean; key: string; info: any }) => {
      if (on) {
        this._on({ key, info })
        return
      }
      const fn = this.callback?.[key]
      console.log('message: ', key, info, fn, info?.code)
      if (fn) {
        if (info?.code === 0 || info?.code === 1) {
          fn.resolve(info)
          delete this.callback?.[key]
        } else if (info?.code === 200) {
          fn.on(info)
        }
      }
    }
    arr.forEach(() => {
      const child = fork(file)
      child.send({ Server })
      child.on('message', onMessage)
      this.forks.push(child)
    })
  }

  on(fn: Function) {
    this._on = fn
  }

  send(...args: any) {
    return new ForkPromise((resolve, reject, on) => {
      const thenKey = uuid()
      this.callback[thenKey] = {
        resolve,
        on
      }
      const fork = this.forks.shift()!
      fork.send([thenKey, ...args])
      this.forks.push(fork)
    })
  }

  destory() {
    try {
      this.forks.forEach((fork) => {
        const pid = fork.pid
        fork.disconnect()
        if (pid) {
          process.kill(pid)
        }
      })
    } catch (e) {}
  }
}
