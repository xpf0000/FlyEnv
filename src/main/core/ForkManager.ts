import { utilityProcess, UtilityProcess } from 'electron'
import { uuid, appendFile } from '../utils'
import { ForkPromise } from '@shared/ForkPromise'
import { join } from 'path'
import { cpus } from 'os'
// import { appDebugLog } from '@shared/utils'
import { fetchStopProcessListLocal } from '@shared/StopProcessList'
import { StopProcessListBridge } from './StopProcessListBridge'
import { StopProcessListCache } from './StopProcessListCache'
import { BinVersionCacheStore } from './BinVersionCacheStore'
import { ElectronStoreBinVersionCachePersistence } from './BinVersionCachePersistence'
import { BinVersionCacheBridge } from './BinVersionCacheBridge'

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
  onMessage(child: UtilityProcess, message: any) {
    if (
      this.stopProcessListBridge.handle(message, (response) => {
        try {
          child.postMessage(response)
        } catch {}
      })
    ) {
      return
    }
    if (
      this.binVersionCacheBridge.handle(message, (response) => {
        try {
          child.postMessage(response)
        } catch {}
      })
    ) {
      return
    }
    const { on, key, info } = message ?? {}
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

  constructor(
    file: string,
    autoDestroy: boolean,
    private readonly stopProcessListBridge: StopProcessListBridge,
    private readonly binVersionCacheBridge: BinVersionCacheBridge
  ) {
    this.forkFile = file
    this.autoDestroy = autoDestroy
    this.callback = {}

    this.onError = this.onError.bind(this)
    this.onExit = this.onExit.bind(this)
    this.onSpawn = this.onSpawn.bind(this)

    this.loading = true
    const child = utilityProcess.fork(file)
    child.postMessage({ Server: JSON.parse(JSON.stringify(Server)) })
    this.attachChild(child)
    this.child = child
  }

  private attachChild(child: UtilityProcess) {
    child.on('message', (message) => this.onMessage(child, message))
    child.on('error', this.onError)
    child.on('exit', this.onExit)
    child.on('spawn', this.onSpawn)
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
        this.attachChild(child)
        console.log('this.isChildDisabled pid: ', child.pid)
      } else {
        console.log('!!!! this.isChildDisabled Not')
      }
      child.postMessage({ Server: JSON.parse(JSON.stringify(Server)) })
      child.postMessage([thenKey, ...args])
      this.child = child
    })
  }

  destroy() {
    this.childExited = true
    try {
      this.child?.kill()
    } catch {}
    try {
      const pid = this?.child?.pid || this.pid
      if (pid) {
        process.kill(pid)
      }
    } catch {}
  }
}

export class ForkManager {
  file: string
  forks: Array<ForkItem> = []
  ftpsrvFork?: ForkItem
  dnsFork?: ForkItem
  ollamaChatFork?: ForkItem

  _on: Callback = () => {}
  private readonly stopProcessListCache = new StopProcessListCache(fetchStopProcessListLocal, {
    ttlMs: 650,
    onEvent: (event) => {
      console.log('[StopProcessListCache]: ', event)
      // appDebugLog('[StopProcessListCache]', JSON.stringify(event)).catch()
    }
  })
  private readonly stopProcessListBridge = new StopProcessListBridge(this.stopProcessListCache)
  private readonly binVersionCacheStore = new BinVersionCacheStore(
    new ElectronStoreBinVersionCachePersistence(),
    {
      debounceMs: 2_000,
      onEvent: (event) => {
        console.log('[BinVersionCache]: ', event)
        // appDebugLog('[BinVersionCache]', JSON.stringify(event)).catch()
      }
    }
  )
  private readonly binVersionCacheBridge = new BinVersionCacheBridge(this.binVersionCacheStore)

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
        this.ftpsrvFork = new ForkItem(
          this.file,
          false,
          this.stopProcessListBridge,
          this.binVersionCacheBridge
        )
        this.ftpsrvFork._on = this._on
      }
      return this.ftpsrvFork!.send(...args)
    }
    if (module === 'dns') {
      if (!this.dnsFork) {
        this.dnsFork = new ForkItem(
          this.file,
          false,
          this.stopProcessListBridge,
          this.binVersionCacheBridge
        )
        this.dnsFork._on = this._on
      }
      return this.dnsFork!.send(...args)
    }
    const fn = param.shift()
    if (module === 'ollama' && ['chat', 'stopOutput'].includes(fn)) {
      if (!this.ollamaChatFork) {
        this.ollamaChatFork = new ForkItem(
          this.file,
          true,
          this.stopProcessListBridge,
          this.binVersionCacheBridge
        )
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
        find = new ForkItem(
          this.file,
          this.forks.length > 0,
          this.stopProcessListBridge,
          this.binVersionCacheBridge
        )
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

  async destroy() {
    await this.binVersionCacheStore.flush()
    this?.dnsFork?.destroy()
    this?.ftpsrvFork?.destroy()
    this?.ollamaChatFork?.destroy()
    this.forks.forEach((fork) => {
      fork.destroy()
    })
  }
}
