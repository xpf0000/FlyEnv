import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import DNS2 from 'dns2'
import { address } from 'neoip'
import { createRequire } from 'node:module'
import Helper from '../../Helper'
import { isLinux, isMacOS, isWindows } from '@shared/utils'
import { mkdirp, existsSync, writeFile, readFile } from '../../Fn'
import { dirname, join } from 'node:path'
import { HostsFileLinux, HostsFileMacOS, HostsFileWindows } from '@shared/PlatFormConst'

const require = createRequire(import.meta.url)
const Tangerine = require('tangerine')

const { createServer, Packet } = DNS2
const tangerine = new Tangerine()

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

  initConfig() {
    return new ForkPromise(async (resolve) => {
      const file = join(global.Server.BaseDir!, 'dns/dns.json')
      await mkdirp(dirname(file))
      if (existsSync(file)) {
        resolve(file)
        return
      }
      let json: any = {}
      if (global.Server.Lang === 'zh') {
        json = {
          resolveServer: ['223.5.5.5', '119.29.29.29', '180.76.76.76', '114.114.114.119'],
          resolveIP: {
            'phpmyadmin.test': '127.0.0.1'
          }
        }
      } else {
        json = {
          resolveServer: ['1.1.1.1', '1.0.0.1', '8.8.8.8', '8.8.4.4'],
          resolveIP: {
            'phpmyadmin.test': '127.0.0.1'
          }
        }
      }
      const defaultFile = join(global.Server.BaseDir!, 'dns/dns.default.json')
      await writeFile(file, JSON.stringify(json, null, 2))
      await writeFile(defaultFile, JSON.stringify(json, null, 2))
      resolve(file)
    })
  }

  async initHosts(LOCAL_IP: string) {
    let hostFile = ''
    if (isWindows()) {
      hostFile = HostsFileWindows
    } else if (isLinux()) {
      hostFile = HostsFileLinux
    } else if (isMacOS()) {
      hostFile = HostsFileMacOS
    }
    const time = new Date().getTime()
    if (time - this.lastTime > 60000) {
      this.lastTime = time
      try {
        let hosts = ''
        hosts = (await Helper.send('tools', 'readFileByRoot', hostFile)) as string
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
      } catch {}
    }
  }
  start() {
    return new ForkPromise(async (resolve, reject) => {
      const lang = global.Server.Lang
      console.log('lang: ', lang)
      const file = join(global.Server.BaseDir!, 'dns/dns.json')
      let resolveIP: Record<string, string> = {}
      if (existsSync(file)) {
        const content = await readFile(file, 'utf-8')
        const json = JSON.parse(content)
        resolveIP = json?.resolveIP ?? {}
        const resolveServer = json?.resolveServer ?? []
        if (resolveServer.length > 0) {
          tangerine.setServers(resolveServer)
        }
      }
      this.hosts = { ...resolveIP }
      const LOCAL_IP = address()
      const server = createServer({
        udp: true,
        handle: (request: DNS2.DnsRequest, send: (response: DNS2.DnsResponse) => void) => {
          const response = Packet.createResponseFromRequest(request)
          const [question] = request.questions
          const { name } = question
          console.log('question: ', question, name)
          this.initHosts(LOCAL_IP!)
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
          } catch {
            send(response)
          }
        }
      })

      server.on('listening', () => {
        console.log('Start Success')
        resolve(true)
      })

      server.on('error', (error) => {
        reject(error)
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
          reject(error)
        })
      this.server = server
    })
  }
  close() {
    this.server?.close?.()
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
