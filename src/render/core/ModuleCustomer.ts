import type { CustomerModuleExecItem, CustomerModuleItem } from '@/core/Module'
import { computed, reactive, watch } from 'vue'
import { MessageError, MessageSuccess } from '@/util/Element'
import { AppCustomerModule } from '@/core/Module'
import { ElMessageBox } from 'element-plus'
import { I18nT } from '@lang/index'
import { AppStore } from '@/store/app'
import { forkTerminalRequest, isPositiveHostPid } from '@/util/ForkTerminalRequest'
import { beginServiceStatusPending, noteServiceStatusRevision } from '@/util/mcpServiceStatus'

const ModuleDefaultIcon = `<svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg"
>
  <path
    d="M512 977.92c-20.48 0-40.96-5.12-61.44-15.36L153.6 788.48c-20.48-10.24-35.84-25.6-46.08-46.08s-15.36-40.96-15.36-61.44V343.04c0-20.48 5.12-40.96 15.36-61.44 10.24-20.48 25.6-35.84 46.08-46.08l296.96-168.96c35.84-20.48 87.04-20.48 122.88 0L870.4 235.52c20.48 10.24 35.84 25.6 46.08 46.08 10.24 20.48 15.36 40.96 15.36 61.44v343.04c0 20.48-5.12 40.96-15.36 61.44-10.24 20.48-25.6 35.84-46.08 46.08l-296.96 168.96c-20.48 10.24-40.96 15.36-61.44 15.36z m0-855.04c-10.24 0-15.36 0-25.6 5.12L189.44 302.08l-15.36 15.36c-5.12 5.12-5.12 15.36-10.24 25.6v343.04c0 10.24 0 15.36 5.12 25.6s10.24 15.36 15.36 15.36l296.96 168.96c15.36 10.24 30.72 10.24 46.08 0l296.96-168.96c5.12-5.12 15.36-10.24 15.36-15.36 5.12-5.12 5.12-15.36 5.12-25.6V343.04c0-10.24 0-15.36-5.12-25.6-5.12-5.12-10.24-15.36-15.36-15.36l-296.96-168.96c0-5.12-5.12-10.24-15.36-10.24z"
  ></path>
  <path
    d="M512 552.96c-5.12 0-15.36 0-20.48-5.12L117.76 327.68c-15.36-10.24-20.48-30.72-10.24-51.2s35.84-25.6 51.2-15.36l353.28 204.8 353.28-204.8c20.48-10.24 40.96-5.12 51.2 15.36s5.12 40.96-15.36 51.2l-373.76 215.04c0 5.12-10.24 10.24-15.36 10.24z"
  ></path>
  <path
    d="M512 983.04c-20.48 0-40.96-15.36-40.96-40.96V512c0-20.48 15.36-40.96 40.96-40.96s40.96 15.36 40.96 40.96v430.08c0 20.48-20.48 40.96-40.96 40.96z"
  ></path>
</svg>`

// 运行中的 Promise 留在模块局部，不成为自定义服务对象的可枚举字段并混入 IPC JSON。
const stopOperations = new WeakMap<object, Promise<boolean | string>>()
const startOperations = new WeakMap<object, Promise<boolean | string>>()

class ModuleCustomerExecItem implements CustomerModuleExecItem {
  command: string = ''
  comment: string = ''
  commandFile: string = ''
  commandType: 'command' | 'file' = 'command'

  configPath: Array<{ name: string; path: string }> = []
  id: string = ''
  isSudo: boolean = false
  logPath: Array<{ name: string; path: string }> = []
  name: string = ''
  pidPath: string = ''

  running = false
  run = false
  pid = ''

  declare private module?: ModuleCustomer
  // 自定义独占服务的版本切换也保留后台/交互意图，不走默认可弹窗 stop。
  _onStart!: (item: ModuleCustomerExecItem, interactive?: boolean) => Promise<ModuleCustomer>

  constructor(item: any, module?: ModuleCustomer) {
    Object.assign(this, item)
    Object.defineProperty(this, 'module', {
      value: module,
      writable: true,
      configurable: true,
      enumerable: false
    })
    this.running = false
    this.run = false
    this.pid = ''
  }

  /** 自定义服务停止同样保留进度与失败时的 PID，禁止取消 UAC 后误报已停止。 */
  stop(interactive = true, waitForStart = true) {
    const current = stopOperations.get(this)
    // 首次 stop 会先置 run=false；重复调用仍须等待同一终态，不能提前让版本切换继续。
    if (current) return current
    const task = waitForStart ? this.stopAfterStart(interactive) : this.stopInternal(interactive)
    const pending = task.finally(() => {
      if (stopOperations.get(this) === pending) stopOperations.delete(this)
    })
    stopOperations.set(this, pending)
    return pending
  }

  private async stopAfterStart(interactive: boolean): Promise<boolean | string> {
    const starting = startOperations.get(this)
    if (starting) {
      const started = await starting
      if (started !== true) return started
    }
    return this.stopInternal(interactive)
  }

  private stopInternal(interactive: boolean): Promise<boolean | string> {
    return new Promise<boolean | string>((resolve) => {
      if (!this.run) {
        return resolve(true)
      }
      this.running = true
      this.run = false
      const finishPending = beginServiceStatusPending('module-customer')
      void forkTerminalRequest(
        `${interactive ? 'app-fork' : 'app-fork-background'}:module-customer`,
        ['stopService', this.pid],
        I18nT('setup.windowsPrivilege.timeout')
      )
        .then((result: any) => {
          finishPending()
          noteServiceStatusRevision('module-customer', result?.serviceStatusRevision)
          if (result?.code !== 0) {
            this.run = true
            this.running = false
            resolve(result?.msg ?? 'Operation failed')
            return
          }
          this.run = false
          this.pid = ''
          this.running = false
          resolve(true)
        })
        .catch((error) => {
          finishPending()
          // 超时/同步发送异常是未知停止结果；保留 PID 与 run，让用户仍能重试或退出清理。
          this.run = true
          this.running = false
          resolve(error instanceof Error ? error.message : String(error))
        })
    })
  }

  /** 列表重启必须先确认旧 PID 已停；失败时把实际错误留给 UI 展示。 */
  async restart(interactive = true): Promise<boolean | string> {
    const stopped = await this.stop(interactive)
    if (stopped !== true) return stopped
    return this.start(interactive)
  }

  /** 自定义版本保留原单次启动防重，权限意图作为原生命周期参数传递。 */
  start(interactive = true): Promise<boolean | string> {
    const current = startOperations.get(this)
    if (current) return current
    const task = async () => {
      const stopping = stopOperations.get(this)
      if (stopping) {
        const stopped = await stopping
        if (stopped !== true) return stopped
      }
      return this._startInternal(interactive)
    }
    const pending = Promise.resolve()
      .then(() => this.module?.startSingleFlight(task) ?? task())
      .catch((error) => {
        this.running = false
        return error instanceof Error ? error.message : String(error)
      })
      .finally(() => {
        if (startOperations.get(this) === pending) startOperations.delete(this)
      })
    startOperations.set(this, pending)
    return pending
  }

  _startInternal(interactive: boolean): Promise<boolean | string> {
    return new Promise(async (resolve) => {
      if (this.run && this.pid) {
        return resolve(true)
      }
      this.running = true
      let module: ModuleCustomer
      try {
        module = await this._onStart(this, interactive)
      } catch (error) {
        // 前置停止失败必须结束当前启动 Promise，恢复按钮并解除模块 single-flight。
        this.running = false
        resolve(error instanceof Error ? error.message : String(error))
        return
      }

      let hadRun = false

      const doRun = (openInTerminal?: boolean) => {
        if (hadRun) {
          return
        }
        hadRun = true
        const finishPending = beginServiceStatusPending('module-customer')
        let itemSnapshot: string
        try {
          itemSnapshot = JSON.stringify(this)
        } catch (error) {
          finishPending()
          this.running = false
          // 请求未到终态时服务结果未知；保留已有标识，不能将超时伪装成已停止。
          resolve(error instanceof Error ? error.message : String(error))
          return
        }
        void forkTerminalRequest(
          `${interactive ? 'app-fork' : 'app-fork-background'}:module-customer`,
          ['startService', JSON.parse(itemSnapshot), module.isService, openInTerminal],
          I18nT('setup.windowsPrivilege.timeout')
        )
          .then((res: any) => {
            finishPending()
            noteServiceStatusRevision('module-customer', res?.serviceStatusRevision)
            if (res.code === 0) {
              const pid = res?.data?.['APP-Service-Start-PID'] ?? ''
              this.running = false
              if (module.isService) {
                if (!isPositiveHostPid(pid)) {
                  this.run = false
                  this.pid = ''
                  resolve(I18nT('base.fail'))
                  return
                }
                this.run = true
                this.pid = `${pid}`
              } else {
                MessageSuccess(I18nT('base.success'))
              }
              resolve(true)
            } else if (res.code === 1) {
              this.running = false
              this.run = false
              this.pid = ''
              MessageError(res.msg)
              resolve(res.msg)
            }
          })
          .catch((error) => {
            finishPending()
            this.running = false
            // 超时/发送异常不是失败终态；保留先前 PID 与状态供重试和退出清理使用。
            resolve(error instanceof Error ? error.message : String(error))
          })
      }

      const showPasswordTips = () => {
        ElMessageBox.prompt(I18nT('setup.module.needPasswordToStart'), I18nT('host.warning'), {
          distinguishCancelAndClose: true,
          confirmButtonText: I18nT('base.confirm'),
          cancelButtonText: I18nT('nodejs.openIN') + ' ' + I18nT('nodejs.Terminal'),
          inputType: 'password',
          customClass: 'password-prompt',
          beforeClose: (action, instance, done) => {
            console.log('beforeClose: ', action)
            if (action === 'confirm') {
              if (instance.inputValue) {
                const pass = instance.inputValue
                void forkTerminalRequest(
                  'app:password-check',
                  [pass],
                  I18nT('setup.windowsPrivilege.timeout')
                )
                  .then((res: any) => {
                    if (res?.code === 0) {
                      window.Server.Password = res?.data ?? pass
                      AppStore()
                        .initConfig()
                        .then(() => {
                          done()
                          doRun()
                        })
                        .catch((error) => {
                          instance.editorErrorMessage =
                            error instanceof Error ? error.message : String(error)
                        })
                    } else {
                      instance.editorErrorMessage = res?.msg ?? I18nT('base.passwordError')
                    }
                  })
                  .catch((error) => {
                    instance.editorErrorMessage =
                      error instanceof Error ? error.message : String(error)
                  })
              }
            } else if (action === 'cancel') {
              done()
              doRun(true)
            } else {
              done()
              resolve('User Cancel Action')
            }
          }
        })
          .then()
          .catch()
      }
      if (this.isSudo && !window.Server.Password) {
        try {
          showPasswordTips()
        } catch (error) {
          this.running = false
          resolve(error instanceof Error ? error.message : String(error))
        }
      } else {
        doRun()
      }
    })
  }

  onStart(
    fn: (item: ModuleCustomerExecItem, interactive?: boolean) => Promise<ModuleCustomer>,
    module?: ModuleCustomer
  ) {
    this._onStart = fn
    this.module = module ?? this.module
  }
}

class ModuleCustomer implements CustomerModuleItem {
  isCustomer = true
  icon: string = ModuleDefaultIcon
  id: string = ''
  typeFlag = ''
  isOnlyRunOne: boolean = false
  isService: boolean = false
  item: ModuleCustomerExecItem[] = []
  label: string = ''
  moduleType: string = ''
  currentItemID = ''
  configPath: Array<{ name: string; path: string }> = []
  logPath: Array<{ name: string; path: string }> = []
  /** Exclusive custom service modules may start only one version at a time. */
  starting: boolean = false
  private startFlight?: Promise<boolean | string>

  showHideWatcher: any

  constructor(item: any) {
    Object.assign(this, item)
    this.typeFlag = this.id
    this.starting = false
    const list: ModuleCustomerExecItem[] = []
    const arr: CustomerModuleExecItem[] = item?.item ?? []
    const onStart = this.onExecStart.bind(this)
    for (const i of arr) {
      const execItem = reactive(new ModuleCustomerExecItem(i, this))
      execItem.onStart = execItem.onStart.bind(execItem)
      execItem.stop = execItem.stop.bind(execItem)
      execItem.start = execItem.start.bind(execItem)
      execItem.onStart(onStart, this)
      list.push(execItem)
    }
    this.item = reactive(list)
  }

  startSingleFlight(start: () => Promise<boolean | string>): Promise<boolean | string> {
    if (!this.isOnlyRunOne || !this.isService) {
      return start()
    }
    if (this.startFlight) {
      return this.startFlight
    }
    this.starting = true
    const flight = start().finally(() => {
      if (this.startFlight === flight) {
        this.startFlight = undefined
        this.starting = false
      }
    })
    this.startFlight = flight
    return flight
  }

  /** 前置停止失败不改变 currentItemID，不启动另一份自定义服务实例。 */
  async onExecStart(item: ModuleCustomerExecItem, interactive = true): Promise<ModuleCustomer> {
    if (!this.isOnlyRunOne || !this.isService) return this
    // 独占版本切换属于当前 startFlight 的内部前置停止，不能反向等待自己。
    const stopped = await Promise.all(this.item.map((a) => a.stop(interactive, false)))
    const failures = stopped.filter((result) => result !== true)
    if (failures.length) throw new Error(failures.map(String).join('\n'))
    if (this.currentItemID !== item.id) {
      console.log('this.currentItemID !== item.id !!', this.currentItemID, item.id)
      this.currentItemID = item.id
      if (AppCustomerModule?.currentModule?.id === this.id) {
        console.log('AppCustomerModule?.currentModule?.id === this.id', this.id)
        AppCustomerModule.currentModule!.currentItemID = item.id
      }
      await AppCustomerModule.saveModule()
      AppCustomerModule.index += 1
    }
    return this
  }

  /** 模块批量启动将同一意图传给每个版本，不另建后台启动控制器。 */
  start(interactive = true): Promise<boolean | string> {
    return new Promise((resolve) => {
      if (this.isOnlyRunOne !== true) {
        Promise.all(this.item.map((a) => a.start(interactive)))
          .then((arrs) => {
            const err = arrs.filter((a) => typeof a === 'string')
            if (err.length) {
              resolve(err.join('\n'))
            } else {
              resolve(true)
            }
          })
          .catch((e) => {
            resolve(e.toString())
          })
        return
      }
      if (this.item.length === 0) {
        resolve(true)
        return
      }
      let find = this.item.find((f) => f.id === this.currentItemID)
      if (!this.currentItemID || !find) {
        this.currentItemID = this.item[0].id
      }
      find = this.item.find((f) => f.id === this.currentItemID)
      find!
        .start(interactive)
        .then((res) => {
          resolve(res)
        })
        .catch((e) => {
          resolve(e.toString())
        })
    })
  }

  /** 每个版本的失败需汇总给启动组，避免停止未完成却允许下一组启动。 */
  stop(interactive = true): Promise<boolean | string> {
    return new Promise((resolve) => {
      Promise.all(this.item.map((a) => a.stop(interactive)))
        .then((results) => {
          const errors = results.filter((result) => typeof result === 'string')
          resolve(errors.length ? errors.join('\n') : true)
        })
        .catch((error) => {
          resolve(error instanceof Error ? error.message : String(error))
        })
    })
  }

  watchShowHide() {
    const appStore = AppStore()
    const show = computed(() => {
      return appStore.config.setup.common.showItem?.[this.typeFlag] !== false
    })
    this.showHideWatcher = watch(show, (v) => {
      console.log('watchShowHide show: ', v, this.typeFlag)
      if (!v && this.isService) {
        try {
          this.stop()
        } catch {}
      }
    })
  }

  destroy() {
    this?.showHideWatcher?.()
    try {
      this.stop()
    } catch {}
  }
}

export { ModuleDefaultIcon, ModuleCustomer, ModuleCustomerExecItem }
