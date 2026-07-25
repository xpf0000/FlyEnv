import type { SoftInstalled } from '@shared/app'
import { ProcessKill, ProcessListFetch, ProcessOwnedPidsByPidAndCommand } from '@shared/Process'
import type { PItem } from '@shared/Process'
import { isWindows } from '@shared/utils'
import type { ForkManager } from './ForkManager'
import { ProcessPidList } from '@shared/Process.win'

export type ServiceProcessItem = {
  item: SoftInstalled
  pid: string
  command?: string
}

/**
 * Only return process trees whose registered root command still exactly matches its snapshot.
 */
export const ownedServicePids = (
  serviceItems: ServiceProcessItem[],
  processList: PItem[]
): string[] => {
  const pids = serviceItems.flatMap(({ command, pid }) =>
    ProcessOwnedPidsByPidAndCommand(pid, command, processList)
  )
  return Array.from(new Set(pids))
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
      const serviceItems = Object.values(this.servicePID).flat()
      const pids = new Set(ownedServicePids(serviceItems, plist))
      const TERM: Array<string> = []
      const INT: Array<string> = []
      plist
        .filter((item: PItem) => pids.has(item.PID))
        .forEach((item: PItem) => {
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
        await ProcessKill('-TERM', TERM)
      }
      if (INT.length > 0) {
        await ProcessKill('-INT', INT)
      }
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

      let plist: PItem[] = []
      try {
        plist = await ProcessPidList()
      } catch {}
      const pids = ownedServicePids(Object.values(this.servicePID).flat(), plist)
      if (pids.length > 0) {
        await ProcessKill('-INT', pids)
      }
    }
  }

  async stop() {
    try {
      await this.killAllPid()
    } catch (e) {
      console.log('killAllPid e: ', e)
    }
  }
}

export default new ServiceProcess()
