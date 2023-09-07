import { spawn, IPty } from 'node-pty'
import { join } from 'path'
import logger from './Logger'
import { app } from 'electron'
const execPromise = require('child-process-promise').exec

class DnsServer {
  pty?: IPty
  constructor() {}
  _fixEnv() {
    const env = process.env
    if (!env['PATH']) {
      env['PATH'] =
        '/opt:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/bin:/usr/local/bin:/bin:/usr/sbin:/sbin'
    } else {
      env[
        'PATH'
      ] = `/opt:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/bin:/usr/local/bin:${env['PATH']}`
    }
    env.ELECTRON_RUN_AS_NODE = 'true'
    return env
  }
  start() {
    let stdout = ''
    let resolved = false
    let timer: NodeJS.Timeout | undefined
    return new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        if (!resolved) {
          resolved = true
          reject(new Error('Start Fail'))
        }
      }, 20000)
      this.close().then(() => {
        this.pty = spawn(process.env['SHELL']!, [], {
          name: 'xterm-color',
          cols: 80,
          rows: 34,
          cwd: process.cwd(),
          env: this._fixEnv() as any,
          encoding: 'utf8'
        })
        this.pty.onData((data: string) => {
          console.log('pty.onData: ', data)
          stdout += data
          if (!resolved && stdout.includes('Start Success')) {
            resolved = true
            timer && clearTimeout(timer)
            timer = undefined
            resolve(true)
          }
        })
        let node = process.env.NODE
        if (app.isPackaged) {
          node = process.argv[0]
          this.pty.write('export ELECTRON_RUN_AS_NODE=true\r')
        }
        logger.info('[PhpWebStudy] node', node)
        logger.info('[PhpWebStudy] process.argv', process.argv)
        console.log('node: ', node, process.env)
        const file = join(__static, 'fork/dnsServer.js')
        const shell = `echo '${global.Server.Password}' | sudo -S ${node} ${file}\r`
        this.pty.write(shell)
      })
    })
  }
  close() {
    return new Promise((resolve) => {
      const pid = this?.pty?.pid
      if (this?.pty?.pid) {
        try {
          process.kill(this.pty.pid)
        } catch (e) {}
      }
      this?.pty?.kill()
      execPromise(
        `echo '${global.Server.Password}' | sudo -S lsof -nP -i:53 | awk '{print $1,$2,$3}'`
      )
        .then((res: any) => {
          const str = res?.stdout?.toString()?.trim() ?? ''
          const arr = str
            .split('\n')
            .filter((v: any, i: number) => {
              return i > 0
            })
            .map((a: any) => {
              const list = a.split(' ').filter((s: string) => {
                return s.trim().length > 0
              })
              list.pop()
              return list.pop()
            })
          if (pid) {
            arr.push(pid)
          }
          if (arr.length > 0) {
            const shell = `echo '${global.Server.Password}' | sudo -S kill -9 ${arr.join(' ')}`
            return execPromise(shell)
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
