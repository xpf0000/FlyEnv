import { readFileSync } from 'fs'
import { Base } from './Base'
import { ForkPromise } from '@shared/ForkPromise'
import dns2 from 'dns2'
import { Packet } from 'dns2'
import * as ip from 'ip'
import { join } from 'path'
import Tangerine from 'tangerine';

const tangerine = new Tangerine({
  servers: new Set([
    '1.1.1.1',
    '1.0.0.1',
    '8.8.8.8',
    '119.28.28.28',
    '223.5.5.5',
    '114.114.114.114'
  ]),
})

class Manager extends Base {
  server: any
  lastTime: number
  hosts: any
  ipcCommand: string
  ipcCommandKey: string

  constructor() {
    super()
    this.server = undefined
    this.lastTime = 0
    this.hosts = {}
    this.ipcCommand = 'App_DNS_Log'
    this.ipcCommandKey = 'App_DNS_Log'
  }

  initHosts(LOCAL_IP: string) {
    const hostFile = join('c:/windows/system32/drivers/etc', 'hosts')
    const time = new Date().getTime()
    if (time - this.lastTime > 60000) {
      this.lastTime = time
      try {
        const hosts = readFileSync(hostFile, 'utf-8') ?? ''
        const arrs = hosts.split('\n').filter((s) => s.trim().indexOf('#') !== 0)
        arrs.forEach((s) => {
          const items = s
            .split(' ')
            .filter((a) => !!a.trim())
            .map((a) => a.trim())
          const ip = items?.shift()?.toLowerCase()
          if (ip) {
            items.forEach((i) => {
              this.hosts[i] =
                ip === '::1' || ip === '127.0.0.1' || ip === 'localhost' ? LOCAL_IP : ip
            })
          }
        })
      } catch (e) {}
    }
  }
  start() {
    return new ForkPromise((resolve) => {
      const LOCAL_IP = ip.address()
      const server = dns2.createServer({
        udp: true,
        handle: (request: any, send: any) => {
          const response = Packet.createResponseFromRequest(request)
          const [question] = request.questions
          const { name } = question
          console.log('question: ', question, name)
          this.initHosts(LOCAL_IP)
          console.log('this.hosts: ', this.hosts)
          if (this.hosts[name]) {
            const ip = this.hosts[name]
            const item = {
              name,
              type: Packet.TYPE.A,
              class: Packet.CLASS.IN,
              ttl: 60,
              address: ip
            }
            process?.send?.({
              on: true,
              key: this.ipcCommandKey,
              info: {
                host: name,
                ttl: 60,
                ip: ip
              }
            })
            response.answers.push(item)
            send(response)
            return
          }
          try {
            tangerine
              .resolve(name, 'A', {
                ttl: true
              })
              .then((res: any) => {
                if (res && Array.isArray(res)) {
                  res.forEach((item) => {
                    response.answers.push({
                      name,
                      type: Packet.TYPE.A,
                      class: Packet.CLASS.IN,
                      ttl: item.ttl,
                      address: item.address
                    })
                    process?.send?.({
                      on: true,
                      key: this.ipcCommandKey,
                      info: {
                        host: name,
                        ttl: item.ttl,
                        ip: item.address
                      }
                    })
                  })
                  send(response)
                }
              })
              .catch((e: any) => {
                console.log(`tangerine resolve error: ${e}`)
                send(response)
              })
          } catch (e) {
            send(response)
          }
        }
      })

      server.on('listening', () => {
        console.log('Start Success')
        resolve(true)
      })

      server.on('error', (error) => {
        resolve(error.toString())
      })

      server
        .listen({
          // Optionally specify port, address and/or the family of socket() for udp server:
          udp: {
            port: 53,
            address: '0.0.0.0'
          },

          // Optionally specify port and/or address for tcp server:
          tcp: {
            port: 53,
            address: '0.0.0.0'
          }
        })
        .then()
        .catch((error) => {
          resolve(error.toString())
        })
      this.server = server
    })
  }
  close() {
    this.server && this.server.close()
    this.server = null
  }

  stopService(): any {
    return new ForkPromise((resolve) => {
      this.close()
      resolve(true)
    })
  }

  startService(): ForkPromise<any> {
    return this.start()
  }
}

export default new Manager()
