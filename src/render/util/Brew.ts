import { execAsync } from '@shared/utils'
import IPC from './IPC'
import Base from '@/core/Base'
import { ElMessageBox } from 'element-plus'
import { chmod } from '@shared/file'
import XTerm from '@/util/XTerm'
import { AppStore } from '@/store/app'
import { BrewStore } from '@/store/brew'
import { I18nT } from '@shared/lang'
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
      ElMessageBox.prompt(I18nT('base.inputPassword'), {
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
        if (!global.Server.BrewHome) {
          const brewStore = BrewStore()
          const appStore = AppStore()
          if (!brewStore.brewRunning) {
            Base.ConfirmInfo(I18nT('util.noBrewTips'))
              .then(() => {
                brewStore.brewRunning = true
                const log = brewStore.log
                log.splice(0)
                brewStore.showInstallLog = true

                const sh = join(global.Server.Static, 'sh/brew-install.sh')
                const copyfile = join(global.Server.Cache, 'brew-install.sh')
                if (existsSync(copyfile)) {
                  unlinkSync(copyfile)
                }
                copyFileSync(sh, copyfile)
                chmod(copyfile, '0777')
                let params = copyfile + ' ' + global.Server.Password + ';exit 0;'

                const proxy = appStore.config.setup.proxy
                if (proxy?.on) {
                  const proxyStr = proxy?.proxy
                  if (proxyStr) {
                    params = `${proxyStr};${params}`
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
                      Base.MessageError(I18nT('util.brewInstallFail')).then()
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

export function brewInstalledList() {
  return new Promise((resolve) => {
    brewCheck().then(() => {
      execAsync('brew', ['ls']).then((res: string) => {
        const arr = res
          .split('\n==> Casks')[0]
          .replace('==> Formulae\n', '')
          .trim()
          .split('\n')
          .filter((r) => {
            return r.length > 0
          })
        resolve(arr)
      })
    })
  })
}

const SearchExclude = ['shivammathur/php/php']

export function brewSearchList(key: string) {
  return new Promise((resolve) => {
    brewCheck().then(() => {
      execAsync('brew', ['search', `/${key}\[@\]\?/`]).then((res: string) => {
        const arr = res
          .split('\n==> Casks')[0]
          .replace('==> Formulae\n', '')
          .trim()
          .split('\n')
          .filter((r) => {
            return r.length > 0 && (SearchExclude.includes(r) || r === key || r.includes(`${key}@`))
          })
        resolve(arr)
      })
    })
  })
}

export function brewInfo(keys: Array<string>) {
  return new Promise((resolve, reject) => {
    IPC.send('app-fork:brew', 'brewinfo', JSON.parse(JSON.stringify(keys))).then(
      (key: string, res: any) => {
        if (res.code === 0) {
          IPC.off(key)
          resolve(res.data)
        } else if (res.code === 1) {
          IPC.off(key)
          reject(new Error(res))
        }
      }
    )
  })
}
