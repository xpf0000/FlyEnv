import { exec as Sudo } from '@shared/Sudo'
import { dirname, join, resolve as PathResolve } from 'path'
import is from 'electron-is'
import { isLinux, isMacOS } from '@shared/utils'
import { AppHelperCheck } from '@shared/AppHelperCheck'

type AppHelperCallback = (
  state: 'needInstall' | 'installing' | 'installed' | 'installFaild' | 'checkSuccess'
) => void

export class AppHelper {
  state: 'normal' | 'installing' | 'installed' = 'normal'
  version = 7

  private _onMessage?: AppHelperCallback

  onStatusMessage(fn: AppHelperCallback) {
    this._onMessage = fn
  }

  command() {
    let command = ''
    let icns = ``
    if (is.production()) {
      if (isMacOS()) {
        const binDir = PathResolve(global.Server.Static!, '../../../../')
        const plist = join(binDir, 'plist/com.flyenv.helper.plist')
        const bin = join(binDir, 'helper/flyenv-helper')
        command = `cd "${join(binDir, 'helper')}" && sudo chmod 777 ./flyenv-helper-init.sh && sudo ./flyenv-helper-init.sh "${plist}" "${bin}"`
        icns = join(binDir, 'icon.icns')
      } else if (isLinux()) {
        const binDir = PathResolve(global.Server.Static!, '../../../../')
        const bin = join(binDir, 'helper/flyenv-helper')
        command = `cd "${join(binDir, 'helper')}" && sudo chmod 777 ./flyenv-helper-init.sh && sudo ./flyenv-helper-init.sh "${bin}"`
        icns = join(binDir, 'Icon@256x256.icns')
      }
    } else {
      if (isMacOS()) {
        const binDir = PathResolve(global.Server.Static!, '../../../build/')
        const plist = join(binDir, 'plist/com.flyenv.helper.plist')
        const bin = join(binDir, 'bin', global.Server.isArmArch ? 'arm' : 'x86', 'flyenv-helper')
        command = `cd "${dirname(bin)}" && sudo chmod 777 ./flyenv-helper-init.sh && sudo ./flyenv-helper-init.sh "${plist}" "${bin}"`
        icns = join(binDir, 'icon.icns')
      } else if (isLinux()) {
        const binDir = PathResolve(global.Server.Static!, '../../../build/')
        const bin = join(binDir, 'bin', global.Server.isArmArch ? 'arm' : 'x86', 'flyenv-helper')
        const shDir = join(global.Server.Static!, 'sh')
        command = `cd "${shDir}" && sudo chmod 777 ./flyenv-helper-init.sh && sudo ./flyenv-helper-init.sh "${bin}"`
        icns = join(binDir, 'Icon@256x256.icns')
      }
    }

    return {
      command,
      icns
    }
  }

  initHelper() {
    return new Promise(async (resolve, reject) => {
      if (this.state !== 'normal') {
        if (this.state === 'installing') {
          this?._onMessage?.('installing')
        } else if (this.state === 'installed') {
          this?._onMessage?.('installed')
        }
        reject(new Error('Please Wait'))
        return
      }
      try {
        await AppHelperCheck()
        this.state = 'normal'
        this?._onMessage?.('checkSuccess')
        resolve(true)
        return
      } catch {}

      this?._onMessage?.('needInstall')
      const doChech = (time = 0) => {
        if (time > 9) {
          this.state = 'normal'
          reject(new Error('Install helper failed'))
          this?._onMessage?.('installFaild')
          return
        }
        AppHelperCheck()
          .then(() => {
            this.state = 'normal'
            this?._onMessage?.('checkSuccess')
            resolve(true)
          })
          .catch(() => {
            setTimeout(() => {
              doChech(time + 1)
            }, 500)
          })
      }

      this.state = 'installing'

      const { command, icns } = this.command()

      Sudo(command, {
        name: 'FlyEnv',
        icns: icns,
        dir: global.Server.Cache!
      })
        .then(({ stdout, stderr }) => {
          console.log('initHelper: ', stdout, stderr)
          this.state = 'installed'
          doChech()
        })
        .catch((e) => {
          console.log('initHelper err: ', e)
          this.state = 'normal'
          this?._onMessage?.('installFaild')
          reject(e)
        })
    })
  }
}
export default new AppHelper()
