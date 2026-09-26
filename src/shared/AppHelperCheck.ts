import { mkdirp, writeFile, readFile, existsSync } from '@shared/fs-extra'
import { createConnection } from 'node:net'
import { userInfo } from 'node:os'
import { dirname, join, resolve as pathResolve } from 'node:path'
import is from 'electron-is'
import { isWindows } from './utils'
import JSON5 from 'json5'
import crypto from 'node:crypto'
import { AppHelperError, type AppHelperErrorCode } from './WindowsHelperState'
import {
  getWindowsHelperIdentity,
  readWindowsHelperTask,
  windowsHelperTaskInvalidReason,
  type WindowsHelperIdentity
} from './WindowsHelperIdentity'

const SOCKET_PATH = '/tmp/flyenv-helper.sock'
const Role_Path = '/tmp/flyenv.role'
const Role_Path_Back = '/usr/local/share/FlyEnv/flyenv.role'
const Key_Path_Unix = '/usr/local/share/FlyEnv/flyenv-helper.key'
const WINDOWS_HELPER_FILE = 'flyenv-helper-windows-amd64-v1.exe'
const Helper_Check_Timeout = 3000

export const HelperVersion = 27

export type HelperHealth = {
  version: number
  pid: number
  sid?: string
  instanceId?: string
}

type HelperResponse = {
  key?: string
  code?: number
  data?: unknown
  msg?: string
}

let cachedWindowsHelperIdentity: Promise<WindowsHelperIdentity> | undefined

const currentWindowsHelperIdentity = (): Promise<WindowsHelperIdentity> => {
  cachedWindowsHelperIdentity ??= getWindowsHelperIdentity().catch((error) => {
    cachedWindowsHelperIdentity = undefined
    throw error
  })
  return cachedWindowsHelperIdentity
}

export const HelperKeyPath = (identity?: WindowsHelperIdentity): string => {
  if (!isWindows()) return Key_Path_Unix
  if (!identity) throw new Error('Windows helper identity is required for the key path')
  return identity.keyPath
}

export const getHelperKey = async (identity?: WindowsHelperIdentity): Promise<Buffer | null> => {
  const resolvedIdentity = isWindows()
    ? (identity ?? (await currentWindowsHelperIdentity()))
    : undefined
  const keyPath = HelperKeyPath(resolvedIdentity)
  try {
    return await readFile(keyPath)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code
    if (isWindows() && (code === 'EACCES' || code === 'EPERM')) {
      throw new AppHelperError(
        'helper_key_inaccessible',
        `Windows helper key is inaccessible: ${keyPath}`,
        error instanceof Error ? error.message : String(error)
      )
    }
    return null
  }
}

const canonicalizeSignatureValue = (value: unknown): unknown => {
  if (value === null || typeof value !== 'object') {
    return value
  }

  const toJSON = (value as { toJSON?: () => unknown }).toJSON
  if (typeof toJSON === 'function') {
    return canonicalizeSignatureValue(toJSON.call(value))
  }

  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeSignatureValue(item))
  }

  const sorted: Record<string, unknown> = {}
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = canonicalizeSignatureValue((value as Record<string, unknown>)[key])
  }
  return sorted
}

export const helperSignatureArgsJSON = (args: any[]): string => {
  // Go's encoding/json sorts object keys and HTML-escapes these characters.
  // Match that representation before both sides calculate the HMAC.
  return JSON.stringify(canonicalizeSignatureValue(args ?? []))
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
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
  const argsJSON = helperSignatureArgsJSON(item.args ?? [])
  const payload = `${item.key}|${item.module}|${item.function}|${argsJSON}|${item.ts}|${item.nonce}|${item.clientPid ?? 0}|${item.clientExe ?? ''}`
  const hmac = crypto.createHmac('sha256', key)
  hmac.update(payload)
  return hmac.digest('hex')
}

export const helperTaskAuthFields = () => ({
  ts: Date.now(),
  nonce: crypto.randomUUID(),
  clientPid: process.pid,
  clientExe: process.execPath ?? ''
})

export const AppHelperSocketPathGet = async (identity?: WindowsHelperIdentity): Promise<string> => {
  if (!isWindows()) {
    return SOCKET_PATH
  }
  return (identity ?? (await currentWindowsHelperIdentity())).pipePath
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
  const staticPath = global.Server?.Static ?? ''
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
  const helperPath = getWindowsHelperValidationBinaryPath()
  return !!helperPath && existsSync(helperPath)
}

export const getWindowsHelperValidationBinaryPath = (): string => {
  const primary = getWindowsHelperBinaryPath()
  if (!primary) return ''
  const backup = join(dirname(primary), 'flyenv-helper-backup.exe')
  return is.production() && existsSync(backup) ? backup : primary
}

type AppHelperCheckDeps = {
  isWindows: () => boolean
  helperBinaryExists: () => boolean
  createConnection: typeof createConnection
  getHelperKey: (identity?: WindowsHelperIdentity) => Promise<Buffer | null>
  getWindowsIdentity: typeof getWindowsHelperIdentity
  readWindowsTask: typeof readWindowsHelperTask
}

export const helperResponseErrorCode = (message: string): AppHelperErrorCode => {
  if (/signature/i.test(message)) {
    return 'helper_signature_invalid'
  }
  if (/allow-roots|trusted roots|allowed roots/i.test(message)) {
    return 'helper_acl_invalid'
  }
  return 'helper_execution_failed'
}

export const createAppHelperChecker = (deps: Partial<AppHelperCheckDeps> = {}) => {
  const runtime = {
    isWindows,
    helperBinaryExists: windowsHelperBinaryExists,
    createConnection,
    getHelperKey,
    getWindowsIdentity: getWindowsHelperIdentity,
    readWindowsTask: readWindowsHelperTask,
    ...deps
  }

  const request = (fn: 'version' | 'health', helperKey: Buffer | null, pipePath: string) =>
    new Promise<HelperResponse>((resolve, reject) => {
      const key = `flyenv-helper-${fn}-check`
      const buffer: Buffer[] = []
      let settled = false
      let client: ReturnType<typeof createConnection> | undefined
      const finish = (callback: () => void) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        callback()
      }
      const closeClient = () => {
        try {
          client?.destroy()
        } catch {}
      }
      const fail = (code: AppHelperErrorCode, message: string) => {
        finish(() => {
          closeClient()
          reject(new AppHelperError(code, message))
        })
      }
      const timer = setTimeout(
        () => fail('helper_pipe_unreachable', 'Timed out waiting for helper pipe'),
        Helper_Check_Timeout
      )

      try {
        client = runtime.createConnection(pipePath)
      } catch (error) {
        fail('helper_pipe_unreachable', error instanceof Error ? error.message : `${error}`)
        return
      }

      client.on('connect', () => {
        const param: any = {
          key,
          module: 'helper',
          function: fn,
          args: [],
          ...helperTaskAuthFields()
        }
        if (helperKey) {
          param.sig = signTaskItem(helperKey, param)
        }
        try {
          client?.write(JSON.stringify(param), (error?: Error | null) => {
            if (error) fail('helper_pipe_unreachable', error.message)
          })
        } catch (error) {
          fail('helper_pipe_unreachable', error instanceof Error ? error.message : `${error}`)
        }
      })

      client.on('data', (data: Buffer) => {
        buffer.push(data)
        client?.end()
      })
      client.on('end', () => {
        if (!buffer.length) {
          fail('helper_pipe_unreachable', 'Helper closed the health-check pipe without a response')
          return
        }
        let response: HelperResponse
        try {
          response = JSON5.parse(Buffer.concat(buffer).toString().trim())
        } catch {
          fail('helper_execution_failed', 'Invalid helper response payload')
          return
        }
        if (response.key !== key) {
          fail(
            'helper_execution_failed',
            'Helper response key did not match the health-check request'
          )
          return
        }
        if (response.code !== 0) {
          fail(
            helperResponseErrorCode(response.msg ?? ''),
            response.msg ?? 'Helper rejected the health-check request'
          )
          return
        }
        finish(() => {
          closeClient()
          resolve(response)
        })
      })
      client.on('error', (error) =>
        fail('helper_pipe_unreachable', error?.message || 'Could not connect to helper pipe')
      )
    })

  return async (): Promise<HelperHealth | true> => {
    if (runtime.isWindows() && !runtime.helperBinaryExists()) {
      throw new AppHelperError('helper_binary_missing', 'Windows helper binary missing')
    }

    let identity: WindowsHelperIdentity | undefined
    if (runtime.isWindows()) {
      try {
        identity = await runtime.getWindowsIdentity()
      } catch (error) {
        throw new AppHelperError(
          'helper_task_invalid',
          `Could not capture Windows helper identity: ${error instanceof Error ? error.message : error}`
        )
      }
    }

    const helperKey = await runtime.getHelperKey(identity)
    if (runtime.isWindows() && !helperKey) {
      throw new AppHelperError(
        'helper_key_missing',
        `Windows helper key missing: ${HelperKeyPath(identity)}`
      )
    }
    if (runtime.isWindows() && helperKey && helperKey.length !== 32) {
      throw new AppHelperError(
        'helper_key_invalid',
        'Windows helper key must contain exactly 32 bytes'
      )
    }

    let expectedSid: string | undefined
    let expectedInstanceId: string | undefined
    if (runtime.isWindows()) {
      try {
        if (!identity) throw new Error('Windows helper identity is unavailable')
        expectedSid = identity.sid
        expectedInstanceId = identity.instanceId
        const task = await runtime.readWindowsTask(identity, getWindowsHelperValidationBinaryPath())
        const reason = windowsHelperTaskInvalidReason(task, identity, identity.executable)
        if (reason) throw new AppHelperError('helper_task_invalid', reason)
      } catch (error) {
        if (error instanceof AppHelperError) throw error
        throw new AppHelperError(
          'helper_task_invalid',
          `Could not validate Windows helper task: ${error instanceof Error ? error.message : error}`
        )
      }
    }

    let pipePath = SOCKET_PATH
    if (runtime.isWindows()) {
      if (!identity) {
        throw new AppHelperError('helper_task_invalid', 'Windows helper pipe is unavailable')
      }
      pipePath = identity.pipePath
    }
    const version = await request('version', helperKey, pipePath)
    if (version.data !== HelperVersion) {
      throw new AppHelperError('helper_version_mismatch', 'Helper version does not match FlyEnv')
    }
    if (!runtime.isWindows()) {
      return true
    }

    const health = await request('health', helperKey, pipePath)
    const result = health.data as Partial<HelperHealth> | undefined
    if (
      !result ||
      result.version !== HelperVersion ||
      typeof result.pid !== 'number' ||
      !Number.isInteger(result.pid) ||
      result.pid <= 0
    ) {
      throw new AppHelperError(
        'helper_health_invalid',
        'Helper health response is missing a valid version or PID'
      )
    }
    if (result.sid !== expectedSid || result.instanceId !== expectedInstanceId) {
      throw new AppHelperError(
        'helper_health_invalid',
        'Helper instance identity does not match the FlyEnv user'
      )
    }
    return {
      version: result.version,
      pid: result.pid,
      sid: result.sid,
      instanceId: result.instanceId
    }
  }
}

export const AppHelperCheck = createAppHelperChecker()

// Starting an intact current-SID task does not require replacing its binary/key.
// Older installations without execute permission fall through to the UAC repair.
export const recoverWindowsHelper = async (): Promise<boolean> => {
  if (!isWindows()) return false
  const identity = await getWindowsHelperIdentity()
  const key = await getHelperKey(identity)
  if (key?.length !== 32) return false
  const source = getWindowsHelperValidationBinaryPath()
  const task = await readWindowsHelperTask(identity, source)
  if (windowsHelperTaskInvalidReason(task, identity, identity.executable)) return false
  const started = await readWindowsHelperTask(identity, source, true)
  return !windowsHelperTaskInvalidReason(started, identity, identity.executable)
}
