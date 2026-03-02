import type { StaticHttpServe } from '../type'
import type { IncomingMessage, ServerResponse } from 'http'
import ServeHandler from 'serve-handler'
import Http from 'http'
import { getAllLocalIPAddresses } from '@shared/network'
import type { AddressInfo } from 'node:net'

class HttpServer {
  httpServes: { [k: string]: StaticHttpServe } = {}

  start(path: string) {
    return new Promise((resolve) => {
      const httpServe = this.httpServes[path]
      if (httpServe) {
        httpServe.server.close()
        delete this.httpServes[path]
      }
      const server = Http.createServer((request: IncomingMessage, response: ServerResponse) => {
        response.setHeader('Access-Control-Allow-Origin', '*')
        response.setHeader('Access-Control-Allow-Headers', '*')
        response.setHeader('Access-Control-Allow-Methods', '*')
        return ServeHandler(request, response, {
          public: path
        })
      })
      server.listen(0, () => {
        const addressInfo: AddressInfo = server.address() as any
        const port = addressInfo.port
        const host = [`http://localhost:${port}/`]
        // 获取所有可用IP，优先显示物理网卡IP
        const ipList = getAllLocalIPAddresses()
        // 优先添加非虚拟网卡的IP
        const physicalIps = ipList.filter((item) => !item.isVirtual)
        if (physicalIps.length > 0) {
          physicalIps.forEach((item) => {
            host.push(`http://${item.ip}:${port}/`)
          })
        } else if (ipList.length > 0) {
          // 如果没有物理网卡IP，添加第一个可用IP
          host.push(`http://${ipList[0].ip}:${port}/`)
        }
        this.httpServes[path] = {
          server,
          port,
          host
        }
        resolve({
          path,
          port,
          host
        })
      })
    })
  }

  stop(path: string) {
    return new Promise((resolve) => {
      const httpServe1 = this.httpServes[path]
      console.log('httpServe1: ', httpServe1)
      if (httpServe1) {
        httpServe1.server.close()
        delete this.httpServes[path]
      }
      resolve(path)
    })
  }
}

export default new HttpServer()
