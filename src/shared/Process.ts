export type PItem = {
  PID: string
  PPID: string
  COMMAND: string
  USER: string
  children?: PItem[]
}

export const ProcessPidsByPid = (pid: string, arr: PItem[]): string[] => {
  const all: Set<string> = new Set()
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

export const ProcessListByPid = (pid: string, arr: PItem[]): PItem[] => {
  const all: Set<string> = new Set()
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
