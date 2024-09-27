import { resolve, join } from 'path'
import { remove, copyFile } from 'fs-extra'
import { execPromise, execPromiseRoot } from '@shared/Exec'

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
      try {
        await execPromise('node -v')
      } catch (e) {
        reject(new Error('DNS Server Start Fail: Need NodeJS, Not Found NodeJS In System Env'))
        return
      }
      const cacheFile = join(global.Server.Cache!, 'dns.js')
      if (cacheFile) {
        await remove(cacheFile)
      }
      await copyFile(file, cacheFile)
      await execPromiseRoot(`chmod 777 ${cacheFile}`)
      execPromiseRoot(`node ${cacheFile} App-DNS-Flag=${global.Server.BaseDir}`, {
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
