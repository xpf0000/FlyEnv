import { readFileSync } from 'fs'
import { createServer, Packet } from 'dns2'
import { address, isV6Format } from 'ip'
import * as DNS2 from 'dns2'
import { ForkPromise } from '@shared/ForkPromise'

const Tangerine = require('tangerine')

const tangerine = new Tangerine()

class Manager {
  server?: any
  lastTime = 0
  hosts: Record<string, string> = {}

  constructor() {
    this.server = undefined
    this.lastTime = 0
    this.hosts = {}
  }
  initHosts(LOCAL_IP: string) {
    const time = new Date().getTime()
    if (time - this.lastTime > 60000) {
      this.lastTime = time
      try {
        const hosts = readFileSync('/private/etc/hosts', 'utf-8') ?? ''
        const arrs = hosts.split('\n').filter((s) => s.trim().indexOf('#') !== 0)
        arrs.forEach((s) => {
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
    return new ForkPromise((resolve, reject) => {
      const LOCAL_IP = address()
      const IS_IPV6 = isV6Format(LOCAL_IP)
      const server = createServer({
        udp: true,
        handle: (request: DNS2.DnsRequest, send: (response: DNS2.DnsResponse) => void) => {
          const response = Packet.createResponseFromRequest(request)
          const [question] = request.questions
          const { name } = question
          this.initHosts(LOCAL_IP)
          if (this.hosts[name]) {
            const ip = this.hosts[name]
            const item = {
              name,
              type: Packet.TYPE.A,
              class: Packet.CLASS.IN,
              ttl: 60,
              address: ip
            }
            const json = JSON.stringify({
              host: name,
              ttl: 60,
              ip: ip
            })
            console.log(`#LOG-BEGIN#${json}#LOG-END#`)
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
                    const json = JSON.stringify({
                      host: name,
                      ttl: item.ttl,
                      ip: item.address
                    })
                    console.log(`#LOG-BEGIN#${json}#LOG-END#`)
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
        console.log('PWS DNS Start Success')
        resolve(true)
      })

      server
        .listen({
          // Optionally specify port, address and/or the family of socket() for udp server:
          udp: {
            port: 53,
            address: LOCAL_IP,
            type: IS_IPV6 ? 'udp6' : 'udp4' // IPv4 or IPv6 (Must be either "udp4" or "udp6")
          },

          // Optionally specify port and/or address for tcp server:
          tcp: {
            port: 53,
            address: LOCAL_IP
          }
        } as any)
        .then()
        .catch((e: any) => {
          reject(e)
          process.exit(1)
        })
    })
  }
  close() {
    this.server && this.server.close()
    this.server = null
  }
}

const manager = new Manager()

export default manager
