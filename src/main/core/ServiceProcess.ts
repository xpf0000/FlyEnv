import type { SoftInstalled } from '@shared/app'
import { ProcessListByPid } from '@shared/Process'
import type { PItem } from '@shared/Process'
import Helper from '../../fork/Helper'
import { isMacOS, isWindows } from '@shared/utils'
import type { ForkManager } from './ForkManager'
import { ProcessPidList, ProcessPidListByPids } from '@shared/Process.win'

type ServiceProcessItem = {
  item: SoftInstalled
  pid: string
}

class ServiceProcess {
  forkManager?: ForkManager
  servicePID: Record<string, ServiceProcessItem[]> = {}

  addPid(type: string, pid: string, item: SoftInstalled) {
    if (!this.servicePID[type]) {
      this.servicePID[type] = []
    }
    this.servicePID[type].push({ item, pid })
  }

  delPid(type: string, pid: string[]) {
    if (!this.servicePID[type]) {
      return
    }
    const pids = pid.map((s) => `${s}`)
    this.servicePID[type] = this.servicePID[type].filter((item) => !pids.includes(`${item.pid}`))
  }

  private async killAllPid() {
    if (isMacOS()) {
      const plist: any = await Helper.send('tools', 'processList')
      const arr = Array.from(
        new Set(
          Object.values(this.servicePID)
            .flat()
            .map((m) => m.pid)
        )
      ).map((pid) => {
        return new Promise(async (resolve) => {
          const TERM: Array<string> = []
          const INT: Array<string> = []
          let pids: PItem[] = []
          try {
            pids = ProcessListByPid(pid, plist)
          } catch {}
          if (pids.length > 0) {
            pids.forEach((item) => {
              if (
                item.COMMAND.includes('mysqld') ||
                item.COMMAND.includes('mariadbd') ||
                item.COMMAND.includes('mongod') ||
                item.COMMAND.includes('rabbit') ||
                item.COMMAND.includes('org.apache.catalina') ||
                item.COMMAND.includes('elasticsearch')
              ) {
                TERM.push(item.PID)
              } else {
                INT.push(item.PID)
              }
            })
            if (TERM.length > 0) {
              const sig = '-TERM'
              try {
                await Helper.send('tools', 'kill', sig, TERM)
              } catch {}
            }
            if (INT.length > 0) {
              const sig = '-INT'
              try {
                await Helper.send('tools', 'kill', sig, INT)
              } catch {}
            }
          }
          resolve(true)
        })
      })
      try {
        await Promise.all(arr)
      } catch {}
      return
    }

    if (isWindows()) {
      if (this.servicePID?.['mongodb']?.length) {
        const find = this.servicePID['mongodb'].find((f) => !!f.pid)!
        await this.forkManager?.send(
          'mongodb',
          'stopService',
          JSON.parse(JSON.stringify(find.item))
        )
        delete this.servicePID?.['mongodb']
      }

      if (this.servicePID?.['postgresql']?.length) {
        const find = this.servicePID['postgresql'].find((f) => !!f.pid)!
        await this.forkManager?.send(
          'postgresql',
          'stopService',
          JSON.parse(JSON.stringify(find.item))
        )
        delete this.servicePID?.['postgresql']
      }

      const all: string[] = await ProcessPidListByPids(
        Array.from(
          new Set(
            Object.values(this.servicePID)
              .flat()
              .map((m) => m.pid)
          )
        )
      )
      if (all.length > 0) {
        try {
          await Helper.send('tools', 'kill', '-INT', all)
        } catch (e) {
          console.log('taskkill e: ', e)
        }
      }
    }
  }

  private async stopAllProcessByName() {
    if (isMacOS()) {
      const TERM: Array<string> = []
      const INT: Array<string> = []
      const all: any = await Helper.send('tools', 'processList')
      const find = all.filter((p: any) => {
        return (
          (p.COMMAND.includes(global.Server.BaseDir!) ||
            p.COMMAND.includes(global.Server.AppDir!) ||
            p.COMMAND.includes('redis-server')) &&
          !p.COMMAND.includes(' grep ') &&
          !p.COMMAND.includes(' /bin/sh -c') &&
          !p.COMMAND.includes('/Contents/MacOS/') &&
          !p.COMMAND.startsWith('/bin/bash ') &&
          !p.COMMAND.includes('brew.rb ') &&
          !p.COMMAND.includes(' install ') &&
          !p.COMMAND.includes(' uninstall ') &&
          !p.COMMAND.includes(' link ') &&
          !p.COMMAND.includes(' unlink ')
        )
      })
      if (find.length === 0) {
        return
      }
      for (const item of find) {
        if (
          item.COMMAND.includes('mysqld') ||
          item.COMMAND.includes('mariadbd') ||
          item.COMMAND.includes('mongod') ||
          item.COMMAND.includes('rabbit') ||
          item.COMMAND.includes('org.apache.catalina') ||
          item.COMMAND.includes('elasticsearch')
        ) {
          TERM.push(item.PID)
        } else {
          INT.push(item.PID)
        }
      }
      if (TERM.length > 0) {
        const sig = '-TERM'
        try {
          await Helper.send('tools', 'kill', sig, TERM)
        } catch {}
      }
      if (INT.length > 0) {
        const sig = '-INT'
        try {
          await Helper.send('tools', 'kill', sig, INT)
        } catch {}
      }
      return
    }
    if (isWindows()) {
      const arr: Array<string> = []
      const fpm: Array<string> = []

      let all: PItem[] = []
      try {
        all = await ProcessPidList()
      } catch {}
      for (const item of all) {
        if (!item.COMMAND || typeof item.COMMAND !== 'string') {
          continue
        }
        if (
          item.COMMAND.includes('PhpWebStudy-Data') ||
          item.COMMAND.includes('pws-app-') ||
          item.COMMAND.includes('php.phpwebstudy')
        ) {
          if (item.COMMAND.includes('php-cgi-spawner.exe')) {
            fpm.push(item.PID)
          } else {
            arr.push(item.PID)
          }
        }
      }
      arr.unshift(...fpm)
      console.log('_stopServer arr: ', arr)
      if (arr.length > 0) {
        try {
          await Helper.send('tools', 'kill', '-INT', arr)
        } catch (e) {
          console.log('taskkill e: ', e)
        }
      }
    }
  }

  async stop() {
    try {
      await this.killAllPid()
    } catch (e) {
      console.log('killAllPid e: ', e)
    }

    try {
      await this.stopAllProcessByName()
    } catch (e) {
      console.log('stopAllProcessByName e: ', e)
    }
  }
}

export default new ServiceProcess()
