import { writeFile } from '@shared/fs-extra'
import Helper from '../fork/Helper'
import { createConnection } from 'node:net'
import { userInfo } from 'node:os'
import { basename } from 'node:path'
import { isWindows } from './utils'

const SOCKET_PATH = '/tmp/flyenv-helper.sock'
const Role_Path = '/tmp/flyenv.role'
const Role_Path_Back = '/usr/local/share/FlyEnv/flyenv.role'

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
    const client = createConnection(AppHelperSocketPathGet())
    client.on('connect', () => {
      console.log('Connected to the server')
      client.end()
      try {
        client.destroySoon()
      } catch {}
      resolve(true)
      console.timeEnd('AppHelper check')
    })

    client.on('data', (data: any) => {
      console.log('Received server response:', data.toString())
    })

    client.on('end', () => {
      console.log('Disconnected from the server')
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
