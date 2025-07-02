import { reactive } from 'vue'
import localForage from 'localforage'
import { MessageError, MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'
import type { ModuleInstalledItem } from '@/core/Module/ModuleInstalledItem'
import IPC from '@/util/IPC'
import { BrewStore } from '@/store/brew'

type MySQLDatabaseItem = {
  // database name
  name: string
  // database full role user
  user: string[]
}

type MySQLManageType = {
  rootPassword: Record<string, string>
  backupDir: Record<string, string>
  updating: Record<string, boolean>
  init: () => void
  save: () => void
  rootPasswordChange: (item: ModuleInstalledItem, password: string) => Promise<boolean>
  fetchDatabase: (item: ModuleInstalledItem) => Promise<MySQLDatabaseItem[]>
}

const MySQLManageKey = 'flyenv-mysql-manage-key'

const MySQLManage = reactive<MySQLManageType>({
  rootPassword: {},
  backupDir: {},
  updating: {},
  init() {
    localForage
      .getItem(MySQLManageKey)
      .then((res: any) => {
        if (res) {
          this.rootPassword = reactive(res?.rootPassword ?? {})
          this.backupDir = reactive(res?.backupDir ?? {})
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
    localForage.setItem(MySQLManageKey, JSON.parse(JSON.stringify(this))).catch()
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
            resolve(res?.data)
            return
          }
          MessageError(res?.msg ?? I18nT('base.fail'))
          resolve({} as any)
        }
      )
    })
  }
})

MySQLManage.init = MySQLManage.init.bind(MySQLManage)
MySQLManage.save = MySQLManage.save.bind(MySQLManage)
MySQLManage.rootPasswordChange = MySQLManage.rootPasswordChange.bind(MySQLManage)

export { MySQLManage }
