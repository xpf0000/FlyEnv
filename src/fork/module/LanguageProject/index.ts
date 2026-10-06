import { ForkPromise } from '@shared/ForkPromise'
import { withServiceStopContext, type ServiceStopContext } from '@shared/ServiceStopContext'
import type { SoftInstalled } from '@shared/app'
import type { RunProjectItem } from '@shared/LanguageProjectRunner'
import {
  customerServiceStartExec,
  customerServiceStartExecWin,
  waitPidFile,
  uuid,
  existsSync
} from '../../Fn'
import { isLinux, isMacOS, isWindows } from '@shared/utils'
import { I18nT } from '@lang/runtime'
import { basename, dirname, join } from 'path'
import { chmod, remove, writeFile, copyFile, readFile, spawnPromiseWithEnv } from '../../Fn'
import { execPromise } from '../../Fn'
import EnvSync from '@shared/EnvSync'
import { powerShellInlineArgs } from '@shared/PowerShellCommand'
import { buildWindowsTerminalInlineScript, powerShellDoubleQuoted } from '@shared/WindowsTerminal'
import { resolveWindowsPowerShellPath } from '@shared/WindowsSystemPaths'
import {
  captureServiceProcessIdentity,
  stopRegisteredServiceProcesses,
  type ServiceProcessIdentity
} from '@shared/ServiceProcessIdentity'

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

  /**
   * 与 UI/MCP/退出复用的项目停止契约。main 保存实际启动 PID、语言标记及创建
   * 身份；这里从一份新鲜列表确认父，再信任其原子孙。成功回传才允许注销登记，
   * 权限取消、身份变化、查询失败和退出超时均 reject，不把 worker 逐个预授权。
   */
  stopService(
    pid: string,
    stopOptions?: ServiceStopContext,
    typeFlag?: string,
    identity?: ServiceProcessIdentity | string
  ) {
    // 首表是可选第二参数，语言标记/原启动身份顺延且保持原含义；不改变登记参数。
    // 嵌套公共停止使用本次传入表，多个项目并行时不共享可覆盖的全局字段。
    return withServiceStopContext(
      stopOptions,
      () =>
        new ForkPromise(async (resolve) => {
          console.log('LanguageProject stopService: ', pid, typeFlag)
          // 登记根、首次快照身份、后代收集、平台停止与退出确认全部走共享入口，
          // 避免项目和自定义服务各自实现一份相同流程。语言标记只用于诊断。
          const pids = await stopRegisteredServiceProcesses(pid, identity)
          resolve({ 'APP-Service-Stop-PID': pids })
        })
    )
  }

  startService(
    project: RunProjectItem,
    typeFlag: string,
    password?: string,
    openInTerminal?: boolean
  ) {
    return new ForkPromise(async (resolveResult, reject) => {
      // 所有正常/终端启动分支共用这一启动范围。成功 PID 必须来自本次启动返回，
      // 身份放在停止参数中，main 仅保存并转发，不保存项目命令、密码或环境变量。
      const launchedAt = Date.now()
      const resolve = (result: any) => {
        const pid = `${result?.['APP-Service-Start-PID'] ?? ''}`.trim()
        if (/^\d+$/.test(pid) && Number(pid) > 4) {
          resolveResult(
            captureServiceProcessIdentity(pid, launchedAt).then((identity) => ({
              ...result,
              'APP-Service-Stop-Args': [pid, typeFlag, identity]
            }))
          )
        } else resolveResult(result)
      }
      // 启动/停止登记诊断不输出完整项目、sudo 密码或环境变量。
      console.log('LanguageProject startService: ', project.id, typeFlag, openInTerminal)

      // 验证执行文件是否存在
      if (project.commandType === 'file' && !project.runFile) {
        reject(new Error('Run File Not Specified'))
        return
      }

      const isService = true
      // 终端分支不经过 customerServiceStartExec 的旧 PID 清理，启动前必须移除
      // 历史文件；否则 waitPidFile 会立即把上一轮 PID 当作本次启动成功。
      if (openInTerminal && project.pidPath && existsSync(project.pidPath)) {
        await remove(project.pidPath)
      }
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

      if (typeFlag === 'swoole-cli' && project.binBin && existsSync(project.binBin)) {
        const runtimeDir = dirname(project.binBin)
        const iniFile = join(runtimeDir, 'php.ini')
        const cacertFile = join(runtimeDir, 'cacert.pem')
        if (existsSync(iniFile) && !version.env.PHPRC) {
          version.env.PHPRC = runtimeDir
        }
        if (existsSync(cacertFile)) {
          version.env.CURL_CA_BUNDLE = version.env.CURL_CA_BUNDLE || cacertFile
          version.env.SSL_CERT_FILE = version.env.SSL_CERT_FILE || cacertFile
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
        if (project.isSudo) command = `sudo -- /bin/bash -lc '${command.replace(/'/g, "'\\''")}'`
        command = command.replace(/"/g, '\\"')

        const terminalSH = join(global.Server.Static!, 'sh/exec-by-terminal.sh')
        const exeSH = join(global.Server.Cache!, `${uuid()}.sh`)
        await copyFile(terminalSH, exeSH)
        await chmod(exeSH, '0755')

        try {
          await execPromise(`"${exeSH}" "${command}"`, {
            cwd: global.Server.Cache!
          })
          await remove(exeSH)
        } catch (e) {
          await remove(exeSH)
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
          command = `$env:PATH = ${powerShellDoubleQuoted(`${dirname(project.binBin)};`)} + $env:PATH\n${command}`
        }
        // Add environment variables
        for (const k in version.env) {
          command = `$env:${k} = ${powerShellDoubleQuoted(version.env[k])}\n${command}`
        }

        try {
          await EnvSync.sync()
          // 终端启动同样产生后续要停止的 PID；外层和终端内包装进程使用同一
          // 系统绝对路径，PATH 缺失/含中文目录均不改变实际执行的 PowerShell。
          const powerShellPath = resolveWindowsPowerShellPath()
          await spawnPromiseWithEnv(
            powerShellPath,
            powerShellInlineArgs(buildWindowsTerminalInlineScript(command, powerShellPath)),
            {
              cwd: global.Server.Cache!,
              env: version.env,
              windowsHide: true
            }
          )
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

  getConfigFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    return []
  }

  getLogFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    return []
  }
}

export default new LanguageProject()
