import IPC from './IPC'
import { ElMessageBox } from 'element-plus'
import { AllAppSofts, AppStore } from '@/store/app'
import { BrewStore, OnlineVersionItem } from '@/store/brew'
import { I18nT } from '@shared/lang'
import { MessageError } from '@/util/Element'
import { reactive } from 'vue'

const { getGlobal } = require('@electron/remote')
const { existsSync } = require('fs')

/**
 * 电脑密码检测, 很多操作需要电脑密码
 * @returns {Promise<unknown>}
 */
export const passwordCheck = () => {
  return new Promise((resolve, reject) => {
    global.Server = getGlobal('Server')
    if (!global.Server.Password) {
      ElMessageBox.prompt(I18nT('base.inputPasswordDesc'), I18nT('base.inputPassword'), {
        confirmButtonText: I18nT('base.confirm'),
        cancelButtonText: I18nT('base.cancel'),
        inputType: 'password',
        customClass: 'password-prompt',
        beforeClose: (action, instance, done) => {
          if (action === 'confirm') {
            // 去除trim, 有些电脑的密码是空格...
            if (instance.inputValue) {
              IPC.send('app:password-check', instance.inputValue).then((key: string, res: any) => {
                IPC.off(key)
                if (res === false) {
                  instance.editorErrorMessage = I18nT('base.passwordError')
                } else {
                  global.Server.Password = res
                  AppStore()
                    .initConfig()
                    .then(() => {
                      done && done()
                      resolve(true)
                    })
                }
              })
            }
          } else {
            done()
          }
        }
      })
        .then(() => {})
        .catch((err) => {
          console.log('err: ', err)
          reject(err)
        })
    } else {
      resolve(true)
    }
  })
}

export function brewInfo(key: string) {
  return new Promise((resolve, reject) => {
    IPC.send('app-fork:brew', 'brewinfo', key).then((key: string, res: any) => {
      if (res.code === 0) {
        IPC.off(key)
        resolve(res.data)
      } else if (res.code === 1) {
        IPC.off(key)
        reject(new Error(res))
      }
    })
  })
}

export function portInfo(flag: string) {
  return new Promise((resolve, reject) => {
    IPC.send('app-fork:brew', 'portinfo', flag).then((key: string, res: any) => {
      if (res.code === 0) {
        IPC.off(key)
        resolve(res.data)
      } else if (res.code === 1) {
        IPC.off(key)
        reject(new Error(res))
      }
    })
  })
}

export const fetchVerion = (typeFlag: AllAppSofts): Promise<boolean> => {
  return new Promise((resolve) => {
    const brewStore = BrewStore()
    const currentType = brewStore[typeFlag]
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
      if(time < saved.expire) {
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
          localStorage.setItem(saveKey, JSON.stringify({
            expire: Math.round(new Date().getTime() / 1000) + (24 * 60 * 60),
            data: list
          }))
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
