import { ChildProcess, fork } from 'child_process'
import { uuid } from '../utils'
import { ForkPromise } from '@shared/ForkPromise'

export class ForkManager {
  fork: ChildProcess
  callback: {
    [k: string]: {
      resolve: Function
      on: Function
    }
  }
  _on: Function = () => {}

  constructor(file: string) {
    this.callback = {}
    const child = fork(file)
    child.send({ Server })
    child.on('message', ({ on, key, info }: { on?: boolean; key: string; info: any }) => {
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
    })
    this.fork = child
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
      this.fork.send([thenKey, ...args])
    })
  }

  destory() {
    const pid = this.fork.pid
    this.fork.disconnect()
    try {
      if (pid) {
        process.kill(pid)
      }
    } catch (e) {}
  }
}
