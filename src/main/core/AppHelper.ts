import { createConnection } from 'net'
import Sudo from '@shared/Sudo'
import { join, resolve as PathResolve } from 'path'

const SOCKET_PATH = '/tmp/flyenv-helper.sock'

class AppHelper {
  installed: boolean = false
  installing: boolean = false

  check() {
    console.time('AppHelper check')
    return new Promise((resolve, reject) => {
      const client = createConnection(SOCKET_PATH)
      client.on('connect', () => {
        console.log('已连接到服务器')
        client.end()
        try {
          client.destroySoon()
        } catch (e) {}
        resolve(true)
        console.timeEnd('AppHelper check')
      })

      client.on('data', (data: any) => {
        console.log('收到服务器响应:', data.toString())
      })

      client.on('end', () => {
        console.log('已从服务器断开连接')
      })

      client.on('error', () => {
        try {
          client.destroySoon()
        } catch (e) {}
        reject(new Error('Helper Connect Failed'))
        console.timeEnd('AppHelper check')
      })
    })
  }

  initHelper() {
    return new Promise((resolve, reject) => {
      this.installing = true
      const binDir = PathResolve(global.Server.Static!, '../../../../')
      Sudo(`cd "${join(binDir, 'helper')}" && sudo ./postinstall.sh`, {
        name: 'FlyEnv',
        icns: join(binDir, 'icon.icns'),
        dir: global.Server.Cache!
      })
        .then(({ stdout, stderr }) => {
          console.log('initHelper: ', stdout, stderr)
          this.installed = true
          resolve(true)
        })
        .catch((e) => {
          console.log('initHelper err: ', e)
          reject(e)
        })
        .finally(() => {
          this.installing = false
        })
    })
  }
}
export default new AppHelper()
