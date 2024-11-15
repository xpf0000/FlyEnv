import { execPromiseRoot } from '@shared/Exec'

export type PItem = {
  PID: string
  PPID: string
  COMMAND: string
  USER: string
  children?: PItem[]
}

export const ProcessPidList = async (): Promise<PItem[]> => {
  let res = ''
  try {
    res = (await execPromiseRoot(`ps axo user,pid,ppid,command`)).stdout
  } catch (e) {}
  if (!res) {
    return []
  }
  return res
    .trim()
    .split(`\n`)
    .filter((s) => !!s.trim())
    .map((s) => {
      const arr = s.split(' ').filter((s) => !!s.trim())
      const USER = arr.shift()
      const PID = arr.shift()
      const PPID = arr.shift()
      const COMMAND = arr.join(' ')
      return {
        USER,
        PID,
        PPID,
        COMMAND
      } as PItem
    })
}

export const ProcessPidListByPids = async (pids: string[]): Promise<string[]> => {
  const all: Set<string> = new Set()
  const arr = await ProcessPidList()
  console.log('arr: ', pids, arr)
  const find = (ppid: string) => {
    for (const item of arr) {
      if (item.PPID === ppid) {
        console.log('find: ', ppid, item)
        all.add(item.PID!)
        find(item.PID!)
      }
    }
  }

  for (const pid of pids) {
    if (arr.find((a) => a.PID === pid)) {
      all.add(pid)
      find(pid)
    }
    const item = arr.find((a) => a.PPID === pid)
    if (item) {
      all.add(pid)
      all.add(item.PID)
      find(pid)
      find(item.PID)
    }
  }
  return [...all]
}

export const ProcessPidListByPid = async (pid: string): Promise<string[]> => {
  const all: Set<string> = new Set()
  const arr = await ProcessPidList()
  console.log('arr: ', pid, arr)
  const find = (ppid: string) => {
    for (const item of arr) {
      if (item.PPID === ppid) {
        console.log('find: ', ppid, item)
        all.add(item.PID!)
        find(item.PID!)
      }
    }
  }
  if (arr.find((a) => a.PID === pid)) {
    all.add(pid)
    find(pid)
  }
  const item = arr.find((a) => a.PPID === pid)
  if (item) {
    all.add(pid)
    all.add(item.PID)
    find(pid)
    find(item.PID)
  }
  return [...all]
}

export const ProcessListSearch = async (search: string, aA = true) => {
  const all: PItem[] = []
  if (!search) {
    return all
  }
  const arr = await ProcessPidList()
  const find = (ppid: string) => {
    for (const item of arr) {
      if (item.PPID === ppid) {
        if (!all.find((f) => f.PID === item.PID)) {
          all.push(item)
          find(item.PID!)
        }
      }
    }
  }
  for (const item of arr) {
    if (!item?.COMMAND) {
      console.log('!item?.COMMAND: ', item)
    }
    if (!aA) {
      search = search.toLowerCase()
      if (item?.COMMAND && item.COMMAND.toLowerCase().includes(search)) {
        if (!all.find((f) => f.PID === item.PID)) {
          all.push(item)
          find(item.PID!)
        }
      }
    } else {
      if (item?.COMMAND && item.COMMAND.includes(search)) {
        if (!all.find((f) => f.PID === item.PID)) {
          all.push(item)
          find(item.PID!)
        }
      }
    }
  }
  return all
}
