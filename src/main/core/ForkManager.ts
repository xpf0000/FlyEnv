import { utilityProcess, UtilityProcess } from 'electron'
import { uuid, appendFile } from '../utils'
import { ForkPromise } from '@shared/ForkPromise'
import { join } from 'path'
import { cpus } from 'os'

type Callback = (...args: any) => void

const CupCount = cpus().length

class ForkItem {
  forkFile: string
  child: UtilityProcess
  autoDestroy: boolean
  destroyTimer?: NodeJS.Timeout
  childExited: boolean = false
  pid?: number = undefined
  loading: boolean = false
  taskFlag: Array<number> = []
  _on: Callback = () => {}
  callback: {
    [k: string]: {
      resolve: Callback
      on: Callback
    }
  }
  waitDestroy() {
    if (this.autoDestroy && this.taskFlag.length === 0) {
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
        this.waitDestroy()
      } else if (info?.code === 200) {
        fn.on(info)
      }
    }
  }
  onError(type: string, location: string, report: string) {
    this.loading = false
    const error = JSON.stringify({
      type,
      location,
      report
    })
    appendFile(join(global.Server.BaseDir!, 'fork.error.txt'), `\n${error}`).then()
    for (const k in this.callback) {
      const fn = this.callback?.[k]
      if (fn) {
        fn.resolve({
          code: 1,
          msg: error
        })
      }
      delete this.callback?.[k]
    }
    this.taskFlag.pop()
    this.waitDestroy()
  }

  onExit() {
    this.childExited = true
    this.pid = undefined
    this.loading = false
  }

  onSpawn() {
    this.childExited = false
    this.pid = this?.child?.pid
    this.loading = false
    console.log('onSpawn: ', this.pid)
  }

  constructor(file: string, autoDestroy: boolean) {
    this.forkFile = file
    this.autoDestroy = autoDestroy
    this.callback = {}

    this.onMessage = this.onMessage.bind(this)
    this.onError = this.onError.bind(this)
    this.onExit = this.onExit.bind(this)
    this.onSpawn = this.onSpawn.bind(this)

    this.loading = true
    const child = utilityProcess.fork(file)
    child.postMessage({ Server })
    child.on('message', this.onMessage)
    child.on('error', this.onError)
    child.on('exit', this.onExit)
    child.on('spawn', this.onSpawn)
    this.child = child
  }

  isChildDisabled() {
    if (this.loading) {
      return false
    }
    return this?.childExited || !this?.pid
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
        console.log('this.isChildDisabled !!!!', this.childExited, this?.pid)
        this.loading = true
        child = utilityProcess.fork(this.forkFile)
        child.on('message', this.onMessage)
        child.on('error', this.onError)
        child.on('exit', this.onExit)
        child.on('spawn', this.onSpawn)
        console.log('this.isChildDisabled pid: ', child.pid)
      } else {
        console.log('!!!! this.isChildDisabled Not')
      }
      child.postMessage({ Server })
      child.postMessage([thenKey, ...args])
      this.child = child
    })
  }

  destroy() {
    try {
      this.child?.kill()
    } catch {}
    try {
      const pid = this?.child?.pid || this.pid
      if (pid) {
        process.kill(pid)
      }
    } catch {}
    this.childExited = true
  }
}

export class ForkManager {
  file: string
  forks: Array<ForkItem> = []
  ftpsrvFork?: ForkItem
  dnsFork?: ForkItem
  serviceFork?: ForkItem
  ollamaChatFork?: ForkItem

  _on: Callback = () => {}
  constructor(file: string) {
    this.file = file
  }

  on(fn: Callback) {
    this._on = fn
  }

  send(...args: any) {
    const param = [...args]
    const module = param.shift()
    if (module === 'ftp-srv') {
      if (!this.ftpsrvFork) {
        this.ftpsrvFork = new ForkItem(this.file, false)
        this.ftpsrvFork._on = this._on
      }
      return this.ftpsrvFork!.send(...args)
    }
    if (module === 'dns') {
      if (!this.dnsFork) {
        this.dnsFork = new ForkItem(this.file, false)
        this.dnsFork._on = this._on
      }
      return this.dnsFork!.send(...args)
    }
    if (module === 'service') {
      if (!this.serviceFork) {
        this.serviceFork = new ForkItem(this.file, false)
      }
      return this.serviceFork!.send(...args)
    }
    const fn = param.shift()
    if (module === 'ollama' && ['chat', 'stopOutput'].includes(fn)) {
      if (!this.ollamaChatFork) {
        this.ollamaChatFork = new ForkItem(this.file, true)
      }
      return this.ollamaChatFork!.send(...args)
    }
    /**
     * Find a thread with no tasks
     * If not found, and the number of threads is less than the number of CPU cores, create a new thread that will automatically destroy itself 10 seconds after completing the task.
     * If the number of threads equals the number of CPU cores, poll from front to back.
     */
    let find = this.forks.find((p) => p.taskFlag.length === 0 && !p.autoDestroy)
    if (!find) {
      find = this.forks.find((p) => p.taskFlag.length === 0)
    }
    if (find) {
      console.log('fork find: ', this.forks.indexOf(find), find.autoDestroy)
    }
    if (!find) {
      const forksCount = this.forks.length
      console.log('forksCount: ', forksCount, CupCount)
      if (forksCount < CupCount) {
        find = new ForkItem(this.file, this.forks.length > 0)
        // find = new ForkItem(this.file, true)
        this.forks.push(find)
      } else {
        find = this.forks.shift()!
        this.forks.push(find)
      }
    }
    find._on = this._on
    return find.send(...args)
  }

  destroy() {
    this?.serviceFork?.destroy()
    this?.ollamaChatFork?.destroy()
    this.forks.forEach((fork) => {
      fork.destroy()
    })
  }
}
