import { stat, writeFile } from '@shared/fs-extra'
import Helper from '../fork/Helper'
import { createConnection } from 'node:net'

const SOCKET_PATH = '/tmp/flyenv-helper.sock'
const Role_Path = '/tmp/flyenv.role'
const Role_Path_Back = '/usr/local/share/FlyEnv/flyenv.role'

export const AppHelperRoleFix = async () => {
  const stats = await stat(process.execPath)
  const role = `${stats.uid}:${stats.gid}`
  await writeFile(Role_Path, role)
  try {
    Helper.send('tools', 'writeFileByRoot', Role_Path_Back, role).catch()
  } catch {}
}

export const AppHelperCheck = () => {
  return new Promise(async (resolve, reject) => {
    console.time('AppHelper check')
    const client = createConnection(SOCKET_PATH)
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
