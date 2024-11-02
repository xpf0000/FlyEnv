import IPC from './IPC'
import { BrewStore, OnlineVersionItem } from '@/store/brew'
import { MessageError } from '@/util/Element'
import { reactive } from 'vue'
import { AllAppModule } from '@/core/type'

const { existsSync } = require('fs')

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
        const list: OnlineVersionItem[] = [...saved.data]
        list.forEach((item) => {
          item.downloaded = existsSync(item.zip)
          item.installed = existsSync(item.bin)
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
              expire: Math.round(new Date().getTime() / 1000) + 24 * 60 * 60,
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
