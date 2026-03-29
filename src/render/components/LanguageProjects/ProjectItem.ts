import { uuid } from '@/util/Index'
import { reactive } from 'vue'
import IPC from '@/util/IPC'
import { MessageError, MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'
import { ElMessageBox } from 'element-plus'
import { AppStore } from '@/store/app'
import { RunProjectItem } from '@/core/LanguageProjectRunner'
import type { AllAppModule } from '@/core/type'

export type ProjectItemType = {
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
}

export type RunningState = {
  running: boolean
  isRun: boolean
  pid: string
}

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

  typeFlag: AllAppModule = 'golang'

  private _state: RunningState = {
    running: false,
    isRun: false,
    pid: ''
  }

  constructor(item: Partial<RunProjectItem>) {
    Object.assign(this, item)
    this.id = item.id || uuid()
    this._state = reactive({
      running: false,
      isRun: false,
      pid: ''
    })
  }

  get state(): RunningState {
    return this._state
  }

  stop(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this._state.isRun || !this._state.pid) {
        this._state.isRun = false
        this._state.pid = ''
        resolve(true)
        return
      }
      this._state.running = true
      IPC.send('app-fork:language-project', 'stopService', this._state.pid, this.typeFlag).then(
        (key: string, res: any) => {
          IPC.off(key)
          this._state.running = false
          if (res?.code === 0) {
            this._state.isRun = false
            this._state.pid = ''
            MessageSuccess(I18nT('base.success'))
            resolve(true)
          } else {
            MessageError(res?.msg ?? I18nT('base.fail'))
            resolve(false)
          }
        }
      )
    })
  }

  start(): Promise<boolean | string> {
    return new Promise(async (resolve) => {
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
        const data = JSON.parse(JSON.stringify(this))
        IPC.send(
          'app-fork:language-project',
          'startService',
          data,
          this.typeFlag,
          password,
          openInTerminal
        ).then((key: string, res: any) => {
          if (res.code === 0) {
            IPC.off(key)
            this._state.running = false
            this._state.isRun = true
            this._state.pid = res?.data?.['APP-Service-Start-PID'] ?? ''
            MessageSuccess(I18nT('base.success'))
            resolve(true)
          } else if (res.code === 1) {
            IPC.off(key)
            this._state.running = false
            this._state.isRun = false
            this._state.pid = ''
            MessageError(res.msg)
            resolve(res.msg)
          } else if (res.code === 200) {
            if (res?.msg?.['APP-Service-Start-Success'] === true) {
              this._state.isRun = true
            }
          }
        })
      }

      if (this.isSudo && !window.Server.Password) {
        this.showPasswordTips(doRun, resolve)
      } else {
        doRun(undefined, this.runInTerminal)
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
            IPC.send('app:password-check', pass).then((key: string, res: any) => {
              IPC.off(key)
              if (res?.code === 0) {
                window.Server.Password = res?.data ?? pass
                AppStore()
                  .initConfig()
                  .then(() => {
                    done()
                    doRun(pass, false)
                  })
              } else {
                instance.editorErrorMessage = res?.msg ?? I18nT('base.passwordError')
              }
            })
          }
        } else if (action === 'cancel') {
          done()
          doRun(undefined, true)
        } else {
          done()
          resolve('User Cancel Action')
        }
      }
    })
      .then()
      .catch()
  }
}
