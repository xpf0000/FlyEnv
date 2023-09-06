import { spawn, IPty } from 'node-pty'
import { join } from 'path'
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
    return env
  }
  start() {
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
    })
    this.pty.onExit(() => {
      console.log('this.pty.onExit !!!!!!')
    })
    const node = process.env.NODE
    const file = join(__static, 'fork/dnsServer.js')
    const shell = `echo '${global.Server.Password}' | sudo -S ${node} ${file}\r`
    this.pty.write(shell)
  }
  close() {
    const pid = this?.pty?.pid
    if (this?.pty?.pid) {
      process.kill(this.pty.pid)
    }
    this?.pty?.kill()
    if (pid) {
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
          arr.push(pid)
          console.log('arr: ', arr)
          const shell = `echo '${global.Server.Password}' | sudo -S kill -9 ${arr.join(' ')}`
          return execPromise(shell)
        })
        .then((res: any) => {
          console.log('FFFFFF !!!')
        })
        .catch(() => {
          console.log('EEEEEE !!!')
        })
    }
  }
}

export default new DnsServer()
