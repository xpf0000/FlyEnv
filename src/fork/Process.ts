import { execPromiseRoot } from './Fn'

type PItem = {
  ProcessId: string
  ParentProcessId: string
  commandline: string
}

export const ProcessPidListByPid = async (pid: string): Promise<string[]> => {
  const all: Set<string> = new Set()
  let res = ''
  try {
    res = (
      await execPromiseRoot('wmic process get ProcessId,ParentProcessId,commandline /format:list')
    ).stdout
  } catch (e) {}
  if (!res) {
    return []
  }
  const arr = res
    .trim()
    .split(`\r\r\n\r\r\n\r\r\n`)
    .map((s) => {
      const obj: any = {}
      s.split('\r\r\n')
        .filter((s) => !!s.trim())
        .forEach((f) => {
          const item = f.split('=')
          const k = item.shift() ?? ''
          const v = item.join('=')
          obj[k] = v
        })
      return obj as PItem
    })
  const find = (ppid: string) => {
    for (const item of arr) {
      if (item.ParentProcessId === ppid) {
        console.log('find: ', ppid, item)
        all.add(item.ProcessId!)
        find(item.ProcessId!)
      }
    }
  }
  if (arr.find((a) => a.ProcessId === pid)) {
    all.add(pid)
    find(pid)
  }
  return [...all]
}

export const ProcessListSearch = async (search: string, aA = true) => {
  const all: PItem[] = []
  let res = ''
  try {
    res = (
      await execPromiseRoot('wmic process get ProcessId,ParentProcessId,commandline /format:list')
    ).stdout
  } catch (e) {}
  if (!res) {
    return []
  }
  const arr = res
    .trim()
    .split(`\r\r\n\r\r\n\r\r\n`)
    .map((s) => {
      const obj: any = {}
      s.split('\r\r\n')
        .filter((s) => !!s.trim())
        .forEach((f) => {
          const item = f.split('=')
          const k = item.shift() ?? ''
          const v = item.join('=')
          obj[k] = v
        })
      return obj as PItem
    })
  const find = (ppid: string) => {
    for (const item of arr) {
      if (item.ParentProcessId === ppid) {
        if (!all.find((f) => f.ProcessId === item.ProcessId)) {
          all.push(item)
          find(item.ProcessId!)
        }
      }
    }
  }
  for (const item of arr) {
    if (!aA) {
      search = search.toLowerCase()
      if (item.commandline.toLowerCase().includes(search)) {
        if (!all.find((f) => f.ProcessId === item.ProcessId)) {
          all.push(item)
          find(item.ProcessId!)
        }
      }
    } else {
      if (item.commandline.includes(search)) {
        if (!all.find((f) => f.ProcessId === item.ProcessId)) {
          all.push(item)
          find(item.ProcessId!)
        }
      }
    }
  }
  return all
}
