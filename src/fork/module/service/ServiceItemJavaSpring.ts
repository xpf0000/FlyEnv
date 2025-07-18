import type { AppHost } from '@shared/app'
import { ForkPromise } from '@shared/ForkPromise'
import { dirname, join } from 'path'
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
import Helper from '../../Helper'
import { ProcessPidsByPid } from '@shared/Process'
import { isMacOS, isWindows } from '@shared/utils'
import { EOL } from 'os'
import { ProcessPidListByPid } from '@shared/Process.win'
import { powershellCmd } from '../../util/Powershell'

export class ServiceItemJavaSpring extends ServiceItem {
  start(item: AppHost) {
    return new ForkPromise(async (resolve, reject) => {
      if (this.exit) {
        reject(new Error('Exit'))
        return
      }

      if (!item.jdkDir || !existsSync(item.jdkDir)) {
        reject(new Error(`The JDK does not exist: ${item.jdkDir}`))
        return
      }

      if (!item.jarDir || !existsSync(item.jarDir)) {
        reject(new Error(`The JAR file does not exist: ${item.jarDir}`))
        return
      }

      this.host = item
      await this.stop()
      const javaDir = join(global.Server.BaseDir!, 'java')
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
        commands.push(`export PATH="${dirname(item.jdkDir)}:$PATH"`)
        const startCommand = item?.startCommand?.replace(item.jdkDir, 'java')
        commands.push(`nohup ${startCommand} &>> ${log} &`)
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
        commands.push(`set "PATH=${dirname(item.jdkDir)};%PATH%"`)
        commands.push(`set "JAVA_HOME=${dirname(dirname(item.jdkDir))}"`)
        commands.push(`cd /d "${dirname(item.jdkDir!)}"`)
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
          await execPromiseWithEnv(`zsh "${sh}"`, opt)
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
    const baseDir = join(global.Server.BaseDir!, 'java')
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
