import { mkdirp, writeFile, readFile } from '@shared/fs-extra'
import { createConnection } from 'node:net'
import { userInfo, tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { isWindows } from './utils'
import JSON5 from 'json5'
import crypto from 'node:crypto'

const SOCKET_PATH = '/tmp/flyenv-helper.sock'
const Role_Path = '/tmp/flyenv.role'
const Role_Path_Back = '/usr/local/share/FlyEnv/flyenv.role'
export const HelperVersion = 13

const Key_Path_Unix = '/usr/local/share/FlyEnv/flyenv-helper.key'

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
    // Convert Unix socket path to Windows named pipe format
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

export const AppHelperCheck = () => {
  return new Promise(async (resolve, reject) => {
    console.time('AppHelper check')
    let timer: NodeJS.Timeout | undefined
    const key = 'flyenv-helper-version-check'
    const buffer: Buffer[] = []

    let helperKey: Buffer | null = null
    try {
      helperKey = await getHelperKey()
    } catch {}

    const client = createConnection(AppHelperSocketPathGet())
    client.on('connect', () => {
      console.log('Connected to the server')
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
      client.write(JSON.stringify(param))
      timer = setTimeout(() => {
        onEnd()
      }, 2000)
    })

    const onEnd = () => {
      clearTimeout(timer)
      try {
        client.destroySoon()
      } catch {}
      if (!buffer.length) {
        return reject(new Error(`Helper Need Install Or Update`))
      }
      let res: any
      try {
        const content = Buffer.concat(buffer).toString().trim()
        res = JSON5.parse(content)
      } catch {}
      console.timeEnd('AppHelper check')
      console.log(`${key}: `, res)
      if (res && res?.key && res?.key === key) {
        buffer.splice(0)
        if (res?.code === 0) {
          const version = res?.data
          if (version === HelperVersion) {
            return resolve(true)
          }
        }
      }
      return reject(new Error(`Helper Need Install Or Update`))
    }

    client.on('data', (data: any) => {
      buffer.push(data)
      client.end()
    })

    client.on('end', () => {
      console.log('Disconnected from the server')
      onEnd()
    })

    client.on('error', () => {
      try {
        client.destroySoon()
      } catch {}
      reject(new Error('Connect helper failed'))
      console.timeEnd('AppHelper check')
    })
  })
}
