import * as DNS2 from 'dns2'
import { createServer, Packet } from 'dns2'
import Helper from '../../fork/Helper'
import { address } from 'ip'

const Tangerine = require('tangerine')

const tangerine = new Tangerine()

class Manager {
  server?: any
  lastTime = 0
  hosts: Record<string, string> = {}
  running = false
  _callbak?: Function

  constructor() {
    this.server = undefined
    this.lastTime = 0
    this.hosts = {}
  }

  onLog(fn: Function) {
    this._callbak = fn
  }

  async initHosts(LOCAL_IP: string) {
    const time = new Date().getTime()
    if (time - this.lastTime > 60000) {
      this.lastTime = time
      try {
        const hosts: any = await Helper.send('tools', 'readFileByRoot', '/private/etc/hosts')
        const arrs = hosts.split('\n').filter((s: string) => s.trim().indexOf('#') !== 0)
        arrs.forEach((s: string) => {
          const items = s
            .split(' ')
            .filter((a) => !!a.trim())
            .map((a) => a.trim())
          const ip = items?.shift()?.toLowerCase()
          if (ip) {
            items.forEach((i) => {
              this.hosts[i] = ip === '127.0.0.1' || ip === 'localhost' ? LOCAL_IP : ip
            })
          }
        })
      } catch (e) {}
    }
  }
  start() {
    return new Promise((resolve, reject) => {
      const LOCAL_IP = address()
      const server = createServer({
        udp: true,
        handle: async (request: DNS2.DnsRequest, send: (response: DNS2.DnsResponse) => void) => {
          const response = Packet.createResponseFromRequest(request)
          const [question] = request.questions
          const { name } = question
          await this.initHosts(LOCAL_IP)
          if (this.hosts[name]) {
            const ip = this.hosts[name]
            const item = {
              name,
              type: Packet.TYPE.A,
              class: Packet.CLASS.IN,
              ttl: 60,
              address: ip
            }
            const json = {
              host: name,
              ttl: 60,
              ip: ip
            }
            this._callbak && this._callbak(json)
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
                    const json = {
                      host: name,
                      ttl: item.ttl,
                      ip: item.address
                    }
                    this._callbak && this._callbak(json)
                  })
                  send(response)
                }
              })
          } catch (e) {
            send(response)
          }
        }
      })
      this.server = server
      server.on('listening', () => {
        this.running = true
        resolve(true)
      })
      server.on('error', (err: any) => {
        console.log('dns server error: ', err)
        reject(err)
      })
      const bindIP = '0.0.0.0'
      server
        .listen({
          // Optionally specify port, address and/or the family of socket() for udp server:
          udp: {
            port: 53,
            address: bindIP,
            type: 'udp4' // IPv4 or IPv6 (Must be either "udp4" or "udp6")
          },

          // Optionally specify port and/or address for tcp server:
          tcp: {
            port: 53,
            address: bindIP
          }
        } as any)
        .then()
        .catch((e: any) => {
          console.log('DNS Listen Error: ', e)
          reject(e)
        })
    })
  }
  close() {
    this.server && this.server.close()
    this.server = null
    this.running = false
  }
}

const manager = new Manager()

export default manager
