import { ForkPromise } from '@shared/ForkPromise'
import {
  fetchProcessPidByPort,
  ProcessKillStrict,
  ProcessListFetch,
  ProcessSearch
} from '@shared/Process'
import Helper from '../../Helper'
import { isWindows } from '@shared/utils'

export function killPorts(ports: Array<string>) {
  return new ForkPromise(async (resolve) => {
    // 查询/执行错误在各平台都必须向终态传播，空端口幂等由执行层明确判断。
    // ForkPromise 会接收 async executor 的异常，不需要吞错后返回 true。
    if (!isWindows()) {
      const failures: string[] = []
      for (const port of [...new Set(ports)]) {
        try {
          const targets = await fetchProcessPidByPort(port)
          await ProcessKillStrict(
            '-9',
            targets.map((item) => item.PID)
          )
        } catch (error) {
          failures.push(`${port}: ${error}`)
        }
      }
      if (failures.length) throw new Error(failures.join('\n'))
    } else await Helper.send('tools', 'killPorts', ports)
    resolve(true)
  })
}

export function killPids(sig: string, pids: Array<string>) {
  return new ForkPromise(async (resolve) => {
    // 进程工具也使用严格执行，不经 Unix 的兼容尽力停止包装吞掉真实错误。
    await ProcessKillStrict(sig, pids)
    resolve(true)
  })
}

export function getPortPids(port: string) {
  return new ForkPromise(async (resolve) => {
    const arr = await fetchProcessPidByPort(port)
    resolve(arr)
  })
}

export function getPidsByKey(key: string) {
  return new ForkPromise(async (resolve) => {
    // 读取失败不是“零匹配”，同样保留明确的查询失败终态。
    const plist = await ProcessListFetch()
    const arr = ProcessSearch(key, false, plist)
    resolve(arr)
  })
}
