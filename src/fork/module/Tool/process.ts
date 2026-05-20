import { ForkPromise } from '@shared/ForkPromise'
import {
  fetchProcessPidByPort,
  ProcessKill,
  ProcessListFetch,
  ProcessSearch
} from '@shared/Process'
import Helper from '../../Helper'

export function killPorts(ports: Array<string>) {
  return new ForkPromise(async (resolve) => {
    try {
      await Helper.send('tools', 'killPorts', ports)
    } catch {}
    resolve(true)
  })
}

export function killPids(sig: string, pids: Array<string>) {
  return new ForkPromise(async (resolve) => {
    try {
      await ProcessKill(sig, pids)
    } catch {}
    resolve(true)
  })
}

export function getPortPids(port: string) {
  return new ForkPromise(async (resolve) => {
    let arr: any
    try {
      arr = await fetchProcessPidByPort(port)
    } catch {}
    resolve(arr)
  })
}

export function getPidsByKey(key: string) {
  return new ForkPromise(async (resolve) => {
    let arr: any = []
    try {
      const plist: any = await ProcessListFetch()
      arr = ProcessSearch(key, false, plist)
    } catch {}
    resolve(arr)
  })
}
