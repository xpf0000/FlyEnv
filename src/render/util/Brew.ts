import IPC from './IPC'
import { ElMessageBox } from 'element-plus'
import { AppStore } from '@/store/app'
import { type OnlineVersionItem } from '@/store/brew'
import { I18nT } from '@lang/index'
import { MessageError } from '@/util/Element'
import type { AllAppModule } from '@/core/type'
import { fs } from '@/util/NodeFn'

let passPromptShow = false
export const showPassPrompt = () => {
  return new Promise((resolve, reject) => {
    if (passPromptShow) {
      reject(new Error('prompt had show'))
      return
    }
    passPromptShow = true
    ElMessageBox.prompt('', I18nT('base.inputPassword'), {
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
                window.Server.Password = res?.data ?? pass
                AppStore()
                  .initConfig()
                  .then(() => {
                    done()
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
 * Computer password verification, required for many operations
 * @returns {Promise<unknown>}
 */
export const passwordCheck = () => {
  return new Promise((resolve) => {
    resolve(true)
  })
}

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

export const fetchVerion = (typeFlag: AllAppModule): Promise<OnlineVersionItem[]> => {
  return new Promise(async (resolve) => {
    let saved: any = localStorage.getItem(`fetchVerion-${typeFlag}`)
    if (saved) {
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
