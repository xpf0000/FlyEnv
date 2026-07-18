import { utilityProcess } from 'electron'
import { cpus } from 'os'
import { fetchStopProcessListLocal } from '@shared/StopProcessList'
import EnvSync from '@shared/EnvSync'
import { fetchEnvSyncLocal } from '@shared/EnvSyncLocal'
import type { EnvSyncInvalidated } from '@shared/EnvSyncProtocol'
import type { LanguageChanged, LanguageRuntimePayload } from '@shared/LanguageProtocol'
import { BinVersionCacheBridge } from './BinVersionCacheBridge'
import { ElectronStoreBinVersionCachePersistence } from './BinVersionCachePersistence'
import { BinVersionCacheStore } from './BinVersionCacheStore'
import { EnvSyncBridge } from './EnvSyncBridge'
import { EnvSyncCoordinator } from './EnvSyncCoordinator'
import { PRIMARY_FORK_IDLE_TIMEOUT_MS, TRANSIENT_FORK_IDLE_TIMEOUT_MS } from './ForkIdleLifecycle'
import { ForkItem } from './ForkItem'
import { StopProcessListBridge } from './StopProcessListBridge'
import { StopProcessListCache } from './StopProcessListCache'

export { ForkItem } from './ForkItem'

type Callback = (...args: any) => void

const CupCount = cpus().length

export class ForkManager {
  file: string
  forks: Array<ForkItem> = []
  ftpsrvFork?: ForkItem
  dnsFork?: ForkItem
  ollamaChatFork?: ForkItem

  _on: Callback = () => {}
  private readonly envSyncCoordinator = new EnvSyncCoordinator(fetchEnvSyncLocal, {
    ttlMs: 300_000,
    onEvent: (event) => {
      console.log('[EnvSyncCoordinator]: ', event)
    }
  })
  private readonly envSyncBridge = new EnvSyncBridge(this.envSyncCoordinator)
  private readonly unsubscribeEnvSync = this.envSyncCoordinator.subscribe((revision) => {
    EnvSync.clearLocal(revision)
    this.broadcastEnvSyncInvalidated(revision)
  })
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
  private languageSnapshotProvider?: () => LanguageRuntimePayload

  constructor(file: string) {
    this.file = file
    EnvSync.setProvider(this.envSyncCoordinator)
  }

  setLanguageSnapshotProvider(provider: () => LanguageRuntimePayload) {
    this.languageSnapshotProvider = provider
  }

  private createForkItem(idleTimeoutMs: number, primary = false) {
    return new ForkItem(
      this.file,
      {
        idleTimeoutMs,
        primary,
        forkProcess: (forkFile) => utilityProcess.fork(forkFile)
      },
      this.envSyncBridge,
      this.stopProcessListBridge,
      this.binVersionCacheBridge,
      () => this.languageSnapshotProvider?.()
    )
  }

  private broadcastEnvSyncInvalidated(revision: number) {
    const message: EnvSyncInvalidated = { type: 'env-sync-invalidated', revision }
    const forks = new Set(
      [this.ftpsrvFork, this.dnsFork, this.ollamaChatFork, ...this.forks].filter(
        (item): item is ForkItem => !!item
      )
    )
    for (const fork of forks) {
      if (fork.childExited) continue
      try {
        fork.child.postMessage(message)
      } catch {}
    }
  }

  on(fn: Callback) {
    this._on = fn
  }

  send(...args: any[]) {
    const param = [...args]
    const module = param.shift()
    if (module === 'ftp-srv') {
      if (!this.ftpsrvFork) {
        this.ftpsrvFork = this.createForkItem(TRANSIENT_FORK_IDLE_TIMEOUT_MS)
        this.ftpsrvFork._on = this._on
      }
      return this.ftpsrvFork.send(...args)
    }
    if (module === 'dns') {
      if (!this.dnsFork) {
        this.dnsFork = this.createForkItem(TRANSIENT_FORK_IDLE_TIMEOUT_MS)
        this.dnsFork._on = this._on
      }
      return this.dnsFork.send(...args)
    }
    const fn = param.shift()
    if (module === 'ollama' && ['chat', 'stopOutput'].includes(fn)) {
      if (!this.ollamaChatFork) {
        this.ollamaChatFork = this.createForkItem(TRANSIENT_FORK_IDLE_TIMEOUT_MS)
      }
      return this.ollamaChatFork.send(...args)
    }
    /**
     * Find a thread with no tasks.
     * The first generic item is always the three-minute primary. Every additional generic item
     * is reclaimed ten seconds after becoming idle.
     */
    let find = this.forks.find((item) => item.activeTaskCount === 0 && item.isPrimary)
    if (!find) find = this.forks.find((item) => item.activeTaskCount === 0)
    if (find) {
      console.log('fork find: ', this.forks.indexOf(find), find.isPrimary)
    }
    if (!find) {
      const forksCount = this.forks.length
      console.log('forksCount: ', forksCount, CupCount)
      if (forksCount < CupCount) {
        const primary = this.forks.length === 0
        find = this.createForkItem(
          primary ? PRIMARY_FORK_IDLE_TIMEOUT_MS : TRANSIENT_FORK_IDLE_TIMEOUT_MS,
          primary
        )
        this.forks.push(find)
      } else {
        find = this.forks.shift()!
        this.forks.push(find)
      }
    }
    find._on = this._on
    return find.send(...args)
  }

  async broadcastLanguage(message: LanguageChanged) {
    const forks = new Set(
      [this.ftpsrvFork, this.dnsFork, this.ollamaChatFork, ...this.forks].filter(
        (item): item is ForkItem => !!item && !item.childExited
      )
    )
    return Promise.all([...forks].map((fork) => fork.sendLanguage(message)))
  }

  async destroy() {
    await this.binVersionCacheStore.flush()
    this.unsubscribeEnvSync()
    EnvSync.setProvider(undefined)
    this.dnsFork?.destroy()
    this.ftpsrvFork?.destroy()
    this.ollamaChatFork?.destroy()
    this.forks.forEach((fork) => {
      fork.destroy()
    })
  }
}
