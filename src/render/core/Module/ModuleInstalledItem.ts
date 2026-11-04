import { computed } from 'vue'
import type { AllAppModule } from '@/core/type'
import type { SoftInstalled } from '@shared/app'
import { ServiceActionStore } from '@/components/ServiceManager/EXT/store'
import { Module } from '@/core/Module/Module'
import { MessageError } from '@/util/Element'
import { BrewStore } from '@/store/brew'
import { forkTerminalRequest, isPositiveHostPid } from '@/util/ForkTerminalRequest'
import { beginServiceStatusPending, noteServiceStatusRevision } from '@/util/mcpServiceStatus'
import { I18nT } from '@lang/index'

// 停止 Promise 是瞬时生命周期状态，不放进可被 JSON.stringify 发送到 fork 的服务对象。
const stopOperations = new WeakMap<object, Promise<string | boolean>>()
const startOperations = new WeakMap<object, Promise<string | boolean>>()
const lifecycleTimeoutMs = 360_000

export class ModuleInstalledItem implements SoftInstalled {
  typeFlag: AllAppModule = 'dns'
  bin: string = ''
  enable: boolean = true
  error?: string
  source: 'Static' | 'Homebrew' | 'Macports' = 'Static'
  num: number = 0
  path: string = ''
  phpBin?: string
  phpConfig?: string
  phpize?: string
  pid?: string
  note?: string
  run: boolean = false
  running: boolean = false
  version: string = ''
  isLocal7Z?: boolean
  rootPassword?: string

  get isInEnv() {
    return computed(() => ServiceActionStore.isInEnv(this))
  }

  get isInAppEnv() {
    return computed(() => ServiceActionStore.isInAppEnv(this))
  }

  // 独占版本切换的 stop 前置步骤必须继承本次 start 的交互意图。
  _onStart!: (
    item: ModuleInstalledItem,
    interactive?: boolean,
    isActive?: () => boolean
  ) => Promise<Module>

  constructor(json: SoftInstalled) {
    Object.assign(this, json)
  }

  // 使用箭头函数绑定 this
  /** 独占模块共用模块 flight，多版本模块保留本实例 flight；后台不升级为可弹窗请求。 */
  start(interactive = true): Promise<string | boolean> {
    const current = startOperations.get(this)
    if (current) return current
    let module: Module
    try {
      module = BrewStore().module(this.typeFlag)
    } catch (error) {
      return Promise.resolve(error instanceof Error ? error.message : String(error))
    }
    const context = { active: true, started: false }
    const timeoutMessage = I18nT('setup.windowsPrivilege.timeout')
    let timer: ReturnType<typeof setTimeout> | undefined
    // single-flight admission, version-switch stop, extension arguments and fork IPC share one budget.
    const deadline = new Promise<string>((resolve) => {
      timer = setTimeout(() => {
        context.active = false
        if (context.started) this.running = false
        resolve(timeoutMessage)
      }, lifecycleTimeoutMs)
    })
    const work = Promise.resolve()
      .then(() =>
        module.startSingleFlight(() =>
          // 从第一个前置等待起就参与同一预算；已有 stop 若不结算，也不能永久占用模块锁。
          Promise.race([
            (async () => {
              if (!context.active) return timeoutMessage
              const stopping = stopOperations.get(this)
              if (stopping) {
                const stopped = await stopping
                if (stopped !== true) return stopped
              }
              if (!context.active) return timeoutMessage
              return this.startInternal(interactive, context)
            })(),
            deadline
          ])
        )
      )
      .catch((error) => {
        if (context.active) this.running = false
        return error instanceof Error ? error.message : String(error)
      })
    const pending = Promise.race([work, deadline]).finally(() => {
      if (timer) clearTimeout(timer)
      context.active = false
      if (startOperations.get(this) === pending) startOperations.delete(this)
    })
    startOperations.set(this, pending)
    return pending
  }

  private async startInternal(
    interactive: boolean,
    context: { active: boolean; started: boolean }
  ): Promise<string | boolean> {
    if (!context.active) return I18nT('setup.windowsPrivilege.timeout')
    if (this.run && this.pid) return true
    context.started = true
    this.running = true
    try {
      const module = await this._onStart(this, interactive, () => context.active)
      if (!context.active) return I18nT('setup.windowsPrivilege.timeout')
      let params: any[] = []
      if (module?.startExtParam) params = await module.startExtParam(this)
      if (!context.active) return I18nT('setup.windowsPrivilege.timeout')

      const finishPending = beginServiceStatusPending(this.typeFlag)
      try {
        const res = await forkTerminalRequest(
          `${interactive ? 'app-fork' : 'app-fork-background'}:${this.typeFlag}`,
          ['startService', JSON.parse(JSON.stringify(this)), ...params],
          I18nT('setup.windowsPrivilege.timeout')
        )
        // The whole-operation deadline may have fired while awaiting the fork terminal callback.
        if (!context.active) return I18nT('setup.windowsPrivilege.timeout')
        noteServiceStatusRevision(this.typeFlag, res?.serviceStatusRevision)
        if (res.code === 0) {
          const pid = res?.data?.['APP-Service-Start-PID']
          if (!isPositiveHostPid(pid)) {
            this.run = false
            this.pid = ''
            return I18nT('base.fail')
          }
          this.pid = `${pid}`
          this.run = true
          return true
        }
        this.run = false
        this.pid = ''
        return res?.msg ?? I18nT('base.fail')
      } finally {
        finishPending()
      }
    } catch (error) {
      // 前置参数构造或 fork 请求失败都作为终态返回，确保 module/item flight 可以释放。
      return error instanceof Error ? error.message : String(error)
    } finally {
      // Deadline 后旧 preflight 仍可能收尾；不得覆盖后续启动刚设置的 running 状态。
      if (context.active) this.running = false
    }
  }

  /** 只有 fork 成功终态才清 PID；失败恢复 run 状态，进度继续保留监听。 */
  stop(interactive = true, waitForStart = true): Promise<string | boolean> {
    const current = stopOperations.get(this)
    // run 会在 IPC 等待期间暂时置 false；必须先返回原 Promise，不能把未完成停止伪装成成功。
    if (current) return current
    const task = waitForStart ? this.stopAfterStart(interactive) : this.stopInternal(interactive)
    const pending = task.finally(() => {
      if (stopOperations.get(this) === pending) stopOperations.delete(this)
    })
    stopOperations.set(this, pending)
    return pending
  }

  private async stopAfterStart(interactive: boolean): Promise<string | boolean> {
    const starting = startOperations.get(this)
    if (starting) {
      const started = await starting
      if (started !== true) return started
    }
    return this.stopInternal(interactive)
  }

  private async stopInternal(interactive: boolean): Promise<string | boolean> {
    if (!this.run) {
      return true
    }
    this.running = true
    this.run = false

    const finishPending = beginServiceStatusPending(this.typeFlag)
    const deadline = Date.now() + lifecycleTimeoutMs
    let prepareTimer: ReturnType<typeof setTimeout> | undefined
    try {
      // 模块定位/扩展参数也属于停止准备；同步异常恢复原状态，悬挂准备不得永久占用 flight。
      const module = BrewStore().module(this.typeFlag)
      const params = await Promise.race([
        Promise.resolve().then(() => module?.stopExtParam?.(this) ?? []),
        new Promise<never>((_resolve, reject) => {
          prepareTimer = setTimeout(
            () => reject(new Error(I18nT('setup.windowsPrivilege.timeout'))),
            lifecycleTimeoutMs
          )
        })
      ])
      if (prepareTimer) clearTimeout(prepareTimer)
      const res = await forkTerminalRequest(
        `${interactive ? 'app-fork' : 'app-fork-background'}:${this.typeFlag}`,
        ['stopService', JSON.parse(JSON.stringify(this)), ...params],
        I18nT('setup.windowsPrivilege.timeout'),
        Math.max(1, deadline - Date.now())
      )
      finishPending()
      noteServiceStatusRevision(this.typeFlag, res?.serviceStatusRevision)
      if (res?.code === 0) {
        this.run = false
        this.pid = ''
        this.running = false
        return true
      }

      this.run = true
      this.running = false
      return res?.msg ?? I18nT('base.fail')
    } catch (error) {
      finishPending()
      this.run = true
      this.running = false
      return error instanceof Error ? error.message : String(error)
    } finally {
      if (prepareTimer) clearTimeout(prepareTimer)
    }
  }

  async restart(): Promise<string | boolean> {
    // stop 返回错误字符串/false 时，进程可能仍在运行。不能继续 start，
    // 否则取消一次权限后又弹第二次，或把旧 PID 的运行状态覆盖为成功。
    const stopped = await this.stop()
    if (stopped !== true) return stopped
    return this.start()
  }

  async serviceDo(flag: 'stop' | 'start' | 'restart'): Promise<string | boolean> {
    if (!this?.version || !this?.path) return I18nT('base.fail')
    try {
      const module = BrewStore().module(this.typeFlag)
      // 停止可以等待本实例的启动；多版本模块的其他行不参与互斥。
      // 独占模块才需要防止另一版本抢占当前切换流程，不把 PHP-FPM 变成单实例模块。
      if (
        flag !== 'stop' &&
        (this.running ||
          (module.isOnlyRunOne &&
            (module.starting || module.installed.some((item) => item.running))))
      ) {
        return 'Operation in progress'
      }
      const result =
        flag === 'stop'
          ? await this.stop()
          : flag === 'start'
            ? await this.start()
            : await this.restart()
      if (result !== true) MessageError(typeof result === 'string' ? result : I18nT('base.fail'))
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      MessageError(message)
      return message
    }
  }

  setEnv(): Promise<string | boolean> {
    return ServiceActionStore.updatePath(this, this.typeFlag)
  }
}
