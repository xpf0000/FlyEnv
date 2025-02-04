import { createConnection } from 'net'
import { uuid } from './Fn'
import type { TaskItem } from '../helper/type'

const SOCKET_PATH = '/tmp/flyenv-helper.sock'

type Module =
  | 'tools'
  | 'mariadb'
  | 'caddy'
  | 'redis'
  | 'php'
  | 'mailpit'
  | 'mysql'
  | 'apache'
  | 'rabbitmq'
  | 'host'
  | 'nginx'
type FN =
  | 'writeFileByRoot'
  | 'readFileByRoot'
  | 'processList'
  | 'macportsDirFixed'
  | 'sslDirFixed'
  | 'logFileFixed'
  | 'iniFileFixed'
  | 'iniDefaultFileFixed'
  | 'rm'
  | 'kill'
  | 'binFixed'
  | 'ln_s'
  | 'startService'
  | 'initPlugin'
  | 'sslAddTrustedCert'
  | 'sslFindCertificate'
  | 'dnsRefresh'
  | 'killPorts'
  | 'getPortPids'

class Helper {
  send(module: Module, fn: FN, ...args: any) {
    return new Promise((resolve, reject) => {
      const key = uuid()
      const client = createConnection(SOCKET_PATH)
      const buffer: Buffer[] = []
      client.on('connect', () => {
        const param: TaskItem = {
          key,
          module,
          function: fn,
          args
        }
        console.log('已连接到服务器', param)
        client.write(JSON.stringify(param))
      })

      client.on('data', (data: any) => {
        buffer.push(data)
        let res: any
        try {
          const content = Buffer.concat(buffer).toString().trim()
          res = JSON.parse(content)
        } catch (e) {}
        if (res && res?.key && res?.key === key) {
          console.log('helper res: ', res)
          buffer.splice(0)
          if (res?.code === 0) {
            resolve(res?.data)
          } else {
            reject(new Error(res?.msg ?? 'Exec Fail'))
          }
          client.end() // 关闭连接
          return
        }
      })

      client.on('end', () => {
        console.log('已从服务器断开连接')
        try {
          client.destroySoon()
        } catch (e) {}
      })

      client.on('error', () => {
        try {
          client.destroySoon()
        } catch (e) {}
        reject(new Error('connect failed'))
      })
    })
  }
}
export default new Helper()
