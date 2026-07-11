import JSON5 from 'json5'
import type { PItem } from './Process'
import Helper from '../fork/Helper'
import { AppHelperCheck } from '@shared/AppHelperCheck'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { appDebugLog, uuid } from '@shared/utils'
import { execPromiseWithEnv } from '@shared/child-process'
import { readFile, remove } from '@shared/fs-extra'
import EnvSync from '@shared/EnvSync'

const shouldUseHelper = async () => {
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
  return useHelper
}

const normalizeWindowsProcessList = (parsed: any): PItem[] => {
  const list = Array.isArray(parsed) ? parsed : parsed ? [parsed] : []
  return list.map((m: any) => ({
    PID: `${m.ProcessId}`,
    PPID: `${m.ParentProcessId}`,
    USER: '',
    COMMAND: m.CommandLine ?? ''
  }))
}

export const ProcessPidListStrict = async (): Promise<PItem[]> => {
  if (await shouldUseHelper()) {
    try {
      const content: string = (await Helper.send('tools', 'processListWin')) as any
      return normalizeWindowsProcessList(JSON5.parse(content))
    } catch (error) {
      appDebugLog('[ProcessPidList][helper-fallback]', `${error}`).catch()
    }
  }

  const file = join(tmpdir(), `${uuid()}.json`).split('\\').join('/')
  try {
    const command = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;[Console]::InputEncoding = [System.Text.Encoding]::UTF8;Get-CimInstance Win32_Process | Select-Object CommandLine,ProcessId,ParentProcessId,CreationClassName | ConvertTo-Json | Out-File -FilePath "${file}" -Encoding utf8`
    await EnvSync.sync()
    await execPromiseWithEnv(command, {
      shell: EnvSync.PowerShellPath || 'powershell.exe'
    })
    const content = await readFile(file, 'utf-8')
    return normalizeWindowsProcessList(JSON5.parse(content))
  } finally {
    await remove(file).catch(() => {})
  }
}

export const ProcessPidList = async (): Promise<PItem[]> => {
  try {
    return await ProcessPidListStrict()
  } catch (error) {
    appDebugLog('[ProcessPidList][error]', `${error}`).catch()
    return []
  }
}

export const ProcessPidListByPids = async (
  pids: (string | number)[],
  processList?: PItem[]
): Promise<string[]> => {
  const all: Set<string> = new Set(pids as any)
  const arr = processList ?? (await ProcessPidList())
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

export const ProcessPidListByPid = async (
  pid: string | number,
  processList?: PItem[]
): Promise<string[]> => {
  pid = `${pid}`
  const all: Set<string> = new Set([pid])
  const arr = processList ?? (await ProcessPidList())
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

export const ProcessListSearch = async (
  search: string,
  aA = true,
  processList?: PItem[]
): Promise<PItem[]> => {
  const all: PItem[] = []
  if (!search) {
    return all
  }
  let arr: PItem[] = []
  try {
    arr = processList ?? (await ProcessPidList())
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

export const fetchProcessPidByPort = async (port: string): Promise<string[]> => {
  const command = `netstat -ano`
  let content: string = ''
  try {
    await EnvSync.sync()
    const res = await execPromiseWithEnv(command, {
      shell: EnvSync.PowerShellPath || 'powershell.exe'
    })
    content = res.stdout.trim()
  } catch (e) {
    console.error('fetchProcessPidByPort error: ', e)
    return []
  }

  const list: string[] = content.split('\n').filter((line) => line.trim().length > 0)
  const pids: Set<string> = new Set()
  for (const item of list) {
    const line = item.trim().replace(/\s+/g, ' ')
    const arr: string[] = line.split(' ')
    if (arr.length === 5) {
      const address = arr[1]
      const state = arr[3]
      const pid = arr[4]
      if (address.endsWith(`:${port}`) && state === 'LISTENING') {
        pids.add(pid)
      }
    } else if (arr.length === 4) {
      const address = arr[1]
      const pid = arr[3]
      if (address.endsWith(`:${port}`)) {
        pids.add(pid)
      }
    }
  }
  return Array.from(pids)
}
