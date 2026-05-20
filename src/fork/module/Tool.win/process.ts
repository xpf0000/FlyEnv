import { ForkPromise } from '@shared/ForkPromise'
import { PItem, ProcessKill, ProcessListByPid } from '@shared/Process'
import {
  fetchProcessPidByPort,
  ProcessListSearch,
  ProcessPidList,
  ProcessPidListByPids
} from '@shared/Process.win'

export function getPidsByKey(name: string) {
  return new ForkPromise(async (resolve) => {
    let list: PItem[] = []
    try {
      list = await ProcessListSearch(name, false)
    } catch {}

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
    try {
      await ProcessKill('-INT', pids)
    } catch {}
    resolve(true)
  })
}

export function getPortPids(name: string) {
  return new ForkPromise(async (resolve) => {
    let pids: string[] = []
    try {
      pids = await fetchProcessPidByPort(name)
    } catch {}
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
    const all = await ProcessPidList()
    for (const pid of pids) {
      const item = ProcessListByPid(pid, all)
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
    const list: string[] = []
    for (const port of ports) {
      let portList: string[] = []
      try {
        portList = await fetchProcessPidByPort(port)
      } catch {
        portList = []
      }
      list.push(...portList)
    }

    const pids = Array.from(new Set(list))
    if (pids.length === 0) {
      return resolve(true)
    }
    console.log('pids: ', pids)
    const all = await ProcessPidListByPids(pids)
    if (!all.length) {
      return resolve(true)
    }
    try {
      await ProcessKill('-INT', all)
    } catch {}
    resolve(true)
  })
}
