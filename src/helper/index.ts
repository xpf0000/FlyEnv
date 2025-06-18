import { createServer } from 'net'
import { remove, existsSync } from './util'
import { dirChownFetch, waitTime } from './util'
import type { TaskItem } from './type'
import { execPromise } from '@shared/child-process'

// Path to the socket file
const SOCKET_PATH = '/tmp/flyenv-helper.sock'

class AppHelper {
  Tool: any
  MariaDB: any
  Caddy: any
  Redis: any
  PHP: any
  Mailpit: any
  Mysql: any
  Apache: any
  RabbitMQ: any
  Host: any
  Nginx: any

  async init() {
    if (existsSync(SOCKET_PATH)) {
      await remove(SOCKET_PATH)
    }

    // Create server
    const server = createServer((socket) => {
      const buffer: Buffer[] = []
      socket.on('data', async (data) => {
        buffer.push(data)
        let info: TaskItem | undefined
        try {
          const content = Buffer.concat(buffer).toString().trim()
          info = JSON.parse(content)
        } catch {}
        if (info) {
          buffer.splice(0)

          const key = info.key
          const module: string = info.module
          const fn: string = info.function
          const args: any[] = info?.args ?? []

          const doRun = (module: any) => {
            module
              .exec(fn, ...args)
              ?.then((res: any) => {
                const param = {
                  key,
                  code: 0,
                  data: res
                }
                socket.write(JSON.stringify(param), (err) => {
                  console.log('socket.write err: ', key, err)
                })
              })
              ?.catch((e: any) => {
                const res = {
                  key,
                  code: 1,
                  msg: `${e}`
                }
                socket.write(JSON.stringify(res))
              })
          }

          if (module === 'tools') {
            if (!this.Tool) {
              const res = await import('./module/Tool')
              this.Tool = res.default
            }
            doRun(this.Tool)
          } else if (module === 'mariadb') {
            if (!this.MariaDB) {
              const res = await import('./module/Mariadb')
              this.MariaDB = res.default
            }
            doRun(this.MariaDB)
          } else if (module === 'caddy') {
            if (!this.Caddy) {
              const res = await import('./module/Caddy')
              this.Caddy = res.default
            }
            doRun(this.Caddy)
          } else if (module === 'redis') {
            if (!this.Redis) {
              const res = await import('./module/Redis')
              this.Redis = res.default
            }
            doRun(this.Redis)
          } else if (module === 'php') {
            if (!this.PHP) {
              const res = await import('./module/PHP')
              this.PHP = res.default
            }
            doRun(this.PHP)
          } else if (module === 'mailpit') {
            if (!this.Mailpit) {
              const res = await import('./module/Mailpit')
              this.Mailpit = res.default
            }
            doRun(this.Mailpit)
          } else if (module === 'mysql') {
            if (!this.Mysql) {
              const res = await import('./module/Mysql')
              this.Mysql = res.default
            }
            doRun(this.Mysql)
          } else if (module === 'apache') {
            if (!this.Apache) {
              const res = await import('./module/Apache')
              this.Apache = res.default
            }
            doRun(this.Apache)
          } else if (module === 'rabbitmq') {
            if (!this.RabbitMQ) {
              const res = await import('./module/RabbitMQ')
              this.RabbitMQ = res.default
            }
            doRun(this.RabbitMQ)
          } else if (module === 'host') {
            if (!this.Host) {
              const res = await import('./module/Host')
              this.Host = res.default
            }
            doRun(this.Host)
          } else if (module === 'nginx') {
            if (!this.Nginx) {
              const res = await import('./module/Nginx')
              this.Nginx = res.default
            }
            doRun(this.Nginx)
          }
        }
      })
      socket.on('end', () => {
        console.log('Client has disconnected')
        try {
          socket.destroySoon()
        } catch {}
      })
    })

    server.listen(SOCKET_PATH, async () => {
      console.log('Server is listening on', SOCKET_PATH)
      await waitTime(500)
      let appDir = `/Applications/FlyEnv.app`
      if (!existsSync(appDir)) {
        appDir = `/Applications/PhpWebStudy.app`
      }
      if (!existsSync(appDir)) {
        return
      }
      let rule = ''
      try {
        rule = await dirChownFetch(appDir)
      } catch {}
      if (!rule) {
        return
      }
      if (existsSync(SOCKET_PATH)) {
        await execPromise(`chown ${rule} "${SOCKET_PATH}"`)
      }
    })

    server.on('error', (err) => {
      console.log('error: ', err)
    })
  }
}

const helper = new AppHelper()
helper.init().then().catch()

export default helper
