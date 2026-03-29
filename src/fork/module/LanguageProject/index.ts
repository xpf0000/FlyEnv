import { ForkPromise } from '@shared/ForkPromise'
import type { RunProjectItem } from '@shared/LanguageProjectRunner'
import {
  customerServiceStartExec,
  customerServiceStartExecWin,
  waitPidFile,
  waitTime,
  uuid
} from '../../Fn'
import { isLinux, isMacOS, isWindows } from '@shared/utils'
import { ProcessKill, ProcessListFetch, ProcessPidsByPid } from '@shared/Process'
import { ProcessPidListByPid } from '@shared/Process.win'
import { I18nT } from '@lang/index'
import { basename, join } from 'path'
import { chmod, mkdirp, remove, writeFile, copyFile } from '../../Fn'
import { execPromise } from '../../Fn'

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
        env: {} as Record<string, string>
      }

      // 设置环境变量
      if (project.envVarType === 'specify' && project.envVar) {
        const lines = project.envVar.split('\n')
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
      } else if (project.envVarType === 'file' && project.envFile) {
        version.envFile = project.envFile
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
          const baseDir = join(global.Server.BaseDir!, 'language-project', typeFlag)
          await mkdirp(baseDir)
          command = join(baseDir, `${project.id}.sh`)
          await writeFile(command, `cd "${project.path}" && ${project.runCommand}`)
          try {
            await chmod(command, '0777')
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
          const baseDir = join(global.Server.BaseDir!, 'language-project', typeFlag)
          await mkdirp(baseDir)
          command = join(baseDir, `${project.id}.sh`)
          await writeFile(command, `cd "${project.path}" && ${project.runCommand}`)
          try {
            await chmod(command, '0777')
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
