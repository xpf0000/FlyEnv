import { exec as Sudo } from '@shared/Sudo'
import { join, resolve as PathResolve, basename, dirname } from 'node:path'
import is from 'electron-is'
import { appDebugLog, isLinux, isMacOS, isWindows, uuid } from '@shared/utils'
import {
  AppHelperCheck,
  getWindowsHelperBinaryPath,
  windowsHelperBinaryExists
} from '@shared/AppHelperCheck'
import { AppHelperError, isAppHelperError } from '@shared/WindowsHelperState'
import { tmpdir, userInfo } from 'node:os'
import { copyFile, chmod, mkdirp, readFile, writeFile } from '@shared/fs-extra'
import type { CallbackFn } from '@shared/app'

type AppHelperMessage = {
  state: 'needInstall' | 'installing' | 'installed' | 'installFaild' | 'checkSuccess'
  reason?: string
}

type AppHelperCallback = (message: AppHelperMessage) => void

type AppHelperDeps = {
  appHelperCheck: typeof AppHelperCheck
  sudo: typeof Sudo
}

const defaultAppHelperDeps: AppHelperDeps = {
  appHelperCheck: AppHelperCheck,
  sudo: Sudo
}

export class AppHelper {
  state: 'normal' | 'installing' | 'installed' = 'normal'

  private _onMessage?: AppHelperCallback

  private _onSuduExecSuccess?: CallbackFn

  constructor(private readonly deps: AppHelperDeps = defaultAppHelperDeps) {}

  onStatusMessage(fn: AppHelperCallback) {
    this._onMessage = fn
  }

  onSuduExecSuccess(fn: CallbackFn) {
    this._onSuduExecSuccess = fn
  }

  private emitStatus(state: AppHelperMessage['state'], reason?: string) {
    this._onMessage?.({ state, reason })
  }

  async command() {
    let command = ''
    let icns = ``

    const tmpDir = join(tmpdir(), uuid())
    const dataPath = dirname(global.Server.AppDir!)
    const appRoot = PathResolve(global.Server.Static!, '../../../../')
    await mkdirp(tmpDir)
    await chmod(tmpDir, '0755')
    if (is.production()) {
      if (isMacOS()) {
        const uinfo = userInfo()
        const role = `${uinfo.uid}:${uinfo.gid}`
        const binDir = PathResolve(global.Server.Static!, '../../../../')
        const plist = join(binDir, 'plist/com.flyenv.helper.plist')
        const bin = join(binDir, 'helper/flyenv-helper')
        const shDir = join(binDir, 'helper')
        const shFile = join(shDir, 'flyenv-helper-init.sh')

        const tmpFile = join(tmpDir, `${uuid()}.sh`)
        await copyFile(shFile, tmpFile)
        await chmod(tmpFile, '0755')

        const tmpPlist = join(tmpDir, `${uuid()}.plist`)
        await copyFile(plist, tmpPlist)
        await chmod(tmpPlist, '0755')

        const tmpBin = join(tmpDir, `${uuid()}.helper`)
        await copyFile(bin, tmpBin)
        await chmod(tmpBin, '0755')

        command = `cd "${tmpDir}" && sudo /bin/zsh ./${basename(tmpFile)} "${tmpPlist}" "${tmpBin}" "${role}" "${dataPath}" "${appRoot}" && sudo rm -rf "${tmpDir}"`
        icns = join(binDir, 'icon.icns')
      } else if (isLinux()) {
        const uinfo = userInfo()
        const role = `${uinfo.uid}:${uinfo.gid}`
        const binDir = PathResolve(global.Server.Static!, '../../../../')
        const bin = join(binDir, 'helper/flyenv-helper')
        const shDir = join(binDir, 'helper')
        const shFile = join(shDir, 'flyenv-helper-init.sh')

        const tmpFile = join(tmpDir, `${uuid()}.sh`)
        await copyFile(shFile, tmpFile)
        await chmod(tmpFile, '0755')

        const tmpBin = join(tmpDir, `${uuid()}.helper`)
        await copyFile(bin, tmpBin)
        await chmod(tmpBin, '0755')

        command = `cd "${tmpDir}" && sudo /bin/bash ./${basename(tmpFile)} "${tmpBin}" "${role}" "${dataPath}" "${appRoot}" && sudo rm -rf "${tmpDir}"`
        icns = join(binDir, 'Icon@256x256.icns')
      } else if (isWindows()) {
        if (!windowsHelperBinaryExists()) {
          throw new AppHelperError(
            'helper_binary_missing',
            `Windows helper binary missing: ${getWindowsHelperBinaryPath()}`
          )
        }
        const binDir = PathResolve(global.Server.Static!, '../../../../')
        const bin = getWindowsHelperBinaryPath()
        const tmpl = await readFile(
          join(global.Server.Static!, 'sh/flyenv-auto-start-now.ps1'),
          'utf-8'
        )
        const content = tmpl
          .replace('#TASKNAME#', 'FlyEnvHelperTask')
          .replace('#SRCEXECPATH#', '')
          .replace('#EXECPATH#', bin)
          .replace('#DATAPATH#', dataPath)
        const tmpFile = join(tmpDir, `${uuid()}.ps1`)
        await writeFile(tmpFile, '\ufeff' + content)
        command = `"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "try { Unblock-File -LiteralPath '${tmpFile}'; & '${tmpFile}' } finally { Remove-Item -LiteralPath '${tmpDir}' -Recurse -Force -ErrorAction SilentlyContinue }"`
        icns = join(binDir, 'icon.icns')
      }
    } else {
      if (isMacOS()) {
        const uinfo = userInfo()
        const role = `${uinfo.uid}:${uinfo.gid}`
        const helperFile = global.Server.isArmArch
          ? 'flyenv-helper-darwin-arm64'
          : 'flyenv-helper-darwin-amd64'
        const binDir = PathResolve(global.Server.Static!, '../../../build/')
        const plist = join(binDir, 'plist/com.flyenv.helper.plist')
        const bin = PathResolve(binDir, `../src/helper-go/dist/${helperFile}`)
        const shDir = join(global.Server.Static!, 'sh')
        const shFile = join(shDir, 'flyenv-helper-init.sh')

        const tmpFile = join(tmpDir, `${uuid()}.sh`)
        await copyFile(shFile, tmpFile)
        await chmod(tmpFile, '0755')

        const tmpPlist = join(tmpDir, 'com.flyenv.helper.plist')
        await copyFile(plist, tmpPlist)
        await chmod(tmpPlist, '0755')

        const tmpBin = join(tmpDir, helperFile)
        await copyFile(bin, tmpBin)
        await chmod(tmpBin, '0755')

        command = `cd "${tmpDir}" && sudo /bin/zsh ./${basename(tmpFile)} "${tmpPlist}" "${tmpBin}" "${role}" "${dataPath}" "${appRoot}" && sudo rm -rf "${tmpDir}"`
        icns = join(binDir, 'icon.icns')
      } else if (isLinux()) {
        const uinfo = userInfo()
        const role = `${uinfo.uid}:${uinfo.gid}`
        const helperFile = global.Server.isArmArch
          ? 'flyenv-helper-linux-arm64'
          : 'flyenv-helper-linux-amd64-v1'
        const binDir = PathResolve(global.Server.Static!, '../../../build/')
        const bin = PathResolve(binDir, `../src/helper-go/dist/${helperFile}`)
        const shDir = join(global.Server.Static!, 'sh')
        const shFile = join(shDir, 'flyenv-helper-init.sh')

        const tmpFile = join(tmpDir, `${uuid()}.sh`)
        await copyFile(shFile, tmpFile)
        await chmod(tmpFile, '0755')

        const tmpBin = join(tmpDir, helperFile)
        await copyFile(bin, tmpBin)
        await chmod(tmpBin, '0755')

        command = `cd "${tmpDir}" && sudo /bin/bash ./${basename(tmpFile)} "${tmpBin}" "${role}" "${dataPath}" "${appRoot}" && sudo rm -rf "${tmpDir}"`
        icns = join(binDir, 'Icon@256x256.icns')
      } else if (isWindows()) {
        if (!windowsHelperBinaryExists()) {
          throw new AppHelperError(
            'helper_binary_missing',
            `Windows helper binary missing: ${getWindowsHelperBinaryPath()}`
          )
        }
        const binDir = PathResolve(global.Server.Static!, '../../../build/')
        const bin = getWindowsHelperBinaryPath()
        const tmpl = await readFile(
          join(global.Server.Static!, 'sh/flyenv-auto-start-now.ps1'),
          'utf-8'
        )
        const content = tmpl
          .replace('#TASKNAME#', 'FlyEnvHelperTask')
          .replace('#SRCEXECPATH#', '')
          .replace('#EXECPATH#', bin)
          .replace('#DATAPATH#', dataPath)

        const tmpFile = join(tmpDir, `${uuid()}.ps1`)
        await writeFile(tmpFile, '\ufeff' + content)
        command = `"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "try { Unblock-File -LiteralPath '${tmpFile}'; & '${tmpFile}' } finally { Remove-Item -LiteralPath '${tmpDir}' -Recurse -Force -ErrorAction SilentlyContinue }"`
        icns = join(binDir, 'icon.icns')
      }
    }

    return {
      command,
      icns
    }
  }

  needInstall() {
    if (this.state === 'normal') {
      this.emitStatus('needInstall')
    }
  }

  initHelper() {
    return new Promise(async (resolve, reject) => {
      if (this.state !== 'normal') {
        if (this.state === 'installing') {
          this.emitStatus('installing')
        } else if (this.state === 'installed') {
          this.emitStatus('installed')
        }
        reject(new Error('Please Wait'))
        return
      }
      try {
        await this.deps.appHelperCheck()
        this.state = 'normal'
        this.emitStatus('checkSuccess')
        resolve(true)
        return
      } catch (error) {
        if (isAppHelperError(error, 'helper_binary_missing')) {
          this.state = 'normal'
          this.emitStatus('installFaild', error.code)
          reject(error)
          return
        }
      }

      this.emitStatus('needInstall')
      const doChech = (time = 0) => {
        if (time > 9) {
          this.state = 'normal'
          reject(new Error('Install helper failed'))
          this.emitStatus('installFaild')
          return
        }
        this.deps
          .appHelperCheck()
          .then(() => {
            this.state = 'normal'
            this.emitStatus('checkSuccess')
            this?._onSuduExecSuccess?.()
            resolve(true)
          })
          .catch(() => {
            setTimeout(() => {
              doChech(time + 1)
            }, 500)
          })
      }

      try {
        this.state = 'installing'
        this.emitStatus('installing')
        const { command, icns } = await this.command()
        this.deps
          .sudo(command, {
            name: 'FlyEnv',
            icns: icns
          })
          .then(({ stdout, stderr }) => {
            console.log('initHelper: ', stdout, stderr)
            this.state = 'installed'
            doChech()
          })
          .catch((e) => {
            appDebugLog('[AppHelper][initHelper][error]', `${e})}`).catch()
            console.log('initHelper err: ', e)
            this.state = 'normal'
            this.emitStatus('installFaild', isAppHelperError(e) ? e.code : undefined)
            reject(e)
          })
      } catch (error) {
        this.state = 'normal'
        this.emitStatus('installFaild', isAppHelperError(error) ? error.code : undefined)
        reject(error)
      }
    })
  }
}

export const createAppHelper = (deps: Partial<AppHelperDeps> = {}) => {
  return new AppHelper({
    ...defaultAppHelperDeps,
    ...deps
  })
}

export default createAppHelper()
