import { reactive } from 'vue'
import localForage from 'localforage'
import { MessageError, MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'
import type { ModuleInstalledItem } from '@/core/Module/ModuleInstalledItem'
import IPC from '@/util/IPC'
import { BrewStore } from '@/store/brew'
import { waitTime } from '@/util/Index'

export type MySQLDatabaseItem = {
  name: string
  users: string[]
}

export type MySQLDatabaseSavedItem = {
  database: string
  user: string
  password: string
  mark: string
}

type MySQLManageType = {
  rootPassword: Record<string, string>
  backupDir: Record<string, string>
  updating: Record<string, boolean>
  databaseRaw: MySQLDatabaseItem[]
  databaseSaved: Record<string, MySQLDatabaseSavedItem[]>
  init: () => void
  save: () => void
  rootPasswordChange: (item: ModuleInstalledItem, password: string) => Promise<boolean>
  fetchDatabase: (item: ModuleInstalledItem) => Promise<MySQLDatabaseItem[]>
  addDatabase: (item: ModuleInstalledItem, data: any) => Promise<boolean>
}

const MySQLManageKey = 'flyenv-mysql-manage-key'

const MySQLManage = reactive<MySQLManageType>({
  rootPassword: {},
  backupDir: {},
  updating: {},
  databaseRaw: [],
  databaseSaved: {},
  init() {
    localForage
      .getItem(MySQLManageKey)
      .then((res: any) => {
        if (res) {
          this.rootPassword = reactive(res?.rootPassword ?? {})
          this.backupDir = reactive(res?.backupDir ?? {})
          this.databaseSaved = reactive(res?.databaseSaved ?? [])
          const brewStore = BrewStore()
          const items = brewStore.module('mysql').installed
          for (const item of items) {
            item.rootPassword = this.rootPassword?.[item.bin] ?? 'root'
          }
        }
      })
      .catch()
  },
  save() {
    const data = JSON.parse(JSON.stringify(this))
    delete data.databaseRaw
    localForage.setItem(MySQLManageKey, data).catch()
  },
  rootPasswordChange(item: ModuleInstalledItem, password: string): Promise<boolean> {
    return new Promise<boolean>(async (resolve) => {
      if (this.updating?.[item.bin]) {
        return resolve(false)
      }
      if (!password) {
        MessageError(I18nT('mysql.passwordNoEmpty'))
        return resolve(false)
      }
      const regex = /['"，。？！；：“”‘’（）【】《》￥&\u4e00-\u9fa5]+/g
      if (regex.test(password)) {
        MessageError(I18nT('mysql.passwordFormatError'))
        return resolve(false)
      }
      this.updating[item.bin] = true
      try {
        await item.stop()
      } catch {}
      await waitTime(1500)
      IPC.send(
        'app-fork:mysql',
        'rootPasswordChange',
        JSON.parse(JSON.stringify(item)),
        password
      ).then((key: string, res: any) => {
        IPC.off(key)
        delete this.updating?.[item.bin]
        if (res?.code === 0) {
          item.rootPassword = password
          this.rootPassword[item.bin] = password
          this.save()
          MessageSuccess(I18nT('base.success'))
          resolve(true)
          return
        }
        MessageError(res?.msg ?? I18nT('base.fail'))
        resolve(false)
      })
    })
  },
  fetchDatabase(item: ModuleInstalledItem): Promise<MySQLDatabaseItem[]> {
    return new Promise<MySQLDatabaseItem[]>((resolve) => {
      IPC.send('app-fork:mysql', 'getDatabasesWithUsers', JSON.parse(JSON.stringify(item))).then(
        (key: string, res: any) => {
          IPC.off(key)
          if (res?.code === 0) {
            console.log('fetchDatabase: ', res?.data)
            this.databaseRaw = reactive(res?.data?.list ?? [])
            const saved = this.databaseSaved?.[item.bin]
            if (saved) {
              this.databaseSaved[item.bin] = saved.filter((d) => {
                return this.databaseRaw.some((r) => d.database === r.name)
              })
              this.save()
            }
            resolve(res?.data)
            return
          }
          MessageError(res?.msg ?? I18nT('base.fail'))
          resolve({} as any)
        }
      )
    })
  },
  addDatabase(item: ModuleInstalledItem, data: any) {
    return new Promise(async (resolve, reject) => {
      if (!item.run) {
        const res = await item.start()
        if (typeof res === 'string') {
          MessageError(res)
          return reject(new Error(res))
        }
      }
      await waitTime(1000)
      IPC.send(
        'app-fork:mysql',
        'addDatabase',
        JSON.parse(JSON.stringify(item)),
        JSON.parse(JSON.stringify(data))
      ).then((key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          let saved = this.databaseSaved?.[item.bin]
          if (!saved) {
            this.databaseSaved[item.bin] = reactive([])
            saved = this.databaseSaved[item.bin]
          }
          saved.push(reactive(data))
          this.save()
          this.fetchDatabase(item).catch()
          MessageSuccess(I18nT('base.success'))
          resolve(true)
          return
        }
        MessageError(res?.msg ?? I18nT('base.fail'))
        reject(new Error(I18nT('base.fail')))
      })
    })
  }
})

MySQLManage.init = MySQLManage.init.bind(MySQLManage)
MySQLManage.save = MySQLManage.save.bind(MySQLManage)
MySQLManage.rootPasswordChange = MySQLManage.rootPasswordChange.bind(MySQLManage)
MySQLManage.fetchDatabase = MySQLManage.fetchDatabase.bind(MySQLManage)
MySQLManage.addDatabase = MySQLManage.addDatabase.bind(MySQLManage)

export { MySQLManage }
