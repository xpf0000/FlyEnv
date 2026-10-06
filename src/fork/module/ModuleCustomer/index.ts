import { basename, join } from 'path'
import {
  customerServiceStartExec,
  execPromise,
  uuid,
  waitPidFile,
  chmod,
  remove,
  writeFile,
  customerServiceStartExecWin,
  copyFile
} from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { withServiceStopContext, type ServiceStopContext } from '@shared/ServiceStopContext'
import { existsSync } from 'fs'
import { I18nT } from '@lang/runtime'
import type { ModuleExecItem, SoftInstalled } from '@shared/app'
import { isLinux, isMacOS, isWindows } from '@shared/utils'
import {
  captureServiceProcessIdentity,
  stopRegisteredServiceProcesses,
  type ServiceProcessIdentity
} from '@shared/ServiceProcessIdentity'

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

  /**
   * 自定义服务只依据原启动根身份停止，不按执行程序扫描其他实例。根确认后，
   * 正常子孙随树处理；末次等待确认完整原清单退出后才发送成功 PID。没有活父
   * 但存在历史 PPID、读取失败或授权取消均保留失败，main 不注销原代次。
   */
  stopService(
    pid: string,
    stopOptions?: ServiceStopContext,
    identity?: ServiceProcessIdentity | string
  ) {
    // 公共可选第二参数携带首表，原启动身份顺延；共享根发现直接读此表，不再请求 IPC。
    return withServiceStopContext(
      stopOptions,
      () =>
        new ForkPromise(async (resolve) => {
          // 与语言项目共用原启动身份约束及平台停止流程，不在模块重复查时间/等待。
          const pids = await stopRegisteredServiceProcesses(pid, identity)
          resolve({ 'APP-Service-Stop-PID': pids })
        })
    )
  }
  startService(version: ModuleExecItem, isService: boolean, openInTerminal?: boolean) {
    return new ForkPromise(async (resolveResult, reject) => {
      // 直接/终端启动共享创建时间采样；暂时失败有限重试，持续失败不得盲认当前 PID。
      // 只把 PID 和创建身份返回给停止登记，不将执行命令、口令或终端参数混入停止。
      const launchedAt = Date.now()
      const resolve = (result: any) => {
        const pid = `${result?.['APP-Service-Start-PID'] ?? ''}`.trim()
        if (/^\d+$/.test(pid) && Number(pid) > 4) {
          resolveResult(
            captureServiceProcessIdentity(pid, launchedAt).then((identity) => ({
              ...result,
              'APP-Service-Stop-Args': [pid, identity]
            }))
          )
        } else resolveResult(result)
      }
      if (version.commandType === 'file' && !existsSync(version.commandFile)) {
        reject(new Error('Command File Not Exists'))
        return
      }
      // 与普通启动一致，终端启动不能复用历史 PID 文件的旧内容。
      if (openInTerminal && isService && version.pidPath && existsSync(version.pidPath)) {
        await remove(version.pidPath)
      }

      if (isMacOS() && openInTerminal) {
        let command = ''
        if (version.commandType === 'file') {
          command = version.commandFile
        } else {
          command = version.command
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
        }
        if (version.isSudo) command = `sudo -- /bin/bash -lc '${command.replace(/'/g, "'\\''")}'`
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

  getConfigFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    return []
  }

  getLogFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    return []
  }
}
export default new ModuleCustomer()
