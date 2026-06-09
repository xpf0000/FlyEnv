import { dirname, join } from 'path'
import { existsSync } from 'fs'
import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  brewInfoJson,
  brewSearch,
  portSearch,
  readFile,
  remove,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  waitTime,
  spawnPromiseWithEnv,
  zipUnpack
} from '../../Fn'
import TaskQueue from '../../TaskQueue'
import { appDebugLog, isWindows } from '@shared/utils'
import { ProcessPidList } from '@shared/Process.win'
import EnvSync from '@shared/EnvSync'
import { powerShellInlineArgs } from '@shared/PowerShellCommand'

type WindowsPythonInstallScriptParams = {
  darkDir: string
  tmpDir: string
  exe: string
  appDir: string
}

type WindowsPipInstallScriptParams = {
  appDir: string
}

export function renderWindowsPythonInstallScript(
  template: string,
  params: WindowsPythonInstallScriptParams
): string {
  return template
    .replace(new RegExp(`#DARKDIR#`, 'g'), params.darkDir)
    .replace(new RegExp(`#TMPL#`, 'g'), params.tmpDir)
    .replace(new RegExp(`#EXE#`, 'g'), params.exe)
    .replace(new RegExp(`#APPDIR#`, 'g'), params.appDir)
}

export function renderWindowsPipInstallScript(
  template: string,
  params: WindowsPipInstallScriptParams
): string {
  return template.replace(new RegExp(`#APPDIR#`, 'g'), params.appDir)
}

async function runWindowsPowerShellInline(script: string) {
  await EnvSync.sync()
  return spawnPromiseWithEnv(
    EnvSync.PowerShellPath || 'powershell.exe',
    powerShellInlineArgs(script),
    {
      cwd: global.Server.Cache!,
      windowsHide: true
    }
  )
}

class Python extends Base {
  constructor() {
    super()
    this.type = 'python'
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('python')
        all.forEach((a: any) => {
          const dir = join(global.Server.AppDir!, `python-${a.version}`, 'python.exe')
          const zip = join(global.Server.Cache!, `python-${a.version}.exe`)
          a.appDir = join(global.Server.AppDir!, `python-${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          a.name = `Python-${a.version}`
        })
        resolve(all)
      } catch (e) {
        console.log('fetchAllOnlineVersion error: ', e)
        resolve([])
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      let all: Promise<SoftInstalled[]>[] = []
      if (isWindows()) {
        all = [versionLocalFetch(setup?.python?.dirs ?? [], 'python.exe')]
      } else {
        all = [
          versionLocalFetch(
            [
              ...(setup?.python?.dirs ?? []),
              '/opt/local/Library/Frameworks/Python.framework/Versions'
            ],
            'python',
            'python',
            ['libexec/bin/python', 'bin/python3']
          )
        ]
      }
      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `"${item.bin}" --version`
            const reg = /(Python )(.*?)(\n)/g
            return TaskQueue.run(versionBinVersion, item.bin, command, reg)
          })
          return Promise.all(all)
        })
        .then((list) => {
          list.forEach((v, i) => {
            const { error, version } = v
            const num = version
              ? Number(versionFixed(version).split('.').slice(0, 2).join(''))
              : null
            Object.assign(versions[i], {
              version: version,
              num,
              enable: version !== null,
              error
            })
          })
          resolve(versionSort(versions))
        })
        .catch(() => {
          resolve([])
        })
    })
  }

  async _installSoftHandle(row: any): Promise<void> {
    if (isWindows()) {
      const tmpDir = join(global.Server.Cache!, `python-${row.version}-tmp`)
      if (existsSync(tmpDir)) {
        await remove(tmpDir)
      }
      const dark = join(global.Server.Cache!, 'dark/dark.exe')
      const darkDir = join(global.Server.Cache!, 'dark')
      if (!existsSync(dark)) {
        const darkZip = join(global.Server.Static!, 'zip/dark.7z')
        await zipUnpack(darkZip, dirname(dark))
      }
      const pythonSH = join(global.Server.Static!, 'sh/python.ps1')
      const TMPL = tmpDir
      const EXE = row.zip
      const APPDIR = row.appDir

      const content = renderWindowsPythonInstallScript(await readFile(pythonSH, 'utf-8'), {
        darkDir,
        tmpDir: TMPL,
        exe: EXE,
        appDir: APPDIR
      })

      process.chdir(global.Server.Cache!)
      try {
        await runWindowsPowerShellInline(content)
      } catch (e: any) {
        console.log('[python-install][error]: ', e)
        await appDebugLog('[python][python-install][error]', e.toString())
      }

      const checkState = async (time = 0): Promise<boolean> => {
        let res = false
        const allProcess = await ProcessPidList()
        const find = allProcess.find(
          (p) => p?.COMMAND?.includes('msiexec.exe') && p?.COMMAND?.includes(APPDIR)
        )
        console.log('python checkState find: ', find)
        const bin = row.bin
        if (existsSync(bin) && !find) {
          res = true
        } else {
          if (time < 20) {
            await waitTime(1000)
            res = res || (await checkState(time + 1))
          }
        }
        return res
      }
      const res = await checkState()
      if (res) {
        await waitTime(1000)
        const content = renderWindowsPipInstallScript(
          await readFile(join(global.Server.Static!, 'sh/pip.ps1'), 'utf-8'),
          {
            appDir: APPDIR
          }
        )
        process.chdir(global.Server.Cache!)
        try {
          await runWindowsPowerShellInline(content)
        } catch (e: any) {
          await appDebugLog('[python][pip-install][error]', e.toString())
        }
        await waitTime(1000)
        await remove(tmpDir)
        return
      } else {
        try {
          await waitTime(500)
          await remove(APPDIR)
          await remove(tmpDir)
        } catch {}
      }
      throw new Error('Python Install Fail')
    }
  }

  brewinfo() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        let all: Array<string> = []
        const command = 'brew search -q --formula "/^python[@\\d\\.]+?$/"'
        all = await brewSearch(all, command)
        const info = await brewInfoJson(all)
        resolve(info)
      } catch (e) {
        reject(e)
        return
      }
    })
  }

  portinfo() {
    return new ForkPromise(async (resolve) => {
      const Info: { [k: string]: any } = await portSearch(
        `"^python\\d*$"`,
        (f) => {
          return f.includes('An interpreted, object-oriented programming language')
        },
        (name, version) => {
          const v = version?.split('.')?.slice(0, 2)?.join('.') ?? ''
          const dir = `/opt/local/Library/Frameworks/Python.framework/Versions/${v}/Python`
          return existsSync(dir)
        }
      )
      resolve(Info)
    })
  }
}
export default new Python()
