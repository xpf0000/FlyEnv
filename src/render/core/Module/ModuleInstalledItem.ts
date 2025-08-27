import { computed } from 'vue'
import type { AllAppModule } from '@/core/type'
import type { SoftInstalled } from '@shared/app'
import IPC from '@/util/IPC'
import { ServiceActionStore } from '@/components/ServiceManager/EXT/store'
import { Module } from '@/core/Module/Module'
import { MessageError } from '@/util/Element'
import { AppStore } from '@/store/app'
import { BrewStore } from '@/store/brew'

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

  _onStart!: (item: ModuleInstalledItem) => Promise<Module>

  constructor(json: SoftInstalled) {
    Object.assign(this, json)
  }

  // 使用箭头函数绑定 this
  start(): Promise<string | boolean> {
    return new Promise(async (resolve) => {
      if (this.run && this.pid) {
        return resolve(true)
      }
      this.running = true
      const module = await this._onStart(this)

      let params: any[] = []
      if (module?.startExtParam) {
        try {
          params = await module.startExtParam(this)
        } catch {
          this.run = false
          this.running = false
          resolve(true)
          return
        }
      }
      const error: string[] = []
      IPC.send(
        `app-fork:${this.typeFlag}`,
        'startService',
        JSON.parse(JSON.stringify(this)),
        ...params
      ).then((key: string, res: any) => {
        if (res.code === 0) {
          IPC.off(key)
          const pid = res?.data?.['APP-Service-Start-PID'] ?? ''
          this.pid = pid
          this.run = true
          this.running = false
          resolve(true)
        } else if (res.code === 1) {
          IPC.off(key)
          error.push(res.msg)
          this.pid = ''
          this.run = false
          this.running = false
          resolve(error.join('\n'))
        } else if (res.code === 200) {
          if (typeof res?.msg === 'string') {
            error.push(res.msg)
          } else if (res?.msg?.['APP-Service-Start-Success'] === true) {
            this.run = true
          }
        }
      })
    })
  }

  stop(): Promise<string | boolean> {
    return new Promise(async (resolve) => {
      if (!this.run) {
        return resolve(true)
      }
      this.running = true
      this.run = false

      const brewStore = BrewStore()
      const module = brewStore.module(this.typeFlag)
      let params: any[] = []
      if (module?.stopExtParam) {
        try {
          params = await module.stopExtParam(this)
        } catch {
          this.run = false
          this.running = false
          resolve(true)
          return
        }
      }

      IPC.send(
        `app-fork:${this.typeFlag}`,
        'stopService',
        JSON.parse(JSON.stringify(this)),
        ...params
      ).then((key: string) => {
        IPC.off(key)
        this.run = false
        this.pid = ''
        this.running = false
        resolve(true)
      })
    })
  }

  restart() {
    return new Promise(async (resolve) => {
      await this.stop()
      this.start().then(resolve)
    })
  }

  serviceDo(flag: 'stop' | 'start' | 'restart') {
    return new Promise(async (resolve) => {
      if (!this?.version || !this?.path) {
        return
      }
      let action: any
      switch (flag) {
        case 'stop':
          action = this.stop()
          break
        case 'start':
          action = this.start()
          break
        case 'restart':
          action = this.restart()
          break
      }
      action.then((res: any) => {
        if (typeof res === 'string') {
          MessageError(res)
        } else {
          if (flag === 'stop') {
            this.run = false
            this.running = false
          } else {
            this.run = true
            this.running = false
            const appStore = AppStore()
            const brewStore = BrewStore()
            const currentVersion = brewStore.currentVersion(this.typeFlag)
            if (this.version !== currentVersion?.version || this.path !== currentVersion?.path) {
              appStore.UPDATE_SERVER_CURRENT({
                flag: this.typeFlag,
                data: JSON.parse(JSON.stringify(this))
              })
              appStore.saveConfig()
            }
          }
        }
        resolve(true)
      })
    })
  }

  setEnv(): Promise<string | boolean> {
    return ServiceActionStore.updatePath(this, this.typeFlag)
  }
}
