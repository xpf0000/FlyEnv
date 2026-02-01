import { writeFile } from '@shared/fs-extra'
import Helper from '../fork/Helper'
import { createConnection } from 'node:net'
import { userInfo } from 'node:os'
import { basename } from 'node:path'
import { isWindows } from './utils'
import JSON5 from 'json5'

const SOCKET_PATH = '/tmp/flyenv-helper.sock'
const Role_Path = '/tmp/flyenv.role'
const Role_Path_Back = '/usr/local/share/FlyEnv/flyenv.role'
export const HelperVersion = 8

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
    Helper.send('tools', 'writeFileByRoot', Role_Path_Back, role).catch()
  } catch {}
}

export const AppHelperCheck = () => {
  return new Promise(async (resolve, reject) => {
    console.time('AppHelper check')
    const key = 'flyenv-helper-version-check'
    const buffer: Buffer[] = []
    const client = createConnection(AppHelperSocketPathGet())
    client.on('connect', () => {
      console.log('Connected to the server')
      const param = {
        key,
        module: 'helper',
        function: 'version'
      }
      client.write(JSON.stringify(param))
    })

    client.on('data', (data: any) => {
      buffer.push(data)
      client.end()
    })

    client.on('end', () => {
      console.log('Disconnected from the server')
      try {
        client.destroySoon()
      } catch {}
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
