import IPC from './IPC'
import { ElMessageBox } from 'element-plus'
import { AppStore } from '@/store/app'
import { BrewStore, type OnlineVersionItem } from '@/store/brew'
import { I18nT } from '@shared/lang'
import { MessageError } from '@/util/Element'
import type { AllAppModule } from '@/core/type'
import { reactive } from 'vue'

const { getGlobal } = require('@electron/remote')
const { existsSync } = require('fs')

let passPromptShow = false
export const showPassPrompt = (showDesc = true) => {
  return new Promise((resolve, reject) => {
    if (passPromptShow) {
      reject(new Error('prompt had show'))
      return
    }
    passPromptShow = true
    const desc = showDesc ? I18nT('base.inputPasswordDesc') : ''
    ElMessageBox.prompt(desc, I18nT('base.inputPassword'), {
      confirmButtonText: I18nT('base.confirm'),
      cancelButtonText: I18nT('base.cancel'),
      inputType: 'password',
      customClass: 'password-prompt',
      beforeClose: (action, instance, done) => {
        if (action === 'confirm') {
          if (instance.inputValue) {
            const pass = instance.inputValue
            IPC.send('app:password-check', pass).then((key: string, res: any) => {
              IPC.off(key)
              if (res?.code === 0) {
                global.Server.Password = res?.data ?? pass
                AppStore()
                  .initConfig()
                  .then(() => {
                    done && done()
                    passPromptShow = false
                    resolve(true)
                  })
              } else {
                instance.editorErrorMessage = res?.msg ?? I18nT('base.passwordError')
              }
            })
          }
        } else {
          done()
          passPromptShow = false
          reject(new Error('user cancel'))
        }
      }
    })
      .then(() => {})
      .catch((err) => {
        console.log('err: ', err)
        reject(err)
      })
  })
}

/**
 * 电脑密码检测, 很多操作需要电脑密码
 * @returns {Promise<unknown>}
 */
export const passwordCheck = () => {
  return new Promise((resolve, reject) => {
    global.Server = getGlobal('Server')
    if (!global.Server.Password) {
      showPassPrompt().then(resolve).catch(reject)
    } else {
      resolve(true)
    }
  })
}

export function brewInfo(key: string): Promise<{ [key: string]: OnlineVersionItem }> {
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

export function portInfo(flag: string): Promise<{ [key: string]: OnlineVersionItem }> {
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

export const fetchVerion = (
  typeFlag: AllAppModule
): Promise<{ [key: string]: OnlineVersionItem }> => {
  return new Promise((resolve) => {
    let saved: any = localStorage.getItem(`fetchVerion-${typeFlag}`)
    if (saved) {
      saved = JSON.parse(saved)
      const time = Math.round(new Date().getTime() / 1000)
      if (time < saved.expire) {
        const list: { [key: string]: OnlineVersionItem } = { ...saved.data }
        for (const k in list) {
          const item = list[k]
          item.downloaded = existsSync(item.zip)
          item.installed = existsSync(item.bin)
        }
        resolve(list)
        return
      }
    }
    IPC.send(`app-fork:${typeFlag}`, 'fetchAllOnLineVersion').then((key: string, res: any) => {
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
        resolve({})
      }
    })
  })
}

export const fetchAllVersion = (typeFlag: AllAppModule) => {
  const brewStore = BrewStore()
  const module = brewStore.module(typeFlag)
  if (module.getListing) {
    return
  }
  module.getListing = true
  const all = [fetchVerion(typeFlag), brewInfo(typeFlag), portInfo(typeFlag)]
  Promise.all(all).then(([online, brew, port]: any) => {
    let list = module.list.static!
    for (const k in list) {
      delete list?.[k]
    }
    for (const name in online) {
      list[name] = reactive(online[name])
    }
    list = module.list.brew
    for (const k in list) {
      delete list?.[k]
    }
    for (const name in brew) {
      list[name] = reactive(brew[name])
    }
    list = module.list.port
    for (const k in list) {
      delete list?.[k]
    }
    for (const name in port) {
      list[name] = reactive(port[name])
    }
    module.getListing = false
  })
}
