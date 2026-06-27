import { mkdirp, writeFile, readFile, existsSync } from '@shared/fs-extra'
import { createConnection } from 'node:net'
import { userInfo, tmpdir } from 'node:os'
import { basename, dirname, join, resolve as pathResolve } from 'node:path'
import is from 'electron-is'
import { isWindows } from './utils'
import JSON5 from 'json5'
import crypto from 'node:crypto'
import { AppHelperError, type AppHelperErrorCode } from './WindowsHelperState'

const SOCKET_PATH = '/tmp/flyenv-helper.sock'
const Role_Path = '/tmp/flyenv.role'
const Role_Path_Back = '/usr/local/share/FlyEnv/flyenv.role'
export const HelperVersion = 14

const Key_Path_Unix = '/usr/local/share/FlyEnv/flyenv-helper.key'
const WINDOWS_HELPER_FILE = 'flyenv-helper-windows-amd64-v1.exe'

export const HelperKeyPath = (): string => {
  return isWindows() ? join(tmpdir(), 'flyenv-helper.key') : Key_Path_Unix
}

export const getHelperKey = async (): Promise<Buffer | null> => {
  try {
    const path = HelperKeyPath()
    const data = await readFile(path)
    return data
  } catch {
    return null
  }
}

export const signTaskItem = (
  key: Buffer,
  item: {
    key: string
    module: string
    function: string
    args: any[]
    ts: number
    nonce: string
    clientPid?: number
    clientExe?: string
  }
): string => {
  const argsJSON = JSON.stringify(item.args ?? [])
  const payload = `${item.key}|${item.module}|${item.function}|${argsJSON}|${item.ts}|${item.nonce}|${item.clientPid ?? 0}|${item.clientExe ?? ''}`
  const hmac = crypto.createHmac('sha256', key)
  hmac.update(payload)
  return hmac.digest('hex')
}

export const helperTaskAuthFields = () => {
  return {
    ts: Date.now(),
    nonce: crypto.randomUUID(),
    clientPid: process.pid,
    clientExe: process.execPath ?? ''
  }
}

export const AppHelperSocketPathGet = (): string => {
  let actualPath = SOCKET_PATH

  if (isWindows()) {
    const pipeName = basename(SOCKET_PATH).replace(/[^a-zA-Z0-9_-]/g, '_')
    actualPath = `\\\\.\\pipe\\${pipeName}`
  }

  return actualPath
}

export const AppHelperRoleFix = async () => {
  if (isWindows()) {
    return
  }
  const uinfo = userInfo()
  const role = `${uinfo.uid}:${uinfo.gid}`
  await writeFile(Role_Path, role)
  try {
    await mkdirp(dirname(Role_Path_Back))
    await writeFile(Role_Path_Back, role)
  } catch {}
}

export const getWindowsHelperBinaryPath = (): string => {
  const staticPath = global.Server.Static ?? ''
  if (!staticPath) {
    return ''
  }
  if (is.production()) {
    return join(pathResolve(staticPath, '../../../../'), 'helper/flyenv-helper.exe')
  }
  const buildDir = pathResolve(staticPath, '../../../build/')
  return pathResolve(buildDir, `../src/helper-go/dist/${WINDOWS_HELPER_FILE}`)
}

export const windowsHelperBinaryExists = (): boolean => {
  if (!isWindows()) {
    return true
  }
  const helperPath = getWindowsHelperBinaryPath()
  return !!helperPath && existsSync(helperPath)
}

type AppHelperCheckDeps = {
  isWindows: () => boolean
  helperBinaryExists: () => boolean
  createConnection: typeof createConnection
  getHelperKey: typeof getHelperKey
}

export const createAppHelperChecker = (deps: Partial<AppHelperCheckDeps> = {}) => {
  const runtime = {
    isWindows,
    helperBinaryExists: windowsHelperBinaryExists,
    createConnection,
    getHelperKey,
    ...deps
  }

  return () =>
    new Promise<boolean>(async (resolve, reject) => {
      if (runtime.isWindows() && !runtime.helperBinaryExists()) {
        reject(new AppHelperError('helper_binary_missing', 'Windows helper binary missing'))
        return
      }

      let timer: NodeJS.Timeout | undefined
      let settled = false
      const key = 'flyenv-helper-version-check'
      const buffer: Buffer[] = []

      const resolveOnce = (value: boolean) => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timer)
        resolve(value)
      }

      const rejectOnce = (code: AppHelperErrorCode, message: string) => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timer)
        reject(new AppHelperError(code, message))
      }

      let helperKey: Buffer | null = null
      try {
        helperKey = await runtime.getHelperKey()
      } catch {}

      const client = runtime.createConnection(AppHelperSocketPathGet())

      const closeClient = () => {
        try {
          client.destroy()
        } catch {}
      }

      client.on('connect', () => {
        const param: any = {
          key,
          module: 'helper',
          function: 'version',
          args: [],
          ...helperTaskAuthFields()
        }
        if (helperKey) {
          param.sig = signTaskItem(helperKey, param)
        }

        try {
          client.write(JSON.stringify(param), (error?: Error | null) => {
            if (error) {
              closeClient()
              rejectOnce('helper_unreachable', error.message)
            }
          })
        } catch (error) {
          closeClient()
          rejectOnce('helper_unreachable', error instanceof Error ? error.message : `${error}`)
          return
        }

        timer = setTimeout(() => {
          closeClient()
          rejectOnce('helper_unreachable', 'Connect helper failed')
        }, 2000)
      })

      client.on('data', (data: any) => {
        buffer.push(data)
        client.end()
      })

      client.on('end', () => {
        closeClient()
        if (!buffer.length) {
          rejectOnce('helper_unreachable', 'Connect helper failed')
          return
        }

        let res: any
        try {
          const content = Buffer.concat(buffer).toString().trim()
          res = JSON5.parse(content)
        } catch {
          rejectOnce('helper_execution_failed', 'Invalid helper response payload')
          return
        }

        if (res?.key === key && res?.code === 0 && res?.data === HelperVersion) {
          resolveOnce(true)
          return
        }

        rejectOnce('helper_version_mismatch', 'Helper Need Install Or Update')
      })

      client.on('error', (error) => {
        closeClient()
        rejectOnce('helper_unreachable', error?.message || 'Connect helper failed')
      })
    })
}

export const AppHelperCheck = createAppHelperChecker()
