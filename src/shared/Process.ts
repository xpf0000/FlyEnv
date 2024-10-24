import { execPromiseRoot } from '@shared/Exec'

export const ProcessPidListByPid = async (pid: string) => {
  const all: Set<string> = new Set()
  let res = ''
  try {
    res = (await execPromiseRoot('ps axo ppid,pid')).stdout
  } catch (e) {}
  if (!res) {
    return []
  }
  const arr = res
    .trim()
    .split('\n')
    .map((s) => {
      const item = s
        .trim()
        .split(' ')
        .filter((f) => !!f.trim())
        .map((m) => m.trim())
      const ppid = item.shift() ?? '0'
      const pid = item.shift() ?? '0'
      return {
        ppid,
        pid
      }
    })
  const find = (ppid: string) => {
    for (const item of arr) {
      if (item.ppid === ppid) {
        console.log('find: ', ppid, item)
        all.add(item.pid!)
        find(item.pid!)
      }
    }
  }
  if (arr.find((a) => a.pid === pid)) {
    all.add(pid)
    find(pid)
  }
  return [...all]
}

export type ProcessListSearchItem = {
  user: string
  pid: string
  ppid: string
  command: string
}

export const ProcessListSearch = async (search: string, aA = true) => {
  const all: ProcessListSearchItem[] = []
  let res = ''
  try {
    res = (await execPromiseRoot('ps axo user,ppid,pid,command')).stdout
  } catch (e) {}
  if (!res) {
    return []
  }
  const arr = res
    .trim()
    .split('\n')
    .map((s) => {
      const item = s
        .trim()
        .split(' ')
        .filter((f) => !!f.trim())
        .map((m) => m.trim())
      const user = item.shift() ?? '0'
      const ppid = item.shift() ?? '0'
      const pid = item.shift() ?? '0'
      const command = item.join(' ')
      return {
        user,
        ppid,
        pid,
        command
      }
    })
  const find = (ppid: string) => {
    for (const item of arr) {
      if (item.ppid === ppid) {
        if (!all.find((f) => f.pid === item.pid)) {
          all.push(item)
          find(item.pid!)
        }
      }
    }
  }
  for (const item of arr) {
    if (!aA) {
      search = search.toLowerCase()
      if (item.command.toLowerCase().includes(search)) {
        if (!all.find((f) => f.pid === item.pid)) {
          all.push(item)
          find(item.pid!)
        }
      }
    } else {
      if (item.command.includes(search)) {
        if (!all.find((f) => f.pid === item.pid)) {
          all.push(item)
          find(item.pid!)
        }
      }
    }
  }
  return all
}
