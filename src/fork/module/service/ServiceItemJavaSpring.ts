import type { AppHost } from '@shared/app'
import { ForkPromise } from '@shared/ForkPromise'
import { dirname, join } from 'path'
import { existsSync, mkdirp, readFile, writeFile } from 'fs-extra'
import { getHostItemEnv, ServiceItem } from './ServiceItem'
import { execPromiseRoot } from '../../Fn'
import { ProcessPidListByPid } from '../../Process'
import { EOL } from 'os'

export class ServiceItemJavaSpring extends ServiceItem {
  start(item: AppHost) {
    return new ForkPromise(async (resolve, reject) => {
      if (this.exit) {
        reject(new Error('Exit'))
        return
      }

      if (!item.jdkDir || !existsSync(item.jdkDir)) {
        reject(new Error(`JDK not exists: ${item.jdkDir}`))
        return
      }

      if (!item.jarDir || !existsSync(item.jarDir)) {
        reject(new Error(`JAR File not exists: ${item.jarDir}`))
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
          await execPromiseRoot(`del -Force ${pid}`)
        } catch (e) {}
      }
      const opt = await getHostItemEnv(item)
      const commands: string[] = ['@echo off', 'chcp 65001>nul']
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

      this.command = commands.join(EOL)
      console.log('command: ', this.command)

      const sh = join(global.Server.Cache!, `service-${this.id}.cmd`)
      await writeFile(sh, this.command)
      process.chdir(global.Server.Cache!)
      try {
        await execPromiseRoot(
          `powershell.exe -Command "(Start-Process -FilePath ./service-${this.id}.cmd -PassThru -WindowStyle Hidden).Id" > "${pid}"`
        )
        const cpid = await this.checkPid()
        this.daemon()
        resolve({
          'APP-Service-Start-PID': cpid
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
    return await ProcessPidListByPid(pid)
  }
}
