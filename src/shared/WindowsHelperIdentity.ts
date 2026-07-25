import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'

const execFileAsync = promisify(execFile)

export type WindowsHelperIdentity = {
  account: string
  sid: string
  keyPath: string
}

export const parseWindowsWhoAmIUserCsv = (output: string): Omit<WindowsHelperIdentity, 'keyPath'> => {
  const record = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^"[^"]+","S-1-/.test(line))
  const match = record?.match(/^"([^"]+)","(S-1-[^"]+)"$/)
  if (!match) {
    throw new Error('Could not parse whoami /user CSV output')
  }
  return { account: match[1], sid: match[2] }
}

export const windowsHelperKeyPath = (localAppData: string): string => {
  if (!localAppData.trim()) {
    throw new Error('LOCALAPPDATA is unavailable for the FlyEnv user')
  }
  return path.win32.join(localAppData, 'FlyEnv', 'flyenv-helper.key')
}

export const getWindowsHelperIdentity = async (): Promise<WindowsHelperIdentity> => {
  const { stdout } = await execFileAsync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], {
    windowsHide: true
  })
  const identity = parseWindowsWhoAmIUserCsv(stdout)
  return {
    ...identity,
    keyPath: windowsHelperKeyPath(process.env.LOCALAPPDATA ?? '')
  }
}
