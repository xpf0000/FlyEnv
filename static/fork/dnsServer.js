const { readFileSync } = require('fs')
const dns2 = require('dns2')
const Tangerine = require('tangerine')
const ip = require('ip')
const { Packet } = dns2
const tangerine = new Tangerine()

class Manager {
  constructor() {
    this.server = undefined
    this.lastTime = 0
    this.hosts = {}
  }
  initHosts(LOCAL_IP) {
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
    const LOCAL_IP = ip.address()
    const IS_IPV6 = ip.isV6Format(LOCAL_IP)
    const server = dns2.createServer({
      udp: true,
      handle: (request, send) => {
        const response = Packet.createResponseFromRequest(request)
        const [question] = request.questions
        const { name } = question
        this.initHosts(LOCAL_IP)
        if (this.hosts[name]) {
          const item = {
            name,
            type: Packet.TYPE.A,
            class: Packet.CLASS.IN,
            ttl: 60,
            address: this.hosts[name]
          }
          response.answers.push(item)
          send(response)
          return
        }
        try {
          tangerine
            .resolve(name, 'A', {
              ttl: true
            })
            .then((res) => {
              if (res && Array.isArray(res)) {
                res.forEach((item) => {
                  response.answers.push({
                    name,
                    type: Packet.TYPE.A,
                    class: Packet.CLASS.IN,
                    ttl: item.ttl,
                    address: item.address
                  })
                })
                send(response)
              }
            })
        } catch (e) {
          send(response)
        }
      }
    })

    server.on('listening', () => {
      console.log('Start Success')
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
      })
      .then()
    this.server = server
  }
  close() {
    this.server && this.server.close()
    this.server = null
  }
}

let manager = new Manager()
manager.start()
