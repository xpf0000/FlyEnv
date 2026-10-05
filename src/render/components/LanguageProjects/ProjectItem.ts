import { uuid } from '@/util/Index'
import { reactive } from 'vue'
import { MessageError, MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'
import { ElMessageBox } from 'element-plus'
import { AppStore } from '@/store/app'
import type { AllAppModule } from '@/core/type'
import { forkTerminalRequest, isPositiveHostPid } from '@/util/ForkTerminalRequest'
import { beginServiceStatusPending, noteServiceStatusRevision } from '@/util/mcpServiceStatus'
import type {
  RoadRunnerProjectExtra,
  RoadRunnerProjectPreset
} from '@/components/RoadRunner/project'
import type { SwooleCliProjectExtra, SwooleCliProjectPreset } from '@/components/SwooleCli/project'

export type ProjectItemType = RoadRunnerProjectExtra &
  SwooleCliProjectExtra & {
    id: string
    path: string
    comment: string
    binVersion: string
    binPath: string
    binBin: string
    isSorting?: boolean

    isService: boolean
    runCommand: string
    runFile: string
    commandType: 'command' | 'file'
    projectPort: number
    configPath: Array<{ name: string; path: string }>
    logPath: Array<{ name: string; path: string }>
    pidPath: string
    isSudo: boolean
    envVarType: 'none' | 'specify' | 'file'
    envVar: string
    envFile: string
    runInTerminal: boolean
    typeFlag: AllAppModule
  }

export type RunningState = {
  running: boolean
  isRun: boolean
  pid: string
}

// 项目仅在 LanguageProjects 模块使用此运行参数类型，不再依赖废弃的第二套 Runner。
export type RunProjectItem = ProjectItemType

// ProjectItem 通过 language-project fork 通道统一管理，typeFlag 只是项目选择的语言模块。
const ProjectServiceStatusType = 'language-project'

// 停止 Promise 不属于项目持久化内容，保存在模块局部 WeakMap 中供重复调用共享。
const stopOperations = new WeakMap<object, Promise<boolean>>()
// startAll、按钮和重启可能同一时刻触发同一项目；共享首个完整启动结果，避免串行队列重复拉起。
const startOperations = new WeakMap<object, Promise<boolean | string>>()

export class ProjectItem implements ProjectItemType {
  isService = false
  id: string = ''
  path: string = ''
  comment: string = ''
  binVersion: string = ''
  binPath: string = ''
  binBin: string = ''
  isSorting?: boolean

  runCommand: string = ''
  runFile: string = ''
  commandType: 'command' | 'file' = 'command'
  projectPort: number = 3000
  configPath: Array<{ name: string; path: string }> = []
  logPath: Array<{ name: string; path: string }> = []
  pidPath: string = ''
  isSudo: boolean = false
  envVarType: 'none' | 'specify' | 'file' = 'none'
  envVar: string = ''
  envFile: string = ''
  runInTerminal: boolean = false

  roadRunnerPreset?: RoadRunnerProjectPreset
  roadRunnerConfigPath?: string
  roadRunnerConfigManaged?: boolean
  roadRunnerPHPBin?: string
  roadRunnerPHPVersion?: string

  swooleCliPreset?: SwooleCliProjectPreset
  swooleCliScriptPath?: string

  typeFlag: AllAppModule = 'golang'

  private _state: RunningState = {
    running: false,
    isRun: false,
    pid: ''
  }

  constructor(item: Partial<RunProjectItem>) {
    Object.assign(this, item)
    this.id = item.id || uuid()
    this.runInTerminal = false
    this._state = reactive({
      running: false,
      isRun: false,
      pid: ''
    })
  }

  get state(): RunningState {
    return this._state
  }

  async restart(): Promise<boolean | string> {
    // 保留既有项目生命周期；停止取消/失败不再启动新进程或重复请求授权。
    if (!(await this.stop())) return false
    return this.start()
  }

  /** 只把终态成功当成项目已停；后台模式与手动模式使用同一项目状态所有者。 */
  stop(showMessage = true, interactive = true): Promise<boolean> {
    const current = stopOperations.get(this)
    if (current) return current
    const pending = this.stopAfterStart(showMessage, interactive).finally(() => {
      if (stopOperations.get(this) === pending) stopOperations.delete(this)
    })
    stopOperations.set(this, pending)
    return pending
  }

  private async stopAfterStart(showMessage: boolean, interactive: boolean): Promise<boolean> {
    const starting = startOperations.get(this)
    if (starting) {
      // 启动请求终态前 PID 尚未登记，不能以空 PID 报 stop 成功；失败/超时保留未知状态。
      const started = await starting
      if (started !== true) return false
    }
    return this.stopInternal(showMessage, interactive)
  }

  /** 同一项目在任意页面只有一条停止请求；首个调用确定本次交互意图和通知策略。 */
  private stopInternal(showMessage: boolean, interactive: boolean): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this._state.isRun || !this._state.pid) {
        this._state.isRun = false
        this._state.pid = ''
        resolve(true)
        return
      }
      this._state.running = true
      const finishPending = beginServiceStatusPending(ProjectServiceStatusType)
      void forkTerminalRequest(
        `${interactive ? 'app-fork' : 'app-fork-background'}:language-project`,
        ['stopService', this._state.pid, this.typeFlag],
        I18nT('setup.windowsPrivilege.timeout')
      )
        .then((res: any) => {
          finishPending()
          noteServiceStatusRevision(ProjectServiceStatusType, res?.serviceStatusRevision)
          this._state.running = false
          if (res?.code === 0) {
            this._state.isRun = false
            this._state.pid = ''
            if (showMessage) {
              MessageSuccess(I18nT('base.success'))
            }
            resolve(true)
          } else {
            if (showMessage) {
              MessageError(res?.msg ?? I18nT('base.fail'))
            }
            resolve(false)
          }
        })
        .catch((error) => {
          finishPending()
          this._state.running = false
          if (showMessage) MessageError(error instanceof Error ? error.message : String(error))
          resolve(false)
        })
    })
  }

  /** interactive 与通知/是否开终端分开；关闭通知不等于可以自动弹 UAC。 */
  start(showMessage = true, runInTerminal = false, interactive = true): Promise<boolean | string> {
    const current = startOperations.get(this)
    if (current) return current
    const pending = (async () => {
      const stopping = stopOperations.get(this)
      if (stopping && !(await stopping)) return false
      return this.startInternal(showMessage, runInTerminal, interactive)
    })()
      .catch((error) => {
        this._state.running = false
        return error instanceof Error ? error.message : String(error)
      })
      .finally(() => {
        if (startOperations.get(this) === pending) startOperations.delete(this)
      })
    startOperations.set(this, pending)
    return pending
  }

  private startInternal(
    showMessage: boolean,
    runInTerminal: boolean,
    interactive: boolean
  ): Promise<boolean | string> {
    return new Promise((resolve) => {
      if (!this.isService) {
        resolve(true)
        return
      }
      if (this._state.isRun && this._state.pid) {
        resolve(true)
        return
      }
      this._state.running = true

      const doRun = (password?: string, openInTerminal?: boolean) => {
        let data: any
        try {
          data = JSON.parse(JSON.stringify(this))
        } catch (error) {
          this._state.running = false
          const message = error instanceof Error ? error.message : String(error)
          if (showMessage) MessageError(message)
          resolve(message)
          return
        }
        const finishPending = beginServiceStatusPending(ProjectServiceStatusType)
        void forkTerminalRequest(
          `${interactive ? 'app-fork' : 'app-fork-background'}:language-project`,
          ['startService', data, this.typeFlag, password, openInTerminal || runInTerminal],
          I18nT('setup.windowsPrivilege.timeout')
        )
          .then((res: any) => {
            finishPending()
            noteServiceStatusRevision(ProjectServiceStatusType, res?.serviceStatusRevision)
            if (res.code === 0) {
              const pid = res?.data?.['APP-Service-Start-PID'] ?? ''
              this._state.running = false
              if (!isPositiveHostPid(pid)) {
                this._state.isRun = false
                this._state.pid = ''
                if (showMessage) MessageError(I18nT('base.fail'))
                resolve(I18nT('base.fail'))
                return
              }
              this._state.isRun = true
              this._state.pid = `${pid}`
              if (showMessage) {
                MessageSuccess(I18nT('base.success'))
              }
              resolve(true)
            } else if (res.code === 1) {
              this._state.running = false
              this._state.isRun = false
              this._state.pid = ''
              if (showMessage) {
                MessageError(res.msg)
              }
              resolve(res.msg)
            }
          })
          .catch((error) => {
            finishPending()
            this._state.running = false
            if (showMessage) MessageError(error instanceof Error ? error.message : String(error))
            resolve(error instanceof Error ? error.message : String(error))
          })
      }

      if (this.isSudo && !window.Server.Password) {
        // 后台启动不得打开密码框；已有凭据可以继续，缺凭据交回启动组报告失败。
        if (!interactive) {
          this._state.running = false
          resolve(I18nT('setup.module.needPasswordToStart'))
          return
        }
        this.showPasswordTips(doRun, resolve)
      } else {
        doRun(undefined)
      }
    })
  }

  private showPasswordTips(
    doRun: (password?: string, openInTerminal?: boolean) => void,
    resolve: (value: boolean | string) => void
  ) {
    ElMessageBox.prompt(I18nT('setup.module.needPasswordToStart'), I18nT('host.warning'), {
      distinguishCancelAndClose: true,
      confirmButtonText: I18nT('base.confirm'),
      cancelButtonText: I18nT('nodejs.openIN') + ' ' + I18nT('nodejs.Terminal'),
      inputType: 'password',
      customClass: 'password-prompt',
      beforeClose: (action, instance, done) => {
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
                      doRun(pass)
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
                instance.editorErrorMessage = error instanceof Error ? error.message : String(error)
              })
          }
        } else if (action === 'cancel') {
          done()
          doRun(undefined, true)
        } else {
          done()
          this._state.running = false
          resolve('User Cancel Action')
        }
      }
    })
      .then()
      .catch()
  }

  showLog() {}
}
