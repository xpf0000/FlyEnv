import type { SoftInstalled } from '@shared/app'
import { ProcessKill, ProcessListByPid, ProcessListFetch } from '@shared/Process'
import type { PItem } from '@shared/Process'
import { isWindows } from '@shared/utils'
import type { ForkManager } from './ForkManager'
import { ProcessPidList, ProcessPidListByPids } from '@shared/Process.win'

type ServiceProcessItem = {
  item: SoftInstalled
  pid: string
}

/** 单个运行中实例的标识（bin 是唯一键——同一 version 可能装在不同路径） */
export type RunningInstance = {
  bin: string
  path?: string
  version?: string | null
  pid: string
}

export type ServiceStatusItem = {
  flag: string
  running: boolean
  /** 当前该模块所有运行中的实例（可能多版本并行，如 php-fpm） */
  instances: RunningInstance[]
}

type StatusChangeCallback = (status: ServiceStatusItem) => void

class ServiceProcess {
  forkManager?: ForkManager
  servicePID: Record<string, ServiceProcessItem[]> = {}
  private onChangeCallbacks: StatusChangeCallback[] = []

  /** 注册状态变更回调（供 main 进程广播给 render 用） */
  onStatusChange(cb: StatusChangeCallback) {
    this.onChangeCallbacks.push(cb)
  }

  private emitChange(type: string) {
    const status = this.statusOf(type)
    for (const cb of this.onChangeCallbacks) {
      try {
        cb(status)
      } catch (e) {
        console.log('ServiceProcess onChange callback error: ', e)
      }
    }
  }

  /** 单个模块的运行态（纯读内存，不做进程探测）。bin 为实例唯一键 */
  statusOf(type: string): ServiceStatusItem {
    const list = (this.servicePID[type] ?? []).filter((i) => !!i.pid)
    const instances: RunningInstance[] = list.map((i) => ({
      bin: i.item?.bin,
      path: i.item?.path,
      version: i.item?.version ?? undefined,
      pid: i.pid
    }))
    return {
      flag: type,
      running: instances.length > 0,
      instances
    }
  }

  /** 批量查询运行态。flags 省略则返回当前所有有记录的模块 */
  getStatus(flags?: string[]): Record<string, ServiceStatusItem> {
    const keys = flags && flags.length ? flags : Object.keys(this.servicePID)
    const out: Record<string, ServiceStatusItem> = {}
    for (const k of keys) {
      out[k] = this.statusOf(k)
    }
    return out
  }

  private protectedProcessPids(processList: PItem[]): Set<string> {
    const protectedPids = new Set<string>([`${process.pid}`, `${process.ppid}`])
    const processMap = new Map<string, PItem>()
    processList.forEach((item) => {
      processMap.set(`${item.PID}`, item)
    })

    let currentPid = `${process.pid}`
    for (let i = 0; i < processList.length; i += 1) {
      const item = processMap.get(currentPid)
      const ppid = item?.PPID ? `${item.PPID}` : ''
      if (!ppid || ppid === '0' || protectedPids.has(ppid)) {
        break
      }
      protectedPids.add(ppid)
      currentPid = ppid
    }
    return protectedPids
  }

  addPid(type: string, pid: string, item: SoftInstalled) {
    if (!this.servicePID[type]) {
      this.servicePID[type] = []
    }
    // 按 bin 去重：同一可执行文件已登记则更新其 pid，避免重复登记（如重复 start）
    const bin = item?.bin
    const existing = bin ? this.servicePID[type].find((i) => i.item?.bin === bin) : undefined
    if (existing) {
      existing.pid = pid
      existing.item = item
    } else {
      this.servicePID[type].push({ item, pid })
    }
    this.emitChange(type)
  }

  delPid(type: string, pid: string[]) {
    if (!this.servicePID[type]) {
      return
    }
    const pids = pid.map((s) => `${s}`)
    this.servicePID[type] = this.servicePID[type].filter((item) => !pids.includes(`${item.pid}`))
    this.emitChange(type)
  }

  /** 按 bin 删除登记（停指定版本时用——bin 是实例唯一键，避免误删同模块其它版本） */
  delByBin(type: string, bins: string[]) {
    if (!this.servicePID[type]) {
      return
    }
    this.servicePID[type] = this.servicePID[type].filter((item) => !bins.includes(item.item?.bin))
    this.emitChange(type)
  }

  /** 删除某模块全部登记（停整个模块时用） */
  delAll(type: string) {
    if (!this.servicePID[type] || this.servicePID[type].length === 0) {
      return
    }
    this.servicePID[type] = []
    this.emitChange(type)
  }

  private async killAllPid() {
    if (!isWindows()) {
      const plist: any = await ProcessListFetch()
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
                await ProcessKill(sig, TERM)
              } catch {}
            }
            if (INT.length > 0) {
              const sig = '-INT'
              try {
                await ProcessKill(sig, INT)
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

      let all: string[] = []
      const pids = Array.from(
        new Set(
          Object.values(this.servicePID)
            .flat()
            .map((m) => `${m.pid}`)
        )
      )
      try {
        all = await ProcessPidListByPids(pids)
      } catch {}
      if (all.length > 0) {
        try {
          await ProcessKill('-INT', all)
        } catch (e) {
          console.log('taskkill e: ', e)
        }
      }
    }
  }

  private async stopAllProcessByName() {
    if (!isWindows()) {
      const TERM: Array<string> = []
      const INT: Array<string> = []
      const all: any = await ProcessListFetch()
      const protectedPids = this.protectedProcessPids(all)
      const find = all.filter((p: any) => {
        return (
          !protectedPids.has(`${p.PID}`) &&
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
          await ProcessKill(sig, TERM)
        } catch {}
      }
      if (INT.length > 0) {
        const sig = '-INT'
        try {
          await ProcessKill(sig, INT)
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
      const protectedPids = this.protectedProcessPids(all)
      for (const item of all) {
        if (!item.COMMAND || typeof item.COMMAND !== 'string') {
          continue
        }
        if (protectedPids.has(`${item.PID}`)) {
          continue
        }
        if (
          item.COMMAND.includes('FlyEnv-Data') ||
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
          await ProcessKill('-INT', arr)
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
