import Helper from '../fork/Helper'
import { AppHelperCheck } from '@shared/AppHelperCheck'
import { execPromiseWithEnv } from '@shared/child-process'
import { appDebugLog, isWindows } from '@shared/utils'

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

/**
 * 按精确 PID 获取该根进程及其完整子进程树。
 * 只接受 PID 完全相等的根节点，避免把数字 PID 当搜索词做模糊扩散匹配。
 */
export const ProcessListByExactPid = (pid: string, arr: PItem[]): PItem[] => {
  const rootPid = `${pid}`.trim()
  if (!rootPid) {
    return []
  }
  const root = arr.find((item) => item.PID === rootPid)
  if (!root) {
    return []
  }

  const all: Set<string> = new Set([rootPid])
  const find = (ppid: string) => {
    for (const item of arr) {
      if (item.PPID === ppid && !all.has(item.PID)) {
        all.add(item.PID)
        find(item.PID)
      }
    }
  }
  find(rootPid)

  return Array.from(all).map((currentPid) => {
    const item = arr.find((processItem) => processItem.PID === currentPid)
    if (item) {
      return item
    }
    return {
      USER: '',
      PID: currentPid,
      PPID: '',
      COMMAND: ''
    } as PItem
  })
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

/**
 * Electron/Chromium 的 renderer、gpu、utility 子进程不应被当作服务根进程回收。
 * stale PID 被这些子进程复用时，必须直接拒绝清理，避免误杀整棵应用进程树。
 */
export const ProcessCommandLooksLikeElectronChild = (command = '') => {
  if (!command) {
    return false
  }
  return (
    command.includes(' --type=renderer') ||
    command.includes(' --type=gpu-process') ||
    command.includes(' --type=utility')
  )
}

/**
 * 仅当 PID 当前仍归属于 FlyEnv 管理的服务时，才返回可安全回收的进程树。
 * 这里既校验 root PID 精确存在，也要求 root command 仍包含服务自身路径标记，
 * 从而拦住 stale PID 复用到 VS Code / FlyEnv Electron 进程后的误杀问题。
 */
export const ProcessOwnedPidsByPid = (
  pid: string,
  arr: PItem[],
  ownedMarkers: Array<string | null | undefined>
): string[] => {
  const tree = ProcessListByExactPid(pid, arr)
  if (tree.length === 0) {
    return []
  }
  const rootPid = `${pid}`.trim()
  const root = tree.find((item) => item.PID === rootPid)
  const command = root?.COMMAND ?? ''
  if (!command || ProcessCommandLooksLikeElectronChild(command)) {
    return []
  }
  const markers = ownedMarkers
    .map((marker) => `${marker ?? ''}`.trim())
    .filter((marker) => marker.length > 0)
  if (markers.length === 0) {
    return []
  }
  if (!markers.some((marker) => command.includes(marker))) {
    return []
  }
  return tree.map((item) => item.PID)
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
    try {
      const res = await Helper.send('tools', 'kill', sig, pids)
      appDebugLog(`[ProcessKill][helper]`, `${JSON.stringify({ res, sig, pids })}`).catch()
    } catch (e) {
      appDebugLog(`[ProcessKill][helper][error]`, `${e}`).catch()
    }
    return
  }

  let command = ``
  if (isWindows()) {
    command = `taskkill /f /pid ${pids.join(' /pid ')}`
  } else {
    command = `kill ${sig} ${pids.join(' ')}`
  }
  try {
    const res = await execPromiseWithEnv(command)
    appDebugLog(`[ProcessKill][command]`, `${JSON.stringify({ res, command })}`).catch()
  } catch (e) {
    appDebugLog(`[ProcessKill][command][error]`, `${e}`).catch()
  }
}

export const fetchProcessPidByPort = async (port: string): Promise<PItem[]> => {
  let pItems: PItem[] = []

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
    pItems = await Helper.send<PItem[]>('tools', 'getPortPids', `${port}`)
  } else {
    const command = `lsof -nP -i:${port} | awk '{print $1,$2,$3}'`
    let content: string = ''
    try {
      const res = await execPromiseWithEnv(command)
      content = res.stdout.trim()
    } catch {
      return []
    }

    const list: string[] = content.split('\n').filter((line) => line.trim().length > 0)
    for (const item of list) {
      const arr: string[] = item.split(' ').filter((s) => s.trim().length > 0)
      if (arr.length >= 3) {
        const command = arr[0]
        const pid = arr[1]
        const user = arr[2]
        pItems.push({
          COMMAND: command,
          PID: pid,
          USER: user,
          PPID: ''
        })
      }
    }
  }
  pItems = pItems.filter((p: PItem) => {
    return p.PID !== 'PID' && p.PPID !== 'PPID'
  })
  if (pItems.length > 0) {
    const allPitems: PItem[] = []
    const all = await ProcessListFetch()
    pItems.forEach((item) => {
      const finds = ProcessListByPid(item.PID, all)
      finds.forEach((fitem) => {
        if (!allPitems.some((p) => p.PID === fitem.PID)) {
          allPitems.push(fitem)
        }
      })
    })
    return allPitems
  }
  return []
}
