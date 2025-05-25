import type { CustomerModuleExecItem, CustomerModuleItem } from '@/core/Module'
import { reactive } from 'vue'
import IPC from '@/util/IPC'
import { MessageError } from '@/util/Element'

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

  _onStart!: (item: ModuleCustomerExecItem) => Promise<any>

  constructor(item: any) {
    Object.assign(this, item)
  }

  stop() {
    return new Promise((resolve) => {
      if (!this.run) {
        return resolve(true)
      }
      this.run = false
      IPC.send('app-fork:module-customer', 'stopService', this.pid).then((key: string) => {
        IPC.off(key)
        this.run = false
        this.pid = ''
        resolve(true)
      })
    })
  }

  start() {
    return new Promise(async (resolve, reject) => {
      if (this.run && this.pid) {
        return resolve(true)
      }
      this.running = true
      await this._onStart(this)
      IPC.send('app-fork:module-customer', 'startService', JSON.parse(JSON.stringify(this))).then(
        (key: string, res: any) => {
          if (res.code === 0) {
            IPC.off(key)
            const pid = res?.data?.['APP-Service-Start-PID'] ?? ''
            this.running = false
            this.run = true
            this.pid = pid
            resolve(true)
          } else if (res.code === 1) {
            IPC.off(key)
            this.running = false
            this.run = false
            this.pid = ''
            MessageError(res.msg)
            reject(new Error(res.msg))
          } else if (res.code === 200) {
            if (res?.msg?.['APP-Service-Start-Success'] === true) {
              this.run = true
            }
          }
        }
      )
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

  constructor(item: any) {
    Object.assign(this, item)
    this.typeFlag = this.id
    const list: ModuleCustomerExecItem[] = []
    const arr: CustomerModuleExecItem[] = item?.item ?? []
    const onStart = this.onExecStart.bind(this)
    for (const i of arr) {
      const execItem = reactive(new ModuleCustomerExecItem(i))
      execItem.onStart(onStart)
      list.push(execItem)
    }
    this.item = reactive(list)
  }

  onExecStart() {
    return new Promise(async (resolve) => {
      if (this.isOnlyRunOne !== true) {
        resolve(true)
      }
      console.log('this: ', this, this.item)
      Promise.all(this.item.map((a) => a.stop()))
        .then(() => {
          resolve(true)
        })
        .catch(() => {
          resolve(true)
        })
    })
  }

  start() {
    if (this.isOnlyRunOne !== true) {
      Promise.all(this.item.map((a) => a.start()))
        .then()
        .catch()
      return
    }
    if (this.item.length === 0) {
      return
    }
    let find = this.item.find((f) => f.id === this.currentItemID)
    if (!this.currentItemID || !find) {
      this.currentItemID = this.item[0].id
    }
    find = this.item.find((f) => f.id === this.currentItemID)
    find!.start().then().catch()
  }

  stop() {
    Promise.all(this.item.map((a) => a.stop()))
      .then()
      .catch()
  }
}

export { ModuleDefaultIcon, ModuleCustomer, ModuleCustomerExecItem }
