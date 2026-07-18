import type { UtilityProcess } from 'electron'
import { appendFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ForkPromise } from '@shared/ForkPromise'
import {
  isLanguageChangedAck,
  type LanguageChanged,
  type LanguageRuntimePayload
} from '@shared/LanguageProtocol'
import type { BinVersionCacheBridge } from './BinVersionCacheBridge'
import type { EnvSyncBridge } from './EnvSyncBridge'
import { ForkIdleLifecycle, type ForkIdleScheduler } from './ForkIdleLifecycle'
import type { StopProcessListBridge } from './StopProcessListBridge'

type Callback = (...args: any) => void

export type ForkItemOptions = {
  idleTimeoutMs: number
  primary: boolean
  idleScheduler?: ForkIdleScheduler
  forkProcess: (file: string) => UtilityProcess
  killProcess?: (pid: number) => void
}

type ForkItemCallback = {
  resolve: Callback
  on: Callback
  onTerminal?: (info: any) => void
}

function createRequestId(length = 32) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'
  let value = ''
  for (let index = 0; index < length; index += 1) {
    value += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return value
}

export class ForkItem {
  forkFile: string
  child: UtilityProcess
  childExited = false
  pid?: number
  loading = false
  _on: Callback = () => {}
  callback: Record<string, ForkItemCallback>
  readonly isPrimary: boolean
  private readonly lifecycle: ForkIdleLifecycle
  private readonly forkProcess: (file: string) => UtilityProcess
  private readonly killProcess: (pid: number) => void
  private readonly languageAcks = new Map<
    string,
    { resolve: (value: boolean) => void; timer: NodeJS.Timeout }
  >()

  constructor(
    file: string,
    options: ForkItemOptions,
    private readonly envSyncBridge: EnvSyncBridge,
    private readonly stopProcessListBridge: StopProcessListBridge,
    private readonly binVersionCacheBridge: BinVersionCacheBridge,
    private readonly languageSnapshotProvider: () => LanguageRuntimePayload | undefined
  ) {
    this.forkFile = file
    this.isPrimary = options.primary
    this.callback = {}
    this.forkProcess = options.forkProcess
    this.killProcess = options.killProcess ?? ((pid) => process.kill(pid))
    this.lifecycle = new ForkIdleLifecycle(
      options.idleTimeoutMs,
      () => this.destroyChild(),
      options.idleScheduler
    )

    this.loading = true
    const child = this.forkProcess(file)
    this.child = child
    this.postInitialization(child)
    this.attachChild(child)
  }

  get activeTaskCount() {
    return this.lifecycle.activeTaskCount
  }

  get isPinned() {
    return this.lifecycle.isPinned
  }

  pin() {
    this.lifecycle.pin()
  }

  unpin() {
    this.lifecycle.unpin()
  }

  onMessage(child: UtilityProcess, message: any) {
    if (isLanguageChangedAck(message)) {
      const pending = this.languageAcks.get(message.requestId)
      if (pending) {
        clearTimeout(pending.timer)
        this.languageAcks.delete(message.requestId)
        pending.resolve(true)
      }
      return
    }
    if (
      this.envSyncBridge.handle(message, (response) => {
        try {
          child.postMessage(response)
        } catch {}
      })
    ) {
      return
    }
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
    const fn = this.callback[key]
    if (!fn) return
    if (info?.code === 0 || info?.code === 1) {
      try {
        fn.onTerminal?.(info)
      } catch {}
      fn.resolve(info)
      delete this.callback[key]
      this.lifecycle.taskSettled()
    } else if (info?.code === 200) {
      fn.on(info)
    }
  }

  send(...args: any[]) {
    return this.dispatch(undefined, args)
  }

  sendWithTerminalHook(onTerminal: (info: any) => void, ...args: any[]) {
    return this.dispatch(onTerminal, args)
  }

  sendLanguage(message: LanguageChanged, timeoutMs = 1_000) {
    if (this.childExited) return Promise.resolve(false)
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.languageAcks.delete(message.requestId)
        resolve(false)
      }, timeoutMs)
      this.languageAcks.set(message.requestId, { resolve, timer })
      try {
        this.child.postMessage(message)
      } catch {
        clearTimeout(timer)
        this.languageAcks.delete(message.requestId)
        resolve(false)
      }
    })
  }

  isChildDisabled() {
    if (this.loading) return false
    return this.childExited || !this.pid
  }

  destroy() {
    this.lifecycle.dispose()
    this.destroyChild()
  }

  private dispatch(onTerminal: ((info: any) => void) | undefined, args: any[]) {
    return new ForkPromise((resolve, reject, on) => {
      this.lifecycle.taskStarted()
      const thenKey = createRequestId()
      this.callback[thenKey] = { resolve, on, onTerminal }
      try {
        let child = this.child
        if (this.isChildDisabled()) {
          this.loading = true
          child = this.forkProcess(this.forkFile)
          this.childExited = false
          this.child = child
          this.attachChild(child)
        }
        this.postInitialization(child)
        child.postMessage([thenKey, ...args])
      } catch (error) {
        delete this.callback[thenKey]
        this.lifecycle.taskSettled()
        reject(error)
      }
    })
  }

  private postInitialization(child: UtilityProcess) {
    child.postMessage({
      Server: JSON.parse(JSON.stringify(Server)),
      Language: this.languageSnapshotProvider()
    })
  }

  private attachChild(child: UtilityProcess) {
    child.on('message', (message) => this.onMessage(child, message))
    child.on('error', (type, location, report) => this.onError(child, type, location, report))
    child.on('exit', () => this.onExit(child))
    child.on('spawn', () => this.onSpawn(child))
  }

  private onError(child: UtilityProcess, type: string, location: string, report: string) {
    if (child !== this.child) return
    this.loading = false
    const error = JSON.stringify({ type, location, report })
    appendFile(join(global.Server.BaseDir!, 'fork.error.txt'), `\n${error}`).catch(() => {})
    for (const key of Object.keys(this.callback)) {
      this.callback[key]?.resolve({ code: 1, msg: error })
      delete this.callback[key]
    }
    this.lifecycle.childExited()
  }

  private onExit(child: UtilityProcess) {
    if (child !== this.child) return
    this.resolveLanguageAcks()
    this.childExited = true
    this.pid = undefined
    this.loading = false
    this.lifecycle.childExited()
  }

  private onSpawn(child: UtilityProcess) {
    if (child !== this.child) return
    this.childExited = false
    this.pid = child.pid
    this.loading = false
    console.log('onSpawn: ', this.pid)
  }

  private resolveLanguageAcks() {
    for (const pending of this.languageAcks.values()) {
      clearTimeout(pending.timer)
      pending.resolve(false)
    }
    this.languageAcks.clear()
  }

  private destroyChild() {
    if (this.childExited) return
    const child = this.child
    this.resolveLanguageAcks()
    this.childExited = true
    this.lifecycle.childExited()
    try {
      child?.kill()
    } catch {}
    try {
      const pid = child?.pid || this.pid
      if (pid) this.killProcess(pid)
    } catch {}
    this.pid = undefined
    this.loading = false
  }
}
