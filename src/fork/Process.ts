import { execPromiseRoot, uuid } from './Fn'
import { join } from 'path'
import { existsSync } from 'fs'
import { readFile, remove } from 'fs-extra'

export type PItem = {
  ProcessId: string
  ParentProcessId: string
  commandline: string
}

export const ProcessPidList = async (): Promise<PItem[]> => {
  const tmpl = join(global.Server.Cache!, `${uuid()}`)
  try {
    await execPromiseRoot(
      `wmic process get ProcessId,ParentProcessId,commandline /format:list > "${tmpl}"`
    )
  } catch (e) {}
  if (!existsSync(tmpl)) {
    return []
  }
  const res = await readFile(tmpl, 'ucs-2')
  await remove(tmpl)
  return res
    .trim()
    .split(`\r\n\r\n\r\n`)
    .map((s) => {
      const obj: any = {}
      s.split('\r\n')
        .filter((s) => !!s.trim())
        .forEach((f) => {
          const item = f.split('=')
          const k = item?.shift()?.trim() ?? ''
          const v = item?.join('=')?.trim() ?? ''
          obj[k] = v
        })
      return obj as PItem
    })
}

export const ProcessPidListByPid = async (pid: string): Promise<string[]> => {
  const all: Set<string> = new Set()
  const arr = await ProcessPidList()
  console.log('arr: ', pid, arr)
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
  const item = arr.find((a) => a.ParentProcessId === pid)
  if (item) {
    all.add(pid)
    all.add(item.ProcessId)
    find(pid)
    find(item.ProcessId)
  }
  return [...all]
}

export const ProcessListSearch = async (search: string, aA = true) => {
  const all: PItem[] = []
  const arr = await ProcessPidList()
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
