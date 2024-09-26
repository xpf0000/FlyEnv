import { resolve } from 'path'
import { execPromiseRoot } from '@shared/Exec'

class DnsServer {
  _callbak?: Function
  constructor() {}
  onLog(fn: Function) {
    this._callbak = fn
  }
  start() {
    let resolved = false
    let timer: NodeJS.Timeout | undefined
    const file = resolve(__dirname, './dns.js')
    return new Promise(async (resolve, reject) => {
      execPromiseRoot(`node ${file} App-DNS-Flag=${global.Server.BaseDir}`, {
        env: {
          PWSServer: global.Server
        }
      })
        .on((stdout: string) => {
          if (!resolved && stdout.includes('PWS DNS Start Success')) {
            resolved = true
            timer && clearTimeout(timer)
            timer = undefined
            resolve(true)
          }
        })
        .then(() => {})
        .catch(reject)
    })
  }
  close() {
    return new Promise((resolve) => {
      execPromiseRoot(`ps aux | grep 'App-DNS-Flag=${global.Server.BaseDir}'`)
        .then((res) => {
          const str = res?.stdout?.toString()?.trim() ?? ''
          const arr = str
            .trim()
            .split('\n')
            .filter((v: string) => {
              return !v.includes(`ps aux | grep `) && !v.includes(' grep App-DNS-Flag=')
            })
            .map((a: any) => {
              const list = a.split(' ').filter((s: string) => {
                return s.trim().length > 0
              })
              list.shift()
              return list.shift()
            })
            .filter((a: any) => !!a)
          if (arr.length > 0) {
            return execPromiseRoot(['kill', '-9', ...arr]) as any
          } else {
            return Promise.resolve(true)
          }
        })
        .then(() => {
          resolve(true)
        })
        .catch(() => {
          resolve(true)
        })
    })
  }
}

export default new DnsServer()
