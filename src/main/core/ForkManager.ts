import { ChildProcess, fork } from 'child_process'
import { uuid } from '../utils'

export class ForkManager {
  fork: ChildProcess
  callback: { [k: string]: Function }
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
      if (fn) {
        fn(info)
        delete this.callback?.[key]
      }
    })
    this.fork = child
  }

  on(fn: Function) {
    this._on = fn
  }

  send(...args: any) {
    return new Promise((resolve) => {
      const thenKey = uuid()
      this.callback[thenKey] = resolve
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
