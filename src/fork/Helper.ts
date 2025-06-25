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
  | 'chmod'

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
        console.log('Connected to server', param)
        client.write(JSON.stringify(param))
      })

      client.on('data', (data: any) => {
        buffer.push(data)
        let res: any
        try {
          const content = Buffer.concat(buffer).toString().trim()
          res = JSON.parse(content)
        } catch {}
        if (res && res?.key && res?.key === key) {
          buffer.splice(0)
          if (res?.code === 0) {
            resolve(res?.data)
          } else {
            reject(new Error(res?.msg ?? 'Execution failed'))
          }
          client.end() // Close connection
          return
        }
      })

      client.on('end', () => {
        console.log('Disconnected from server')
        try {
          client.destroySoon()
        } catch {}
      })

      client.on('error', () => {
        try {
          client.destroySoon()
        } catch {}
        reject(new Error('connect failed'))
      })
    })
  }
}
export default new Helper()
