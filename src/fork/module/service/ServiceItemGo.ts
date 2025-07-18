import type { AppHost } from '@shared/app'
import { join } from 'path'
import {
  chmod,
  existsSync,
  mkdirp,
  readFile,
  remove,
  writeFile,
  execPromiseWithEnv
} from '../../Fn'
import { getHostItemEnv, ServiceItem } from './ServiceItem'
import { ForkPromise } from '@shared/ForkPromise'
import Helper from '../../Helper'
import { ProcessPidsByPid } from '@shared/Process'
import { isMacOS, isWindows } from '@shared/utils'
import { EOL } from 'os'
import { ProcessPidListByPid } from '@shared/Process.win'
import { powershellCmd } from '../../util/Powershell'

export class ServiceItemGo extends ServiceItem {
  start(item: AppHost) {
    return new ForkPromise(async (resolve, reject) => {
      if (this.exit) {
        reject(new Error('Exit'))
        return
      }
      this.host = item
      await this.stop()

      if (!item.bin || !existsSync(item.bin)) {
        reject(new Error(`The executable file does not exist: ${item.bin}`))
        return
      }

      if (!item.root || !existsSync(item.root)) {
        reject(new Error(`The working directory does not exist: ${item.root}`))
        return
      }

      const javaDir = join(global.Server.BaseDir!, 'go')
      await mkdirp(javaDir)
      const pid = join(javaDir, `${item.id}.pid`)
      const log = join(javaDir, `${item.id}.log`)
      if (existsSync(pid)) {
        try {
          await remove(pid)
        } catch {}
      }

      const opt = await getHostItemEnv(item)
      const commands: string[] = []
      if (isMacOS()) {
        commands.push('#!/bin/zsh')
        if (opt && opt?.env) {
          for (const k in opt.env) {
            const v = opt.env[k]
            if (v.includes(' ')) {
              commands.push(`export ${k}="${v}"`)
            } else {
              commands.push(`export ${k}=${v}`)
            }
          }
        }
        commands.push(`cd "${item.root}"`)
        commands.push(`nohup ${item?.startCommand} &>> ${log} &`)
        commands.push(`echo $! > ${pid}`)
      } else if (isWindows()) {
        commands.push('@echo off')
        commands.push('chcp 65001>nul')
        if (opt && opt?.env) {
          for (const k in opt.env) {
            const v = opt.env[k]
            if (v.includes(' ')) {
              commands.push(`set "${k}=${v}"`)
            } else {
              commands.push(`set ${k}=${v}`)
            }
          }
        }
        commands.push(`start /B ${item.startCommand} > "${log}" 2>&1 &`)
      }

      this.command = commands.join(EOL)
      console.log('command: ', this.command)
      let sh = ''
      if (isWindows()) {
        sh = join(global.Server.Cache!, `service-${this.id}.cmd`)
      } else {
        sh = join(global.Server.Cache!, `service-${this.id}.sh`)
      }
      await writeFile(sh, this.command)
      await chmod(sh, '0777')
      process.chdir(global.Server.Cache!)
      try {
        if (isMacOS()) {
          const res = await execPromiseWithEnv(`zsh "${sh}"`, opt)
          console.log('start res: ', res)
        } else if (isWindows()) {
          const pidResult = await powershellCmd(
            `(Start-Process -FilePath ./service-${this.id}.cmd -PassThru -WindowStyle Hidden).Id`
          )
          const pid = pidResult.trim()
          await writeFile(pid, pidResult)
        }

        const resPid = await this.checkPid()
        this.daemon()
        resolve({
          'APP-Service-Start-PID': resPid
        })
      } catch (e) {
        console.log('start e: ', e)
        reject(e)
      }
    })
  }
  async checkState() {
    const id = this.host?.id
    if (!id) {
      return []
    }
    const baseDir = join(global.Server.BaseDir!, 'go')
    const pidFile = join(baseDir, `${id}.pid`)
    this.pidFile = pidFile
    if (!existsSync(pidFile)) {
      return []
    }
    const pid = (await readFile(pidFile, 'utf-8')).trim()
    if (isWindows()) {
      return await ProcessPidListByPid(pid)
    } else {
      const plist: any = await Helper.send('tools', 'processList')
      return ProcessPidsByPid(pid, plist)
    }
  }
}
