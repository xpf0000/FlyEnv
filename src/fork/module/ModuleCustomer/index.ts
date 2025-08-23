import { basename, join } from 'path'
import {
  customerServiceStartExec,
  execPromise,
  uuid,
  waitPidFile,
  waitTime,
  chmod,
  mkdirp,
  remove,
  writeFile,
  customerServiceStartExecWin,
  copyFile
} from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import Helper from '../../Helper'
import { existsSync } from 'fs'
import { ProcessPidsByPid } from '@shared/Process'
import { I18nT } from '@lang/index'
import type { ModuleExecItem } from '@shared/app'
import { isLinux, isMacOS, isWindows } from '@shared/utils'
import { ProcessPidListByPid } from '@shared/Process.win'

class ModuleCustomer {
  constructor() {}

  exec(fnName: string, ...args: any) {
    // @ts-ignore
    const fn: (...args: any) => ForkPromise<any> = this?.[fnName] as any
    if (fn) {
      return fn.call(this, ...args)
    }
    return new ForkPromise((resolve, reject) => {
      reject(new Error('No Found Function'))
    })
  }

  stopService(pid: string) {
    return new ForkPromise(async (resolve) => {
      if (isWindows()) {
        const pids = await ProcessPidListByPid(`${pid}`.trim())

        if (pids.length > 0) {
          try {
            await Helper.send('tools', 'kill', '-INT', pids)
          } catch {}
        }

        resolve({
          'APP-Service-Stop-PID': pids
        })
      } else {
        const allPid: string[] = []
        const plist: any = await Helper.send('tools', 'processList')
        const pids = ProcessPidsByPid(pid.trim(), plist)
        allPid.push(...pids)
        const arr: string[] = Array.from(new Set(allPid))
        if (arr.length > 0) {
          let sig = '-TERM'
          try {
            await Helper.send('tools', 'kill', sig, arr)
          } catch {}
          await waitTime(500)
          sig = '-INT'
          try {
            await Helper.send('tools', 'kill', sig, arr)
          } catch {}
        }
        resolve({
          'APP-Service-Stop-PID': arr
        })
      }
    })
  }
  startService(version: ModuleExecItem, isService: boolean, openInTerminal?: boolean) {
    return new ForkPromise(async (resolve, reject) => {
      if (version.commandType === 'file' && !existsSync(version.commandFile)) {
        reject(new Error('Command File Not Exists'))
        return
      }

      if (isMacOS() && openInTerminal) {
        let command = ''
        if (version.commandType === 'file') {
          command = version.commandFile
        } else {
          command = version.command
          const baseDir = join(global.Server.BaseDir!, 'module-customer')
          await mkdirp(baseDir)
          command = join(baseDir, `${version.id}.sh`)
          await writeFile(command, version.command)
          try {
            await Helper.send('tools', 'chmod', command, '0777')
          } catch {}
        }
        command = command.replace(/"/g, '\\"')
        const appleScript = `
        tell application "Terminal"
          if not running then
            activate
            do script "${command}" in front window
          else
            activate
            do script "${command}"
          end if
        end tell`
        const scptFile = join(global.Server.Cache!, `${uuid()}.scpt`)
        await writeFile(scptFile, appleScript)
        await chmod(scptFile, '0777')
        try {
          await execPromise(`osascript ./${basename(scptFile)}`, {
            cwd: global.Server.Cache!
          })
          await remove(scptFile)
        } catch (e) {
          await remove(scptFile)
          return reject(e)
        }

        if (!isService) {
          resolve(true)
          return
        }
        if (!version?.pidPath) {
          reject(new Error(I18nT('setup.module.hadOpenInTerminal')))
          return
        }

        const res = await waitPidFile(version.pidPath, 0, 20, 500)
        if (res) {
          if (res?.pid) {
            resolve({
              'APP-Service-Start-PID': res.pid
            })
            return
          }
          reject(new Error(res?.error ?? 'Start Fail'))
          return
        }
        reject(new Error('Start Fail'))
        return
      }

      if (isLinux() && openInTerminal) {
        let command = ''
        if (version.commandType === 'file') {
          command = version.commandFile
        } else {
          command = version.command
          const baseDir = join(global.Server.BaseDir!, 'module-customer')
          await mkdirp(baseDir)
          command = join(baseDir, `${version.id}.sh`)
          await writeFile(command, version.command)
          try {
            await Helper.send('tools', 'chmod', command, '0777')
          } catch {}
        }
        command = command.replace(/"/g, '\\"')

        const terminalSH = join(global.Server.Static!, 'sh/exec-by-terminal.sh')
        const exeSH = join(global.Server.Cache!, `exec-by-terminal.sh`)
        await copyFile(terminalSH, exeSH)
        await chmod(exeSH, '0755')

        try {
          await execPromise(`"${exeSH}" "${command}"`, {
            cwd: global.Server.Cache!
          })
        } catch (e) {
          return reject(e)
        }

        if (!isService) {
          resolve(true)
          return
        }
        if (!version?.pidPath) {
          reject(new Error(I18nT('setup.module.hadOpenInTerminal')))
          return
        }

        const res = await waitPidFile(version.pidPath, 0, 20, 500)
        if (res) {
          if (res?.pid) {
            resolve({
              'APP-Service-Start-PID': res.pid
            })
            return
          }
          reject(new Error(res?.error ?? 'Start Fail'))
          return
        }
        reject(new Error('Start Fail'))
        return
      }

      try {
        if (isWindows()) {
          const res = await customerServiceStartExecWin(version, isService)
          resolve(res)
        } else {
          const res = await customerServiceStartExec(version, isService)
          resolve(res)
        }
      } catch (e: any) {
        console.log('-k start err: ', e)
        reject(e)
        return
      }
    })
  }
}
export default new ModuleCustomer()
