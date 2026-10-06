import IPC from './IPC'
import { type OnlineVersionItem } from '@/store/brew'
import { MessageError } from '@/util/Element'
import type { AllAppModule } from '@/core/type'
import { fs } from '@/util/NodeFn'

export function brewInfo(key: string): Promise<OnlineVersionItem[]> {
  return new Promise((resolve, reject) => {
    IPC.send(`app-fork:${key}`, 'brewinfo', key).then((key: string, res: any) => {
      if (res.code === 0) {
        IPC.off(key)
        resolve(res.data)
      } else if (res.code === 1) {
        IPC.off(key)
        reject(new Error(res?.msg ?? ''))
      }
    })
  })
}

export function portInfo(flag: string): Promise<OnlineVersionItem[]> {
  return new Promise((resolve, reject) => {
    IPC.send(`app-fork:${flag}`, 'portinfo', flag).then((key: string, res: any) => {
      if (res.code === 0) {
        IPC.off(key)
        resolve(res.data)
      } else if (res.code === 1) {
        IPC.off(key)
        reject(new Error(res?.msg ?? ''))
      }
    })
  })
}

export function sdkmanInfo(flag: string): Promise<OnlineVersionItem[]> {
  return new Promise((resolve, reject) => {
    IPC.send(`app-fork:sdkman`, 'sdkmaninfo', flag).then((key: string, res: any) => {
      if (res.code === 0) {
        IPC.off(key)
        resolve(res.data)
      } else if (res.code === 1) {
        IPC.off(key)
        reject(new Error(res?.msg ?? ''))
      }
    })
  })
}

export const fetchVerion = (typeFlag: AllAppModule): Promise<OnlineVersionItem[]> => {
  return new Promise(async (resolve) => {
    const useCache = typeFlag !== 'flutter'
    let saved: any = localStorage.getItem(`fetchVerion-${typeFlag}`)
    if (saved && useCache) {
      saved = JSON.parse(saved)
      const time = Math.round(new Date().getTime() / 1000)
      if (time < saved.expire) {
        const list: OnlineVersionItem[] = saved.data
        if (Array.isArray(list)) {
          for (const item of list) {
            item.downloaded = await fs.existsSync(item.zip)
            item.installed = await fs.existsSync(item.bin)
          }
          resolve(list)
          return
        }
      }
    }
    IPC.send(`app-fork:${typeFlag}`, 'fetchAllOnlineVersion').then((key: string, res: any) => {
      IPC.off(key)
      if (res.code === 0) {
        const list = res.data
        if (Object.keys(list).length > 0) {
          localStorage.setItem(
            `fetchVerion-${typeFlag}`,
            JSON.stringify({
              expire: Math.round(new Date().getTime() / 1000) + 60 * 60,
              data: list
            })
          )
        }
        resolve(list)
      } else if (res.code === 1) {
        MessageError(res.msg)
        resolve([])
      }
    })
  })
}
