import IPC from './IPC'
import Base from '@/core/Base'
import { ElMessageBox } from 'element-plus'
import { chmod } from '@shared/file'
import XTerm from '@/util/XTerm'
import { AppStore } from '@/store/app'
import { BrewStore, type OnlineVersionItem } from '@/store/brew'
import { I18nT } from '@shared/lang'
import { MessageError } from '@/util/Element'
import type { AllAppModule } from '@/core/type'
import { reactive } from 'vue'

const { getGlobal } = require('@electron/remote')
const { join } = require('path')
const { existsSync, unlinkSync, copyFileSync } = require('fs')

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

/**
 * 检测brew是否安装
 * @returns {Promise<unknown>}
 */
export const brewCheck = () => {
  return new Promise((resolve, reject) => {
    passwordCheck()
      .then(() => {
        if (!global.Server.BrewCellar && !global.Server.MacPorts) {
          const brewStore = BrewStore()
          const appStore = AppStore()
          if (!brewStore.brewRunning) {
            Base.ConfirmInfo(I18nT('util.noBrewTips'))
              .then(() => {
                brewStore.brewRunning = true
                const log = brewStore.log
                log.splice(0)
                brewStore.showInstallLog = true

                const sh = join(
                  global.Server.Static,
                  `sh/brew-install${I18nT('base.brewInstallLang')}.sh`
                )
                const copyfile = join(global.Server.Cache, 'brew-install.sh')
                if (existsSync(copyfile)) {
                  unlinkSync(copyfile)
                }
                copyFileSync(sh, copyfile)
                chmod(copyfile, '0777')
                const params = [`sudo -S ${copyfile}; exit 0`, global.Server.Password!]

                const proxy = appStore.config.setup.proxy
                if (proxy?.on) {
                  const proxyStr = proxy?.proxy
                  if (proxyStr) {
                    params.unshift(proxyStr)
                  }
                }

                XTerm.send(params).then((key: string) => {
                  IPC.off(key)
                  IPC.send('app-fork:brew', 'installBrew').then((key: string, info: any) => {
                    console.log('key: ', key, 'info: ', info)
                    if (info.code === 0) {
                      IPC.off(key)
                      brewStore.showInstallLog = false
                      brewStore.brewRunning = false
                      global.Server = info.data
                      resolve(true)
                    } else if (info.code === 1) {
                      IPC.off(key)
                      brewStore.showInstallLog = false
                      brewStore.brewRunning = false
                      MessageError(I18nT('util.brewInstallFail'))
                      reject(new Error(I18nT('util.brewInstallFail')))
                    }
                  })
                })
              })
              .catch(() => {
                reject(new Error(I18nT('util.userNoInstall')))
              })
          }
        } else {
          resolve(true)
        }
      })
      .catch((e) => {
        reject(e)
      })
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
              expire: Math.round(new Date().getTime() / 1000) + 24 * 60 * 60,
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
