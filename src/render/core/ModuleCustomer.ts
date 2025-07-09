import type { CustomerModuleExecItem, CustomerModuleItem } from '@/core/Module'
import { computed, reactive, watch } from 'vue'
import IPC from '@/util/IPC'
import { MessageError, MessageSuccess } from '@/util/Element'
import { AppCustomerModule } from '@/core/Module'
import { ElMessageBox } from 'element-plus'
import { I18nT } from '@lang/index'
import { AppStore } from '@/store/app'

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

  _onStart!: (item: ModuleCustomerExecItem) => Promise<ModuleCustomer>

  constructor(item: any) {
    Object.assign(this, item)
    this.running = false
    this.run = false
    this.pid = ''
  }

  stop() {
    return new Promise((resolve) => {
      if (!this.run) {
        return resolve(true)
      }
      this.running = true
      this.run = false
      IPC.send('app-fork:module-customer', 'stopService', this.pid).then((key: string) => {
        IPC.off(key)
        this.run = false
        this.pid = ''
        this.running = false
        resolve(true)
      })
    })
  }

  start(): Promise<boolean | string> {
    return new Promise(async (resolve) => {
      if (this.run && this.pid) {
        return resolve(true)
      }
      this.running = true
      const module = await this._onStart(this)

      let hadRun = false

      const doRun = (openInTerminal?: boolean) => {
        if (hadRun) {
          return
        }
        hadRun = true
        IPC.send(
          'app-fork:module-customer',
          'startService',
          JSON.parse(JSON.stringify(this)),
          module.isService,
          openInTerminal
        ).then((key: string, res: any) => {
          if (res.code === 0) {
            IPC.off(key)
            const pid = res?.data?.['APP-Service-Start-PID'] ?? ''
            this.running = false
            if (module.isService) {
              this.run = true
              this.pid = pid
            } else {
              MessageSuccess(I18nT('base.success'))
            }
            resolve(true)
          } else if (res.code === 1) {
            IPC.off(key)
            this.running = false
            this.run = false
            this.pid = ''
            MessageError(res.msg)
            resolve(res.msg)
          } else if (res.code === 200) {
            if (res?.msg?.['APP-Service-Start-Success'] === true && module.isService) {
              this.run = true
            }
          }
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
                IPC.send('app:password-check', pass).then((key: string, res: any) => {
                  IPC.off(key)
                  if (res?.code === 0) {
                    window.Server.Password = res?.data ?? pass
                    AppStore()
                      .initConfig()
                      .then(() => {
                        done()
                        doRun()
                      })
                  } else {
                    instance.editorErrorMessage = res?.msg ?? I18nT('base.passwordError')
                  }
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
        showPasswordTips()
      } else {
        doRun()
      }
    })
  }

  onStart(fn: any) {
    this._onStart = fn
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
  configPath = []
  logPath = []

  showHideWatcher: any

  constructor(item: any) {
    Object.assign(this, item)
    this.typeFlag = this.id
    const list: ModuleCustomerExecItem[] = []
    const arr: CustomerModuleExecItem[] = item?.item ?? []
    const onStart = this.onExecStart.bind(this)
    for (const i of arr) {
      const execItem = reactive(new ModuleCustomerExecItem(i))
      execItem.onStart = execItem.onStart.bind(execItem)
      execItem.stop = execItem.stop.bind(execItem)
      execItem.start = execItem.start.bind(execItem)
      execItem.onStart(onStart)
      list.push(execItem)
    }
    this.item = reactive(list)
  }

  onExecStart(item: ModuleCustomerExecItem) {
    return new Promise(async (resolve) => {
      if (!this.isOnlyRunOne || !this.isService) {
        resolve(this)
        return
      }
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
      Promise.all(this.item.map((a) => a.stop()))
        .then(() => {
          resolve(this)
        })
        .catch(() => {
          resolve(this)
        })
    })
  }

  start(): Promise<boolean | string> {
    return new Promise((resolve) => {
      if (this.isOnlyRunOne !== true) {
        Promise.all(this.item.map((a) => a.start()))
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
        .start()
        .then((res) => {
          resolve(res)
        })
        .catch((e) => {
          resolve(e.toString())
        })
    })
  }

  stop(): Promise<boolean | string> {
    return new Promise((resolve) => {
      Promise.all(this.item.map((a) => a.stop()))
        .then(() => {
          resolve(true)
        })
        .catch(() => {
          resolve(true)
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
