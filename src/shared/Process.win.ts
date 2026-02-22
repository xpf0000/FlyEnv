import JSON5 from 'json5'
import type { PItem } from './Process'
import Helper from '../fork/Helper'
import { AppHelperCheck } from '@shared/AppHelperCheck'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { appDebugLog, uuid } from '@shared/utils'
import { execPromiseWithEnv } from '@shared/child-process'
import { readFile, remove } from '@shared/fs-extra'

export const ProcessPidList = async (): Promise<PItem[]> => {
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
  const all: PItem[] = []

  if (useHelper) {
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
    return all
  }

  try {
    const file = join(tmpdir(), `${uuid()}.json`)
    const command = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;[Console]::InputEncoding = [System.Text.Encoding]::UTF8;Get-CimInstance Win32_Process | Select-Object CommandLine,ProcessId,ParentProcessId,CreationClassName | ConvertTo-Json | Out-File -FilePath '${file}' -Encoding utf8`
    await execPromiseWithEnv(command)
    const content = await readFile(file, 'utf-8')
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
    remove(file).catch()
  } catch (e) {
    appDebugLog(`[ProcessPidList][error]`, `${e}`).catch()
  }
  return all
}

export const ProcessPidListByPids = async (pids: (string | number)[]): Promise<string[]> => {
  const all: Set<string> = new Set(pids as any)
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
  const all: Set<string> = new Set([pid])
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
  let arr: PItem[] = []
  try {
    arr = await ProcessPidList()
  } catch (e) {
    console.log('ProcessListSearch error: ', e)
    return []
  }
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
