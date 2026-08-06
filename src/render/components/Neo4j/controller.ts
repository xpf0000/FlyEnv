import { ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { I18nT } from '@lang/index'
import type { SoftInstalled } from '@/store/brew'
import { BrewStore } from '@/store/brew'
import { MessageError } from '@/util/Element'
import { shell } from '@/util/NodeFn'
import IPC from '@/util/IPC'
import { Neo4jManager } from './store'

type OperationKind = 'start' | 'stop' | 'restart'

/**
 * Owns Neo4j service operations independently of the mounted page.
 * ServiceManager can call these methods through its Neo4j bridge and a page
 * re-entry never leaves an IPC listener or loading flag behind.
 */
export class Neo4jController {
  readonly opening = ref(false)
  readonly operation = ref<OperationKind | null>(null)
  private activeKey = ''
  private activePromise: Promise<string | boolean> | undefined

  start = (item: SoftInstalled) => this.run('start', item, () => this.startInternal(item))

  stop = (item: SoftInstalled) => {
    if (!item?.run && !item?.running) return Promise.resolve(true)
    return this.run('stop', item, () => this.stopInternal(item))
  }

  restart = (item: SoftInstalled) =>
    this.run('restart', item, async () => {
      const stopped = await this.stopInternal(item)
      if (stopped !== true) return stopped
      return this.startInternal(item)
    })

  async openBrowser(item?: SoftInstalled, port = 7474) {
    if (this.opening.value) return false
    const running =
      item ??
      BrewStore()
        .module('neo4j')
        .installed.find((version) => version.run)
    if (!running) {
      MessageError('Neo4j is not running')
      return false
    }
    this.opening.value = true
    try {
      const response = await this.invoke('portinfo', JSON.parse(JSON.stringify(running)))
      const browserPort =
        Number(response?.data?.http ?? (running as any).neo4jHttpPort ?? port) || 7474
      await shell.openExternal(`http://127.0.0.1:${browserPort}`)
      return true
    } finally {
      this.opening.value = false
    }
  }

  private run(
    kind: OperationKind,
    item: SoftInstalled,
    operation: () => Promise<string | boolean>
  ) {
    const key = `${kind}:${item?.bin ?? item?.path ?? item?.version ?? 'neo4j'}`
    if (this.activePromise) {
      if (this.activeKey === key) return this.activePromise
      return Promise.reject(new Error('Another Neo4j operation is already running'))
    }
    this.activeKey = key
    this.operation.value = kind
    this.opening.value = true
    const promise = Promise.resolve()
      .then(operation)
      .catch((error) => (error instanceof Error ? error.message : `${error}`))
      .finally(() => {
        this.activePromise = undefined
        this.activeKey = ''
        this.operation.value = null
        this.opening.value = false
      })
    this.activePromise = promise
    return promise
  }

  private async startInternal(item: SoftInstalled): Promise<string | boolean> {
    if (!item?.version || !item?.path) return 'Neo4j version is not selected'
    if (item.enable === false) return item.error ?? 'Neo4j version is unsupported'
    if (item.run && item.pid) return true
    const [runtime] = await Neo4jManager.startParams(item)
    const password = await this.initialPassword(item)
    if (password === null) return 'Neo4j startup cancelled'
    if ((item as any)._onStart) {
      await (item as any)._onStart(item)
    }

    item.running = true
    const requestData = JSON.parse(JSON.stringify(item))
    delete requestData.password
    delete requestData.rootPassword
    const request = Object.freeze(requestData)
    const result = await this.invoke(
      'startService',
      request,
      password ? { ...runtime, password } : runtime
    )
    if (result?.code === 0) {
      item.pid = result?.data?.['APP-Service-Start-PID'] ?? ''
      const snapshot = result?.data?.['APP-Service-Start-Item']
      if (snapshot) {
        item.javaHome = snapshot.javaHome
        item.javaMajor = snapshot.javaMajor
        item.neo4jInstanceDir = snapshot.neo4jInstanceDir
      }
      item.run = true
      item.running = false
      item.neo4jNeedsPassword = false
      return true
    }
    item.run = false
    item.running = false
    return result?.msg ?? 'Neo4j failed to start'
  }

  private async initialPassword(item: SoftInstalled): Promise<string | null | undefined> {
    if (!(item as any).neo4jNeedsPassword) return undefined
    try {
      const result = await ElMessageBox.prompt(I18nT('base.inputPassword'), 'Neo4j', {
        inputType: 'password',
        showCancelButton: true,
        closeOnClickModal: false,
        closeOnPressEscape: false
      })
      return result.value?.trim() || null
    } catch {
      return null
    }
  }

  private async stopInternal(item: SoftInstalled): Promise<string | boolean> {
    if (!item?.run && !item?.running) return true
    const [runtime] = await this.runtimeForStop(item)
    item.running = true
    item.run = false
    const requestData = JSON.parse(JSON.stringify(item))
    delete requestData.password
    delete requestData.rootPassword
    const request = Object.freeze(requestData)
    const result = await this.invoke('stopService', request, runtime)
    item.running = false
    if (result?.code === 0) {
      item.pid = ''
      return true
    }
    item.run = true
    return result?.msg ?? 'Neo4j failed to stop'
  }

  private async runtimeForStop(item: SoftInstalled) {
    try {
      return await Neo4jManager.startParams(item)
    } catch {
      if (item.javaHome) {
        return [
          {
            javaHome: item.javaHome,
            neo4jInstanceDir: item.neo4jInstanceDir
          }
        ] as [{ javaHome: string; neo4jInstanceDir?: string }]
      }
      throw new Error('Neo4j Java runtime is unavailable; select Java before stopping')
    }
  }

  private invoke(method: string, ...args: any[]) {
    return new Promise<any>((resolve) => {
      IPC.sendSensitive('app-fork:neo4j', method, ...args).then((key: string, res: any) => {
        if (res?.code === 200) return
        IPC.off(key)
        resolve(res ?? { code: 1, msg: 'Neo4j operation failed' })
      })
    })
  }
}

export default new Neo4jController()
