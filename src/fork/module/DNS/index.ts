import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import { withServiceStopContext, type ServiceStopContext } from '@shared/ServiceStopContext'
import DNS2 from 'dns2'
import { createRequire } from 'node:module'
import { isLinux, isMacOS, isWindows } from '@shared/utils'
import type { SoftInstalled } from '@shared/app'
import { mkdirp, existsSync, writeFile, readFile, readFileByRoot } from '../../Fn'
import { dirname, join } from 'node:path'
import { HostsFileLinux, HostsFileMacOS } from '@shared/PlatFormConst'
import { windowsSystemDirectory } from '@shared/WindowsSystemPaths'
import { getPrimaryLocalIPAddress } from '@shared/network'

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
  appHosts: Record<string, string> = {}
  localIP: string = ''

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
          },
          bind: '0.0.0.0'
        }
      } else {
        json = {
          resolveServer: ['1.1.1.1', '1.0.0.1', '8.8.8.8', '8.8.4.4'],
          resolveIP: {
            'phpmyadmin.test': '127.0.0.1'
          },
          bind: '0.0.0.0'
        }
      }
      const defaultFile = join(global.Server.BaseDir!, 'dns/dns.default.json')
      await writeFile(file, JSON.stringify(json, null, 2))
      await writeFile(defaultFile, JSON.stringify(json, null, 2))
      resolve(file)
    })
  }

  initAppHosts(appHosts: string[]) {
    return new ForkPromise((resolve) => {
      this.appHosts = {}
      appHosts.forEach((h) => {
        this.appHosts[h] = this.localIP
      })
      resolve(true)
    })
  }

  async initHosts(LOCAL_IP: string) {
    let hostFile = ''
    if (isWindows()) {
      // DNS 读取与 Host/UAC 写入共用系统目录规则，兼容非 C 盘 Windows。
      hostFile = join(windowsSystemDirectory(), 'drivers', 'etc', 'hosts')
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
        hosts = (await readFileByRoot(hostFile)) as string
        const arrs = hosts.split('\n').filter((s) => s.trim().indexOf('#') !== 0)
        arrs.forEach((s) => {
          const items = s
            .split(' ')
            .filter((a) => !!a.trim())
            .map((a) => a.trim())
          const ip = items?.shift()?.toLowerCase()
          if (ip) {
            items.filter(Boolean).forEach((i) => {
              this.hosts[i] =
                ip === '::1' || ip === '127.0.0.1' || ip === 'localhost' ? LOCAL_IP : ip
            })
          }
        })
      } catch {}
    }
  }

  checkWildcardDomainMatch(domain: string) {
    const arr = domain.split('.')
    /**
     * *.www.xxx.test
     * *.xxx.test
     * *.test
     */
    const domains: string[] = [['*', ...arr].join('.')]
    while (arr.length > 1) {
      arr.shift()
      domains.push(`${['*', ...arr].join('.')}`)
    }
    return domains.find((f) => this.hosts?.[f])
  }

  start() {
    return new ForkPromise(async (resolve, reject) => {
      const lang = global.Server.Lang
      console.log('lang: ', lang)
      const file = join(global.Server.BaseDir!, 'dns/dns.json')
      let resolveIP: Record<string, string> = {}
      let bind = '0.0.0.0'
      if (existsSync(file)) {
        const content = await readFile(file, 'utf-8')
        const json = JSON.parse(content)
        resolveIP = json?.resolveIP ?? {}
        const resolveServer = json?.resolveServer ?? []
        if (resolveServer.length > 0) {
          tangerine.setServers(resolveServer)
        }
        bind = json?.bind ?? '0.0.0.0'
      }
      this.hosts = { ...resolveIP }
      const LOCAL_IP = getPrimaryLocalIPAddress()
      this.localIP = LOCAL_IP
      const server = createServer({
        udp: true,
        handle: (request: any, send: (response: any) => void) => {
          const response = Packet.createResponseFromRequest(request)
          const [question] = request.questions
          const { name } = question
          console.log('question: ', question, name)
          this.initHosts(LOCAL_IP!)
          Object.assign(this.hosts, this.appHosts)
          console.log('this.hosts: ', this.hosts)
          const wildcard = this.checkWildcardDomainMatch(name)
          if (this.hosts?.[name] || wildcard) {
            const ip = this.hosts?.[name] ?? wildcard
            const item: any = {
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
                    } as any)
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
            address: bind
          },

          // Optionally specify port and/or address for tcp server:
          tcp: {
            port: 53,
            address: bind
          }
        })
        .then()
        .catch((error) => {
          reject(error)
        })
      this.server = server
    })
  }
  async close() {
    // DNS server 由专用 fork 持有；await close 确认 socket 已释放，拒绝时保留实例供重试。
    await this.server?.close?.()
    this.server = null
  }

  stopService(_version?: SoftInstalled, stopOptions?: ServiceStopContext): any {
    // 与其他模块使用同一可选参数位置；DNS 仅关闭自己 socket，不消费列表或 kill 宿主。
    return withServiceStopContext(
      stopOptions,
      () =>
        new ForkPromise(async (resolve) => {
          await this.close()
          // 回传的是宿主 fork PID 供登记清理，绝不把宿主 Electron worker 当作外部服务去 kill。
          resolve({ 'APP-Service-Stop-PID': [`${process.pid}`] })
        })
    )
  }

  startService(): ForkPromise<any> {
    return new ForkPromise((resolve, reject, on) => {
      // 与外部服务采用同一成功终态登记，但停止动作仅关闭模块自己的 socket。
      this.start()
        .on(on)
        .then(() => resolve({ 'APP-Service-Start-PID': `${process.pid}` }))
        .catch(reject)
    })
  }

  getConfigFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    const baseDir = join(global.Server.BaseDir!, 'dns')
    return [
      { name: 'DNS config', path: join(baseDir, 'dns.json') },
      { name: 'DNS default config', path: join(baseDir, 'dns.default.json') }
    ]
  }

  getLogFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    return []
  }
}

export default new Manager()
