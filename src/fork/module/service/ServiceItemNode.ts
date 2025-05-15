import type { AppHost } from '@shared/app'
import { dirname, join } from 'path'
import { existsSync, mkdirp, writeFile, readFile, remove, chmod } from 'fs-extra'
import { getHostItemEnv, ServiceItem } from './ServiceItem'
import { ForkPromise } from '@shared/ForkPromise'
import { execPromise } from '../../util/Exec'
import { ProcessPidsByPid } from '@shared/Process'
import Helper from '../../Helper'

export class ServiceItemNode extends ServiceItem {
  start(item: AppHost) {
    return new ForkPromise(async (resolve, reject) => {
      if (this.exit) {
        reject(new Error('Exit'))
        return
      }
      this.host = item
      await this.stop()

      const nodeDir = item?.nodeDir ?? ''
      if (!nodeDir || !existsSync(nodeDir)) {
        reject(new Error(`The NodeJS directory does not exist: ${item.nodeDir}`))
        return
      }

      if (!item.bin || !existsSync(item.bin)) {
        reject(new Error(`The executable file does not exist: ${item.bin}`))
        return
      }

      if (!item.root || !existsSync(item.root)) {
        reject(new Error(`The working directory does not exist: ${item.root}`))
        return
      }

      const javaDir = join(global.Server.BaseDir!, 'nodejs')
      await mkdirp(javaDir)
      const pid = join(javaDir, `${item.id}.pid`)
      const log = join(javaDir, `${item.id}.log`)
      if (existsSync(pid)) {
        try {
          await remove(pid)
        } catch (e) {}
      }

      const opt = await getHostItemEnv(item)
      const commands: string[] = ['#!/bin/zsh']
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
      commands.push(`export PATH="${dirname(item.nodeDir!)}:$PATH"`)
      commands.push(`cd "${item.root}"`)
      const startCommand = item?.startCommand?.replace(item.nodeDir!, 'node')
      commands.push(
        `nohup ${startCommand} --PWSAPPFLAG=${global.Server.BaseDir!} --PWSAPPID=${this.id} &>> ${log} &`
      )
      commands.push(`echo $! > ${pid}`)

      this.command = commands.join('\n')
      console.log('command: ', this.command)
      const sh = join(global.Server.Cache!, `service-${this.id}.sh`)
      await writeFile(sh, this.command)
      await chmod(sh, '0777')
      try {
        const res = await execPromise(`zsh "${sh}"`, opt)
        console.log('start res: ', res)
        const pid = await this.checkPid()
        this.daemon()
        resolve({
          'APP-Service-Start-PID': pid
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
    const baseDir = join(global.Server.BaseDir!, 'nodejs')
    const pidFile = join(baseDir, `${id}.pid`)
    this.pidFile = pidFile
    if (!existsSync(pidFile)) {
      return []
    }
    const pid = (await readFile(pidFile, 'utf-8')).trim()
    const plist: any = await Helper.send('tools', 'processList')
    return ProcessPidsByPid(pid, plist)
  }
}
