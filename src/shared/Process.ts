import Helper from '../fork/Helper'
import { AppHelperCheck } from '@shared/AppHelperCheck'
import { execPromiseWithEnv } from '@shared/child-process'
import { isWindows } from '@shared/utils'

export type PItem = {
  PID: string
  PPID: string
  COMMAND: string
  USER: string
  children?: PItem[]
}

export const ProcessListFetch = async (): Promise<PItem[]> => {
  let useHelper = false
  try {
    if (Helper.enable) {
      useHelper = true
    } else if (await AppHelperCheck()) {
      useHelper = true
    }
  } catch {
    useHelper = false
  }
  if (useHelper) {
    return (await Helper.send('tools', 'processList')) as any
  }
  const command = `ps axo user,pid,ppid,command`
  const std = await execPromiseWithEnv(command)
  const stdout = std.stdout.trim()
  return stdout
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
      }
    }) as any
}

export const ProcessPidsByPid = (pid: string, arr: PItem[]): string[] => {
  const all: Set<string> = new Set()
  const find = (ppid: string) => {
    for (const item of arr) {
      if (item.PPID === ppid) {
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

export const ProcessListByPid = (pid: string, arr: PItem[]): PItem[] => {
  const all: Set<string> = new Set()
  const find = (ppid: string) => {
    for (const item of arr) {
      if (item.PPID === ppid) {
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
  return Array.from(all).map((pid) => {
    const find = arr.find((item) => item.PID === pid)
    if (find) {
      return find
    }
    return {
      USER: '',
      PID: pid,
      PPID: '',
      COMMAND: ''
    } as PItem
  })
}

export const ProcessSearch = (search: string, aA = true, arr: PItem[]) => {
  const all: PItem[] = []
  if (!search) {
    return all
  }
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
    const b = `${item.PID}` === `${search}`
    const c = `${item.PPID}` === `${search}`

    if (!aA) {
      search = search.toLowerCase()
      const a = item?.COMMAND && item.COMMAND.toLowerCase().includes(search)
      if (a || b || c) {
        if (!all.find((f) => f.PID === item.PID)) {
          all.push(item)
          find(item.PID!)
        }
      }
    } else {
      const a = item?.COMMAND && item.COMMAND.includes(search)
      if (a || b || c) {
        if (!all.find((f) => f.PID === item.PID)) {
          all.push(item)
          find(item.PID!)
        }
      }
    }
  }
  return all
}

export const ProcessKill = async (sig: string, pids: string[]) => {
  if (!pids.length) {
    return
  }
  let useHelper = false
  try {
    if (Helper.enable) {
      useHelper = true
    } else if (await AppHelperCheck()) {
      useHelper = true
    }
  } catch {
    useHelper = false
  }
  if (useHelper) {
    await Helper.send('tools', 'kill', sig, pids)
    return
  }

  let command = ``
  if (isWindows()) {
    command = `taskkill /f /pid ${pids.join(' /pid ')}`
  } else {
    command = `kill ${sig} ${pids.join(' ')}`
  }
  await execPromiseWithEnv(command)
}

export const fetchProcessPidByPort = async (port: string): Promise<PItem[]> => {
  const command = `lsof -nP -i:${port} | awk '{print $1,$2,$3}'`
  let content: string = ''
  try {
    const res = await execPromiseWithEnv(command)
    content = res.stdout.trim()
  } catch {
    return []
  }

  const list: string[] = content.split('\n').filter((line) => line.trim().length > 0)
  const pids: PItem[] = []
  for (const item of list) {
    const arr: string[] = item.split(' ').filter((s) => s.trim().length > 0)
    if (arr.length >= 3) {
      const command = arr[0]
      const pid = arr[1]
      const user = arr[2]
      pids.push({
        COMMAND: command,
        PID: pid,
        USER: user,
        PPID: ''
      })
    }
  }
  if (pids.length > 0) {
    const all = await ProcessListFetch()
    pids.forEach((item) => {
      const find = all.find((f) => f.PID === item.PID)
      if (find) {
        Object.assign(item, find)
      }
    })
  }
  return pids
}
