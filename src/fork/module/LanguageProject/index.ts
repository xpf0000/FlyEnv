import { ForkPromise } from '@shared/ForkPromise'
import type { RunProjectItem } from '@shared/LanguageProjectRunner'
import {
  customerServiceStartExec,
  customerServiceStartExecWin,
  waitPidFile,
  waitTime,
  uuid,
  existsSync
} from '../../Fn'
import { appDebugLog, isLinux, isMacOS, isWindows } from '@shared/utils'
import { ProcessKill, ProcessListFetch, ProcessPidsByPid } from '@shared/Process'
import { ProcessPidListByPid } from '@shared/Process.win'
import { I18nT } from '@lang/index'
import { basename, join } from 'path'
import { chmod, remove, writeFile, copyFile, readFile } from '../../Fn'
import { execPromise } from '../../Fn'
import { dirname } from 'node:path'

class LanguageProject {
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

  stopService(pid: string, typeFlag: string) {
    return new ForkPromise(async (resolve) => {
      console.log('LanguageProject stopService: ', pid, typeFlag)
      if (isWindows()) {
        const pids = await ProcessPidListByPid(`${pid}`.trim())
        if (pids.length > 0) {
          try {
            await ProcessKill('-INT', pids)
          } catch {}
        }
        resolve({
          'APP-Service-Stop-PID': pids
        })
      } else {
        const allPid: string[] = []
        const plist: any = await ProcessListFetch()
        const pids = ProcessPidsByPid(pid.trim(), plist)
        allPid.push(...pids)
        const arr: string[] = Array.from(new Set(allPid))
        if (arr.length > 0) {
          let sig = '-TERM'
          try {
            await ProcessKill(sig, arr)
          } catch {}
          await waitTime(500)
          sig = '-INT'
          try {
            await ProcessKill(sig, arr)
          } catch {}
        }
        resolve({
          'APP-Service-Stop-PID': arr
        })
      }
    })
  }

  startService(
    project: RunProjectItem,
    typeFlag: string,
    password?: string,
    openInTerminal?: boolean
  ) {
    return new ForkPromise(async (resolve, reject) => {
      console.log('LanguageProject startService: ', project, typeFlag, password, openInTerminal)

      // 验证执行文件是否存在
      if (project.commandType === 'file' && !project.runFile) {
        reject(new Error('Run File Not Specified'))
        return
      }

      const isService = true
      const version: any = {
        id: project.id,
        command: project.runCommand,
        commandFile: project.runFile,
        commandType: project.commandType,
        pidPath: project.pidPath,
        isSudo: project.isSudo,
        configPath: project.configPath,
        logPath: project.logPath,
        env: {} as Record<string, string>,
        binBin: project.binBin
      }

      // 设置环境变量
      let lines: string[] = []
      if (project.envVarType === 'specify' && project.envVar) {
        lines = project.envVar.split('\n')
      } else if (project.envVarType === 'file' && project.envFile) {
        try {
          lines = (await readFile(project.envFile, 'utf-8')).split('\n')
        } catch {}
      }
      for (const line of lines) {
        const match = line.match(/^\s*export\s+(\w+)=(.+)$/i)
        if (match) {
          version.env[match[1]] = match[2].replace(/^["']|["']$/g, '')
        } else {
          const match2 = line.match(/^(\w+)=(.+)$/)
          if (match2) {
            version.env[match2[1]] = match2[2].replace(/^["']|["']$/g, '')
          }
        }
      }

      // 设置运行目录
      if (project.path) {
        version.workDir = project.path
      }

      // 处理 macOS 终端打开
      if (isMacOS() && openInTerminal) {
        let command = ''
        if (project.commandType === 'file') {
          command = project.runFile
        } else {
          command = project.runCommand
        }
        if (project.binBin && existsSync(project.binBin)) {
          command = `export PATH="${dirname(project.binBin)}:$PATH"\n${command}`
        }
        for (const k in version.env) {
          command = `export ${k}="${version.env[k]}"\n${command}`
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

        if (!project.pidPath) {
          reject(new Error(I18nT('setup.module.hadOpenInTerminal')))
          return
        }

        const res = await waitPidFile(project.pidPath, 0, 20, 500)
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

      // 处理 Linux 终端打开
      if (isLinux() && openInTerminal) {
        let command = ''
        if (project.commandType === 'file') {
          command = project.runFile
        } else {
          command = project.runCommand
        }
        if (project.binBin && existsSync(project.binBin)) {
          command = `export PATH="${dirname(project.binBin)}:$PATH"\n${command}`
        }
        for (const k in version.env) {
          command = `export ${k}="${version.env[k]}"\n${command}`
        }
        command = command.replace(/"/g, '\\"')

        const terminalSH = join(global.Server.Static!, 'sh/exec-by-terminal.sh')
        const exeSH = join(global.Server.Cache!, `${uuid()}.sh`)
        await copyFile(terminalSH, exeSH)
        await chmod(exeSH, '0755')

        try {
          await execPromise(`"${exeSH}" "${command}"`, {
            cwd: global.Server.Cache!
          })
        } catch (e) {
          return reject(e)
        }

        if (!project.pidPath) {
          reject(new Error(I18nT('setup.module.hadOpenInTerminal')))
          return
        }

        const res = await waitPidFile(project.pidPath, 0, 20, 500)
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

      // 处理 Windows 终端打开
      if (isWindows() && openInTerminal) {
        let command = ''
        if (project.commandType === 'file') {
          command = project.runFile
        } else {
          command = project.runCommand
        }
        // Add PATH to environment
        if (project.binBin && existsSync(project.binBin)) {
          command = `$env:PATH = "${dirname(project.binBin)};" + $env:PATH\n${command}`
        }
        // Add environment variables
        for (const k in version.env) {
          command = `$env:${k} = "${version.env[k]}"\n${command}`
        }

        // Create command file and copy the terminal script
        const terminalPS = join(global.Server.Static!, 'sh/exec-by-terminal.ps1')
        const exePS = join(global.Server.Cache!, `exec-by-terminal-${uuid()}.ps1`)
        const commandFile = join(global.Server.Cache!, `command-${uuid()}.txt`)

        await copyFile(terminalPS, exePS)
        await writeFile(commandFile, command, 'utf-8')

        appDebugLog(
          `[Windows][openInTerminal][command]`,
          JSON.stringify(
            {
              command,
              commandFile,
              exePS
            },
            null,
            2
          )
        ).catch()

        try {
          await execPromise(
            `powershell.exe -ExecutionPolicy Bypass -File "${exePS}" "${commandFile}"`,
            {
              cwd: global.Server.Cache!
            }
          )
          await remove(exePS)
          await remove(commandFile)
        } catch (e) {
          await remove(exePS)
          await remove(commandFile)
          return reject(e)
        }

        if (!project.pidPath) {
          reject(new Error(I18nT('setup.module.hadOpenInTerminal')))
          return
        }

        const res = await waitPidFile(project.pidPath, 0, 20, 500)
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

      // 标准执行方式
      try {
        if (isWindows()) {
          const res = await customerServiceStartExecWin(version, isService)
          resolve(res)
        } else {
          const res = await customerServiceStartExec(version, isService)
          resolve(res)
        }
      } catch (e: any) {
        console.log('LanguageProject start err: ', e)
        reject(e)
        return
      }
    })
  }
}

export default new LanguageProject()
