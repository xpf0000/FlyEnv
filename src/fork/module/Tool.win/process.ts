import { ForkPromise } from '@shared/ForkPromise'
import { PItem, ProcessKillStrict, ProcessListByExactPid } from '@shared/Process'
import { fetchProcessPidByPort, ProcessListSearch, ProcessPidListStrict } from '@shared/Process.win'
import Helper from '../../Helper'

export function getPidsByKey(name: string) {
  return new ForkPromise(async (resolve) => {
    // 查询失败与“找不到匹配进程”不同，不能吞成空列表误导后续停止选择。
    const list: PItem[] = await ProcessListSearch(name, false, await ProcessPidListStrict())

    const arrs: PItem[] = []

    const findSub = (item: PItem) => {
      const sub: PItem[] = []
      for (const s of list) {
        if (s.PPID === item.PID) {
          sub.push(s)
        }
      }
      if (sub.length > 0) {
        item.children = sub
      }
    }

    for (const item of list) {
      findSub(item)
      const p = list.find((s: PItem) => s.PID === item.PPID)
      if (!p) {
        arrs.push(item)
      }
    }

    resolve(arrs)
  })
}

export function killPids(sig: string, pids: Array<string>) {
  return new ForkPromise(async (resolve) => {
    // ForkPromise 会接收 async executor 的拒绝；权限失败不再被工具入口吞成 true。
    await ProcessKillStrict(sig, pids)
    resolve(true)
  })
}

export function getPortPids(name: string) {
  return new ForkPromise(async (resolve) => {
    // 端口查询失败必须到达调用终态；真正没有监听者才返回空列表。
    let pids = await fetchProcessPidByPort(name)
    pids = Array.from(new Set(pids))
    pids = pids
      .map((m) => m.trim())
      .filter((p) => {
        return !!p && p !== '0'
      })
    if (pids.length === 0) {
      return resolve([])
    }
    const arr: PItem[] = []
    console.log('pids: ', pids)
    const all = await ProcessPidListStrict()
    for (const pid of pids) {
      // 展示端口所有者及其子孙时只按精确根 PID，不能把数字作为命令子串搜索。
      const item = ProcessListByExactPid(pid, all)
      for (const p of item) {
        const find = arr.find((s: PItem) => s.PID === p.PID)
        if (!find) {
          arr.push(p)
        }
      }
    }
    resolve(arr)
  })
}

export function killPorts(ports: Array<string>) {
  return new ForkPromise(async (resolve) => {
    // 复用端口专用权限动作：它在授权前固定监听者身份，执行前重查同一端口，
    // 拒绝新占用者。旧实现把查询失败吞成 []，再另查树并按 PID 结束，既可能
    // 误报成功，也会丢掉两次查询之间的身份连续性。端口工具只停监听者，模块
    // 服务的完整树停止仍由对应模块负责，不在此推测服务归属或扩大成后代。
    await Helper.send('tools', 'killPorts', ports)
    resolve(true)
  })
}
