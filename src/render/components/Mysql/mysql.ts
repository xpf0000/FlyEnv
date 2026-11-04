import { defineStore } from 'pinia'
import type { MysqlGroupItem } from '@shared/app'
import { join } from '@/util/path-browserify'
import { fs } from '@/util/NodeFn'
import { forkTerminalRequest } from '@/util/ForkTerminalRequest'
import { beginServiceStatusPending, noteServiceStatusRevision } from '@/util/mcpServiceStatus'
import { I18nT } from '@lang/index'

interface State {
  inited: boolean
  all: Array<MysqlGroupItem>
}

const state: State = {
  inited: false,
  all: []
}

// 组 PID 是一次进程运行身份，不持久化进 Pinia/配置；应用重启后由 fork 的组 PID 文件恢复。
const groupPids = new WeakMap<object, string>()
let initFlight: Promise<void> | undefined
const groupFlights = new WeakMap<
  object,
  { action: 'start' | 'stop'; promise: Promise<true | string> }
>()

/** 同一组的重复动作共享 flight；相反动作等前一终态，失败时不吞掉原错误。 */
function runGroupFlight(
  item: MysqlGroupItem,
  action: 'start' | 'stop',
  task: () => Promise<true | string>
): Promise<true | string> {
  const current = groupFlights.get(item)
  if (current) {
    if (current.action === action) return current.promise
    return current.promise.then((result) =>
      result === true ? runGroupFlight(item, action, task) : result
    )
  }
  const promise = Promise.resolve()
    .then(task)
    .catch((error) => (error instanceof Error ? error.message : String(error)))
    .finally(() => {
      if (groupFlights.get(item)?.promise === promise) groupFlights.delete(item)
    })
  groupFlights.set(item, { action, promise })
  return promise
}

export const MysqlStore = defineStore('mysqlGroup', {
  state: (): State => state,
  getters: {},
  actions: {
    /** MCP/退出登记同样包含组实例；只按组自己的配置键同步，不能用共用 mysqld.exe 匹配。 */
    syncServiceStatus(instances: Array<{ bin?: string; pid?: string }>) {
      const pathKey = (value: string) => {
        const normalized = value.replace(/\\/g, '/')
        return window.Server.isWindows ? normalized.toLowerCase() : normalized
      }
      for (const item of this.all) {
        // 本地操作终态负责提交状态，广播不能覆盖正在准备/停止的组。
        if (item.version.fetching) continue
        const key = pathKey(join(window.Server.MysqlDir!, `group/my-group-${item.id}.cnf`))
        const hit = instances.find((instance) => instance.bin && pathKey(instance.bin) === key)
        if (hit && isPositiveHostPid(hit.pid)) {
          groupPids.set(item, `${hit.pid}`)
          item.version.running = true
        } else {
          groupPids.delete(item)
          item.version.running = false
        }
      }
    },
    async init(): Promise<void> {
      if (this.inited) return
      if (initFlight) return initFlight
      const flight = (async () => {
        const file = join(window.Server.MysqlDir!, 'group/group.json')
        if (await fs.existsSync(file)) {
          const json = await fs.readFile(file)
          const jsonArr: any[] = JSON.parse(json)
          jsonArr.forEach((j: any) => {
            delete j?.version?.fetching
            delete j?.version?.running
          })
          this.all.push(...jsonArr)
        }
        this.inited = true
      })()
      initFlight = flight
      try {
        await flight
      } finally {
        if (initFlight === flight) initFlight = undefined
      }
    },
    async save() {
      const json = JSON.parse(JSON.stringify(this.all))
      json.forEach((j: any) => {
        delete j?.version?.fetching
        delete j?.version?.running
      })
      const groupDir = join(window.Server.MysqlDir!, 'group')
      await fs.mkdirp(groupDir)
      const file = join(groupDir, 'group.json')
      await fs.writeFile(file, JSON.stringify(json))
    },
    start(item: MysqlGroupItem): Promise<true | string> {
      return runGroupFlight(item, 'start', async () => {
        item.version.fetching = true
        const finishPending = beginServiceStatusPending('mysql')
        try {
          // 使用通用 Base 生命周期入口；group 只作为模块私有额外参数传入，携带启动时快照。
          const group = JSON.parse(JSON.stringify(item))
          delete group.version?.fetching
          delete group.version?.running
          const result = await forkTerminalRequest(
            'app-fork:mysql',
            ['startService', group.version, { group }],
            I18nT('setup.windowsPrivilege.timeout')
          )
          finishPending()
          noteServiceStatusRevision('mysql', result?.serviceStatusRevision)
          if (result?.code !== 0) return result?.msg ?? 'MySQL group start failed'
          const pid = result?.data?.['APP-Service-Start-PID']
          if (typeof pid !== 'string' || !/^\d+$/.test(pid) || Number(pid) <= 0) {
            return 'MySQL group start did not return a valid server PID'
          }
          groupPids.set(item, pid)
          item.version.running = true
          return true
        } catch (error) {
          finishPending()
          return error instanceof Error ? error.message : String(error)
        } finally {
          item.version.fetching = false
        }
      })
    },
    stop(item: MysqlGroupItem): Promise<true | string> {
      return runGroupFlight(item, 'stop', async () => {
        item.version.fetching = true
        const finishPending = beginServiceStatusPending('mysql')
        try {
          const group = JSON.parse(JSON.stringify(item))
          delete group.version?.fetching
          delete group.version?.running
          // UI 传入的 version.bin 是共享 mysqld.exe；停止定位必须使用本组配置键和本次 PID。
          // 应用重启后 WeakMap 为空，空 PID 让 fork 仅凭本组私有 pid/config 文件恢复身份。
          const target = {
            ...group.version,
            bin: join(window.Server.MysqlDir!, `group/my-group-${group.id}.cnf`),
            pid: groupPids.get(item) ?? ''
          }
          const result = await forkTerminalRequest(
            'app-fork:mysql',
            ['stopService', target, { group }],
            I18nT('setup.windowsPrivilege.timeout')
          )
          finishPending()
          noteServiceStatusRevision('mysql', result?.serviceStatusRevision)
          if (result?.code !== 0) return result?.msg ?? 'MySQL group stop failed'
          groupPids.delete(item)
          item.version.running = false
          return true
        } catch (error) {
          finishPending()
          // 未确认停止时保留 running，用户可以重试；超时不等于服务已经退出。
          return error instanceof Error ? error.message : String(error)
        } finally {
          item.version.fetching = false
        }
      })
    },
    async groupStart(): Promise<true | string> {
      try {
        await this.init()
        const results = await Promise.all(this.all.map((item) => this.start(item)))
        const errors = results.filter((result): result is string => typeof result === 'string')
        return errors.length ? errors.join('\n') : true
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }
    },
    async groupStop(): Promise<true | string> {
      try {
        const results = await Promise.all(this.all.map((item) => this.stop(item)))
        const errors = results.filter((result): result is string => typeof result === 'string')
        return errors.length ? errors.join('\n') : true
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }
    }
  }
})
