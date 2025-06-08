import IPC from './IPC'
import { BrewStore, OnlineVersionItem } from '@/store/brew'
import { MessageError } from '@/util/Element'
import { reactive } from 'vue'
import { AllAppModule } from '@/core/type'

const { existsSync } = require('fs')
import { join } from 'path-browserify'

export const fetchVerion = (typeFlag: AllAppModule): Promise<boolean> => {
  return new Promise((resolve) => {
    const brewStore = BrewStore()
    const currentType = brewStore.module(typeFlag)
    if (currentType.getListing) {
      resolve(true)
      return
    }
    currentType.getListing = true
    const saveKey = `fetchVerion-${typeFlag}`
    let saved: any = localStorage.getItem(saveKey)
    if (saved) {
      saved = JSON.parse(saved)
      const time = Math.round(new Date().getTime() / 1000)
      if (time < saved.expire) {
        const dataDirName = 'PhpWebStudy-Data'
        const list: OnlineVersionItem[] = [...saved.data]
        list.forEach((item) => {
          if (!item.appDir.includes(window.Server.AppDir!)) {
            const current = window.Server.AppDir!.split(dataDirName).shift()! + dataDirName
            item.appDir = current + item.appDir.split(dataDirName).pop()
            item.bin = current + item.bin.split(dataDirName).pop()
            item.zip = current + item.zip.split(dataDirName).pop()
          }
          item.downloaded = existsSync(item.zip)
          if (typeFlag === 'mariadb') {
            item.bin = join(window.Server.AppDir!, `mariadb-${item.version}`, 'bin/mariadbd.exe')
            const oldBin = join(
              window.Server.AppDir!,
              `mariadb-${item.version}`,
              `mariadb-${item.version}-winx64`,
              'bin/mariadbd.exe'
            )
            item.installed = existsSync(item.bin) || existsSync(oldBin)
          } else if (typeFlag === 'mongodb') {
            item.bin = join(window.Server.AppDir!, `mongodb-${item.version}`, 'bin/mongod.exe')
            const oldBin = join(
              window.Server.AppDir!,
              `mongodb-${item.version}`,
              `mongodb-win32-x86_64-windows-${item.version}`,
              'bin/mongodb.exe'
            )
            item.installed = existsSync(item.bin) || existsSync(oldBin)
          } else {
            item.installed = existsSync(item.bin)
          }
          Object.assign(item, currentType.installing?.[item.bin])
        })
        currentType.list.splice(0)
        currentType.list = reactive(list)
        currentType.getListing = false
        resolve(true)
        return
      }
    }

    IPC.send(`app-fork:${typeFlag}`, 'fetchAllOnLineVersion').then((key: string, res: any) => {
      IPC.off(key)
      if (res.code === 0) {
        const list = res.data
        currentType.list.splice(0)
        currentType.list = reactive(list)
        currentType.getListing = false
        if (list.length > 0) {
          localStorage.setItem(
            saveKey,
            JSON.stringify({
              expire: Math.round(new Date().getTime() / 1000) + 60 * 60,
              data: list
            })
          )
        }
        resolve(true)
      } else if (res.code === 1) {
        currentType.getListing = false
        MessageError(res.msg)
        resolve(false)
      }
    })
  })
}
