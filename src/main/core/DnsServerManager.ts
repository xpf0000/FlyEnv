import { spawn, IPty } from 'node-pty'
import { join } from 'path'
import { copyFileSync, writeFileSync, existsSync } from 'fs'
import { fixEnv } from '@shared/utils'
const execPromise = require('child-process-promise').exec

class DnsServer {
  pty?: IPty
  _callbak?: Function
  constructor() {}
  onLog(fn: Function) {
    this._callbak = fn
  }
  start(hasSuccessed?: boolean) {
    let stdout = ''
    let log = ''
    let resolved = false
    let timer: NodeJS.Timeout | undefined
    let node = ''
    return new Promise((resolve, reject) => {
      const env = fixEnv() as any
      const cacheDir = global.Server.Cache
      const file = join(__static, 'fork/dnsServer.js')
      const cacheFile = join(cacheDir!, 'dnsServer.js')
      const logFile = join(cacheDir!, 'dnsLog.txt')
      writeFileSync(logFile, '')
      const initPty = () => {
        this.pty = spawn(process.env['SHELL']!, [], {
          name: 'xterm-color',
          cols: 80,
          rows: 34,
          cwd: process.cwd(),
          env,
          encoding: 'utf8'
        })
        this.pty.onData((data: string) => {
          console.log('dns data: ', data)
          stdout += data
          if (!resolved && stdout.includes('Start Success')) {
            resolved = true
            timer && clearTimeout(timer)
            timer = undefined
            resolve(true)
          }
          log += data
          if (log.includes('#LOG-BEGIN#')) {
            log = log.split('#LOG-BEGIN#').pop() ?? ''
          }
          if (log.includes('#LOG-END#')) {
            const arr = log.split('#LOG-END#')
            const currentLog = arr?.shift()?.trim() ?? ''
            log = arr.pop() ?? ''
            try {
              const json = JSON.parse(currentLog)
              this?._callbak?.(json)
            } catch (e) {}
          }
        })
      }
      const checkNode = () => {
        execPromise(
          '[ -s "$HOME/.bashrc" ] && source "$HOME/.bashrc";[ -s "$HOME/.zshrc" ] && source "$HOME/.zshrc";which node',
          {
            env
          }
        )
          .then((res: any) => {
            node = res.stdout.toString()
            console.log('node: ', node)
            npmInstall()
          })
          .catch((e: Error) => {
            writeFileSync(logFile, e.toString())
            reject(new Error('DNS Server Start Fail: Need NodeJS, Not Found NodeJS In System Env'))
          })
      }
      const npmInstall = () => {
        const node_modules = join(cacheDir!, 'node_modules')
        const package_lock = join(cacheDir!, 'package-lock.json')
        if (existsSync(node_modules) && existsSync(package_lock)) {
          copyFile()
        } else {
          const command = `[ -s "$HOME/.bashrc" ] && source "$HOME/.bashrc";[ -s "$HOME/.zshrc" ] && source "$HOME/.zshrc";cd ${cacheDir};npm install dns2 tangerine undici ip;`
          execPromise(command, {
            env
          })
            .then(() => {
              copyFile()
            })
            .catch((e: Error) => {
              writeFileSync(logFile, e.toString())
              const err = new Error(
                `Dependencies install failed.\nuse this command install, then retry.\n${command}`
              )
              reject(err)
            })
        }
      }
      const copyFile = () => {
        copyFileSync(file, cacheFile)
        next()
      }
      const next = () => {
        this.close().then(() => {
          initPty()
          timer = setTimeout(() => {
            if (!resolved) {
              resolved = true
              reject(new Error('Start Fail'))
            }
          }, 20000)
          try {
            this.pty?.write(
              '[ -s "$HOME/.bashrc" ] && source "$HOME/.bashrc";[ -s "$HOME/.zshrc" ] && source "$HOME/.zshrc";\r'
            )
            this.pty?.write(`cd ${cacheDir}\r`)
            this.pty?.write(`chmod 777 ${cacheFile}\r`)
            const shell = `echo '${global.Server.Password}' | sudo -S ${node} ${cacheFile}\r`
            this.pty?.write(shell)
          } catch (e: any) {}
        })
      }

      if (hasSuccessed) {
        next()
      } else {
        checkNode()
      }
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
        `echo '${global.Server.Password}' | sudo -S lsof -i:53 | awk '{print $1,$2,$3}'`
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
            .filter((a: any) => !!a)
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
