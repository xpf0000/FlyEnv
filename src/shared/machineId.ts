import _node_machine_id from 'node-machine-id'
import { createHash } from 'crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import EnvSync from './EnvSync'
import { powerShellInlineArgs } from './PowerShellCommand'
import { isWindows } from './utils'

const execFilePromise = promisify(execFile)

const { machineId: nodeMachineId } = _node_machine_id

const GUID_REG = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

const sha256 = (str: string) => createHash('sha256').update(str).digest('hex')

const powerShellPath = async (): Promise<string> => {
  try {
    await EnvSync.sync()
  } catch {}
  const systemPath = EnvSync.SystemPath || 'C:\\Windows\\System32'
  const systemRoot = dirname(systemPath)
  const candidates = [
    EnvSync.PowerShellPath,
    join(systemRoot, 'Sysnative', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  ].filter(Boolean) as string[]
  return candidates.find((p) => existsSync(p)) || 'powershell.exe'
}

const powershellFetchGuid = async (script: string): Promise<string> => {
  const bin = await powerShellPath()
  const res = await execFilePromise(bin, powerShellInlineArgs(script), {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30_000
  })
  const guid = `${res?.stdout ?? ''}`.trim()
  if (!GUID_REG.test(guid)) {
    throw new Error(`Invalid machine id: "${guid}"`)
  }
  return guid.toLowerCase()
}

const fetchMachineGuidByPowerShell = () =>
  powershellFetchGuid(
    `(Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Cryptography' -Name MachineGuid).MachineGuid`
  )

const fetchBiosUuidByPowerShell = () =>
  powershellFetchGuid(`(Get-CimInstance -ClassName Win32_ComputerSystemProduct).UUID`)

export async function machineId(original?: boolean): Promise<string> {
  try {
    const id = await nodeMachineId(original)
    if (id) {
      return id
    }
  } catch {}
  if (isWindows()) {
    const errors: string[] = []
    for (const fetch of [fetchMachineGuidByPowerShell, fetchBiosUuidByPowerShell]) {
      try {
        const raw = await fetch()
        return original ? raw : sha256(raw)
      } catch (e) {
        errors.push(`${e}`)
      }
    }
    throw new Error(`Unable to obtain machine id: ${errors.join('; ')}`)
  }
  throw new Error('Unable to obtain machine id')
}
