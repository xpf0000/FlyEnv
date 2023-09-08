import { spawn, IPty } from 'node-pty'
import { join } from 'path'
import { copyFileSync, writeFileSync } from 'fs'
const execPromise = require('child-process-promise').exec

class DnsServer {
  pty?: IPty
  constructor() {}
  _fixEnv() {
    const env = { ...process.env }
    if (!env['PATH']) {
      env['PATH'] =
        '/opt:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/bin:/usr/local/bin:/bin:/usr/sbin:/sbin'
    } else {
      env[
        'PATH'
      ] = `/opt:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/bin:/usr/local/bin:${env['PATH']}`
    }
    if (global.Server.Proxy) {
      for (const k in global.Server.Proxy) {
        env[k] = global.Server.Proxy[k]
      }
    }
    return env
  }
  start(hasSuccessed?: boolean) {
    let stdout = ''
    let resolved = false
    let timer: NodeJS.Timeout | undefined
    return new Promise((resolve, reject) => {
      const env = this._fixEnv() as any
      const cacheDir = global.Server.Cache
      const file = join(__static, 'fork/dnsServer.js')
      const cacheFile = join(cacheDir!, 'dnsServer.js')
      const logFile = join(cacheDir!, 'dnsLog.txt')

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
          stdout += data
          writeFileSync(logFile, stdout)
          if (!resolved && stdout.includes('Start Success')) {
            resolved = true
            timer && clearTimeout(timer)
            timer = undefined
            resolve(true)
          }
        })
      }
      const checkNode = () => {
        execPromise(
          '[ -s "$HOME/.bash_profile" ] && source "$HOME/.bash_profile";[ -s "$HOME/.zshrc" ] && source "$HOME/.zshrc";which node',
          {
            env
          }
        )
          .then((res: any) => {
            console.log('node: ', res.stdout.toString())
            npmInstall()
          })
          .catch((e: Error) => {
            writeFileSync(logFile, e.toString())
            reject(new Error('Need Node'))
          })
      }
      const npmInstall = () => {
        const command = `[ -s "$HOME/.bash_profile" ] && source "$HOME/.bash_profile";[ -s "$HOME/.zshrc" ] && source "$HOME/.zshrc";cd ${cacheDir};npm install dns2 tangerine undici ip;`
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
              '[ -s "$HOME/.bash_profile" ] && source "$HOME/.bash_profile";[ -s "$HOME/.zshrc" ] && source "$HOME/.zshrc";\r'
            )
            this.pty?.write(`cd ${cacheDir}\r`)
            this.pty?.write(`chmod 777 ${cacheFile}\r`)
            const shell = `echo '${global.Server.Password}' | sudo -S node ${cacheFile}\r`
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
