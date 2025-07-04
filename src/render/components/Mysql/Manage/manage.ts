import { reactive } from 'vue'
import localForage from 'localforage'
import { MessageError, MessageSuccess, MessageWarning } from '@/util/Element'
import { I18nT } from '@lang/index'
import type { ModuleInstalledItem } from '@/core/Module/ModuleInstalledItem'
import IPC from '@/util/IPC'
import { BrewStore } from '@/store/brew'
import { waitTime } from '@/util/Index'
import { dialog, shell } from '@/util/NodeFn'

export type MySQLDatabaseItem = {
  name: string
  users: string[]
}

export type MySQLDatabaseSavedItem = {
  database: string
  user: string
  mark: string
}

export type MySQLUserItem = Record<string, string>

type MySQLManageType = {
  userPassword: Record<string, MySQLUserItem>
  backupDir: Record<string, string>
  updating: Record<string, boolean>
  backuping: Record<string, boolean>
  databaseRaw: MySQLDatabaseItem[]
  databaseSaved: Record<string, MySQLDatabaseSavedItem[]>
  init: () => void
  save: () => void
  passwordChange: (item: ModuleInstalledItem, user: string, password: string) => Promise<boolean>
  fetchDatabase: (item: ModuleInstalledItem) => Promise<MySQLDatabaseItem[]>
  addDatabase: (item: ModuleInstalledItem, data: any) => Promise<boolean>
  backupDatabase: (item: ModuleInstalledItem, databases: string[]) => Promise<boolean>
}

const MySQLManageKey = 'flyenv-mysql-manage-key'

const MySQLManage = reactive<MySQLManageType>({
  userPassword: {},
  backupDir: {},
  updating: {},
  backuping: {},
  databaseRaw: [],
  databaseSaved: {},
  init() {
    localForage
      .getItem(MySQLManageKey)
      .then((res: any) => {
        if (res) {
          this.userPassword = reactive(res?.userPassword ?? {})
          this.backupDir = reactive(res?.backupDir ?? {})
          this.databaseSaved = reactive(res?.databaseSaved ?? [])
          const brewStore = BrewStore()
          const items = brewStore.module('mysql').installed
          for (const item of items) {
            item.rootPassword = this.userPassword?.[item.bin]?.root ?? 'root'
          }
        }
      })
      .catch()
  },
  save() {
    const data = JSON.parse(JSON.stringify(this))
    delete data.databaseRaw
    delete data.updating
    delete data.backuping
    localForage.setItem(MySQLManageKey, data).catch()
  },
  backupDatabase(item: ModuleInstalledItem, databases: string[]) {
    return new Promise<boolean>(async (resolve, reject) => {
      if (this.backuping?.[item.bin] || databases.length === 0) {
        return resolve(false)
      }
      let saveDir = this.backupDir?.[item.bin]
      if (!saveDir) {
        const { canceled, filePaths } = await dialog.showOpenDialog({
          properties: ['openDirectory', 'createDirectory', 'showHiddenFiles']
        })
        if (canceled) {
          return reject(new Error('user canceled'))
        }
        saveDir = filePaths[0]
      }
      this.backuping[item.bin] = true

      if (!item.run) {
        const res = await item.start()
        if (typeof res === 'string') {
          MessageError(res)
          delete this.backuping[item.bin]
          return reject(new Error(res))
        }
      }
      await waitTime(1000)

      IPC.send(
        'app-fork:mysql',
        'backupDatabase',
        JSON.parse(JSON.stringify(item)),
        JSON.parse(JSON.stringify(databases)),
        saveDir
      ).then((key: string, res: any) => {
        IPC.off(key)
        delete this.backuping[item.bin]
        if (res?.code === 0) {
          if (res?.data?.length === 0) {
            MessageSuccess(I18nT('base.success'))
          } else {
            MessageWarning(res?.data?.join('\n') ?? '')
          }
          shell.openPath(saveDir)
          return
        }
        MessageError(res?.msg ?? I18nT('base.fail'))
        resolve(false)
      })
    })
  },
  passwordChange(item: ModuleInstalledItem, user: string, password: string): Promise<boolean> {
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
        'passwordChange',
        JSON.parse(JSON.stringify(item)),
        user,
        password
      ).then((key: string, res: any) => {
        IPC.off(key)
        delete this.updating?.[item.bin]
        if (res?.code === 0) {
          if (user === 'root') {
            item.rootPassword = password
          }
          if (!this.userPassword?.[item.bin]) {
            this.userPassword[item.bin] = reactive({})
          }
          this.userPassword[item.bin][user] = password
          this.save()
          MessageSuccess(I18nT('base.success'))
          item
            .start()
            .then((res) => {
              if (typeof res === 'string') {
                MessageError(res)
              }
            })
            .catch()
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
            const allUser: any = res?.data?.allUsers ?? []
            const users = allUser.map((u: any) => u.User)
            const userPassword = this.userPassword?.[item.bin]
            let changed = false
            if (userPassword && users.length) {
              for (const u in userPassword) {
                if (!users.includes(u)) {
                  changed = true
                  delete userPassword[u]
                }
              }
            }
            const saved = this.databaseSaved?.[item.bin]
            if (saved && users.length) {
              this.databaseSaved[item.bin] = saved.filter((d) => {
                const find = this.databaseRaw.some((r) => d.database === r.name)
                if (!find) {
                  changed = true
                }
                return find
              })
            }
            if (changed) {
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
          saved.unshift(
            reactive({
              database: data.database,
              user: data.user,
              mark: ''
            })
          )

          let userPassword = this.userPassword?.[item.bin]
          if (!userPassword) {
            this.userPassword[item.bin] = reactive({})
            userPassword = this.userPassword[item.bin]
          }
          userPassword[data.user] = data.password

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
MySQLManage.passwordChange = MySQLManage.passwordChange.bind(MySQLManage)
MySQLManage.fetchDatabase = MySQLManage.fetchDatabase.bind(MySQLManage)
MySQLManage.addDatabase = MySQLManage.addDatabase.bind(MySQLManage)
MySQLManage.backupDatabase = MySQLManage.backupDatabase.bind(MySQLManage)

export { MySQLManage }
