import JSON5 from 'json5'
import type { PItem } from './Process'
import Helper from '../fork/Helper'

// export type PItem = {
//   ProcessId: number
//   ParentProcessId: number
//   CommandLine: string
//   children?: PItem[]
// }

export const ProcessPidList = async (): Promise<PItem[]> => {
  console.log('ProcessPidList !!!')
  const all: PItem[] = []
  try {
    const content: string = (await Helper.send('tools', 'processListWin')) as any
    const list = JSON5.parse(content)
    all.push(
      ...list.map((m: any) => {
        return {
          PID: `${m.ProcessId}`,
          PPID: `${m.ParentProcessId}`,
          COMMAND: m.CommandLine
        }
      })
    )
  } catch (e) {
    console.log('ProcessPidList err0: ', e)
  }
  return all
}

export const ProcessPidListByPids = async (pids: (string | number)[]): Promise<string[]> => {
  const all: Set<string> = new Set()
  const arr = await ProcessPidList()
  const find = (ppid: string | number) => {
    ppid = Number(ppid)
    for (const item of arr) {
      if (`${item.PPID}` === `${ppid}`) {
        console.log('find: ', ppid, item)
        all.add(item.PID!)
        find(item.PID!)
      }
    }
  }

  for (const pid of pids) {
    const pidNum = `${pid}`
    if (arr.find((a) => `${a.PID}` === pidNum)) {
      all.add(pidNum)
      find(pidNum)
    }
    const item = arr.find((a) => `${a.PPID}` === pidNum)
    if (item) {
      all.add(pidNum)
      all.add(item.PID)
      find(pidNum)
      find(item.PID)
    }
  }
  return [...all]
}

export const ProcessPidListByPid = async (pid: string | number): Promise<string[]> => {
  pid = `${pid}`
  const all: Set<string> = new Set()
  const arr = await ProcessPidList()
  const find = (ppid: string | number) => {
    ppid = `${ppid}`
    for (const item of arr) {
      if (`${item.PPID}` === ppid) {
        console.log('find: ', ppid, item)
        all.add(item.PID!)
        find(item.PID!)
      }
    }
  }
  if (arr.find((a) => `${a.PID}` === `${pid}`)) {
    all.add(pid)
    find(pid)
  }
  const item = arr.find((a) => `${a.PPID}` === `${pid}`)
  if (item) {
    all.add(pid)
    all.add(item.PID)
    find(pid)
    find(item.PID)
  }
  return [...all]
}

export const ProcessListSearch = async (search: string, aA = true): Promise<PItem[]> => {
  const all: PItem[] = []
  if (!search) {
    return all
  }
  const arr = await ProcessPidList()
  const find = (ppid: string | number) => {
    ppid = `${ppid}`
    for (const item of arr) {
      if (`${item.PPID}` === `${ppid}`) {
        if (!all.find((f) => `${f.PID}` === `${item.PID}`)) {
          all.push(item)
          find(item.PID!)
        }
      }
    }
  }
  for (const item of arr) {
    const b = `${item.PID}` === `${search}`
    const c = `${item.PPID}` === `${search}`

    if (!aA) {
      search = search.toLowerCase()
      const a = item?.COMMAND && item.COMMAND.toLowerCase().includes(search)
      if (a || b || c) {
        if (!all.find((f) => `${f.PID}` === `${item.PID}`)) {
          all.push(item)
          find(item.PID!)
        }
      }
    } else {
      const a = item?.COMMAND && item.COMMAND.includes(search)
      if (a || b || c) {
        if (!all.find((f) => `${f.PID}` === `${item.PID}`)) {
          all.push(item)
          find(item.PID!)
        }
      }
    }
  }
  return all
}
