import type { AppHost } from '@shared/app'
import { join } from 'path'
import { existsSync, mkdirp, writeFile, remove } from 'fs-extra'
import { getHostItemEnv, ServiceItem } from './ServiceItem'
import { ForkPromise } from '@shared/ForkPromise'
import { execPromiseRoot, execPromiseRootWhenNeed } from '@shared/Exec'

export class ServiceItemGo extends ServiceItem {
  start(item: AppHost): ForkPromise<boolean> {
    return new ForkPromise<boolean>(async (resolve, reject) => {
      if (this.exit) {
        reject(new Error('Exit'))
        return
      }
      this.host = item
      await this.stop()

      if (!item.bin || !existsSync(item.bin)) {
        reject(new Error(`Run File not exists: ${item.bin}`))
        return
      }

      if (!item.root || !existsSync(item.root)) {
        reject(new Error(`Run Directory not exists: ${item.root}`))
        return
      }

      const javaDir = join(global.Server.BaseDir!, 'go')
      await mkdirp(javaDir)
      const pid = join(javaDir, `${item.id}.pid`)
      const log = join(javaDir, `${item.id}.log`)
      if (existsSync(pid)) {
        await remove(pid)
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
      commands.push(`cd "${item.root}"`)
      commands.push(
        `nohup ${item?.startCommand} PWSAPPFLAG=${global.Server.BaseDir!} PWSAPPID=${this.id} &>> ${log} &`
      )
      commands.push(`echo $! > ${pid}`)

      this.command = commands.join('\n')
      console.log('command: ', this.command)
      const sh = join(global.Server.Cache!, `service-${this.id}.sh`)
      await writeFile(sh, this.command)
      await execPromiseRoot([`chmod`, '777', sh])
      try {
        const res = await execPromiseRootWhenNeed(`zsh`, [sh], opt)
        console.log('start res: ', res)
        resolve(true)
      } catch (e) {
        console.log('start e: ', e)
        reject(e)
      }
    })
  }
}
