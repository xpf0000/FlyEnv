import { spawn, IPty } from 'node-pty'
import { dirname, join } from 'path'
import { copyFileSync, writeFileSync, existsSync, createWriteStream, unlinkSync } from 'fs'
import { fixEnv, getAxiosProxy } from '@shared/utils'
import { appendFile, copyFile, unlink, remove, mkdirp } from 'fs-extra'
import axios from 'axios'

const execPromise = require('child-process-promise').exec

class DnsServer {
  pty?: IPty
  _callbak?: Function
  constructor() {}
  onLog(fn: Function) {
    this._callbak = fn
  }

  _init_sh() {
    return new Promise(async (resolve, reject) => {
      try {
        const sh = join(global.Server.Static!, 'sh/node.sh')
        const copyfile = join(global.Server.Cache!, 'node.sh')
        if (existsSync(copyfile)) {
          await unlink(copyfile)
        }
        await copyFile(sh, copyfile)
        const env = fixEnv() as any
        await execPromise(`echo "${global.Server.Password}" | sudo -S chmod 777 ${copyfile}`, {
          env,
          shell: '/bin/bash'
        })
        resolve(copyfile)
      } catch (e) {
        await appendFile(join(global.Server.BaseDir!, 'debug.log'), `[Node][nvmDir][Error]: ${e}`)
        reject(e)
      }
    })
  }

  _init_node(): Promise<{ node: string; npm: string }> {
    return new Promise(async (resolve, reject) => {
      // https://nodejs.org/dist/v18.20.4/node-v18.20.4-linux-arm64.tar.xz
      // https://nodejs.org/dist/v18.20.4/node-v18.20.4-linux-x64.tar.xz
      const arch = global.Server.Arch === 'x86_64' ? 'x64' : 'arm64'
      const zipName = `node-v18.20.4-linux-${arch}`
      const nodeDir = join(global.Server.AppDir!, 'static-node')
      const bin = join(nodeDir, 'bin/node')
      if (existsSync(bin)) {
        resolve({
          node: bin,
          npm: join(nodeDir, 'bin/npm')
        })
        return
      }
      const zip = join(global.Server.Cache!, 'static-node.tar.xz')
      const checkZip = async () => {
        if (existsSync(zip)) {
          const unzipDir = join(global.Server.Cache!, zipName)
          if (existsSync(unzipDir)) {
            await remove(unzipDir)
          }
          const env = fixEnv() as any
          try {
            await execPromise(`tar -xf "${zip}"`, {
              env,
              shell: '/bin/bash',
              cwd: global.Server.Cache!
            })
          } catch (e) {}
          if (existsSync(join(unzipDir, 'bin/node'))) {
            await mkdirp(nodeDir)
            const command = `mv "${unzipDir}/*" "${nodeDir}/"`
            await appendFile(
              join(global.Server.BaseDir!, 'debug.log'),
              `[Node][_init_node][info]: ${command}`
            )
            try {
              await execPromise(`mv "${unzipDir}/*" "${nodeDir}/"`, {
                env,
                shell: '/bin/bash'
              })
            } catch (e) {
              await appendFile(
                join(global.Server.BaseDir!, 'debug.log'),
                `[Node][_init_node][error]: ${e}`
              )
            }
            await remove(unzipDir)
            if (existsSync(bin)) {
              resolve({
                node: bin,
                npm: join(nodeDir, 'bin/npm')
              })
              return true
            }
          }
          await remove(zip)
        }
        return false
      }
      const res = await checkZip()
      if (res) {
        return
      }
      const url = `https://nodejs.org/dist/v18.20.4/${zipName}.tar.xz`
      axios({
        method: 'get',
        url: url,
        proxy: getAxiosProxy(),
        responseType: 'stream'
      })
        .then(function (response) {
          const stream = createWriteStream(zip)
          response.data.pipe(stream)
          stream.on('error', (err: any) => {
            console.log('stream error: ', err)
            try {
              if (existsSync(zip)) {
                unlinkSync(zip)
              }
            } catch (e) {}
            reject(new Error('down failed'))
          })
          stream.on('finish', async () => {
            const res = await checkZip()
            if (res) {
              return
            } else {
              reject(new Error('down failed'))
            }
          })
        })
        .catch((err) => {
          console.log('down error: ', err)
          try {
            if (existsSync(zip)) {
              unlinkSync(zip)
            }
          } catch (e) {}
          reject(new Error('down failed'))
        })
    })
  }

  start(hasSuccessed?: boolean) {
    let stdout = ''
    let log = ''
    let resolved = false
    let timer: NodeJS.Timeout | undefined
    let node = ''
    let npm = ''
    return new Promise(async (resolve, reject) => {
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
      const nodesh = await this._init_sh()
      try {
        let res = execPromise(`bash ${nodesh} which-node`, {
          env,
          shell: '/bin/bash'
        })
        node = res?.stdout?.toString()?.trim() ?? ''
        res = execPromise(`bash ${nodesh} which-npm`, {
          env,
          shell: '/bin/bash'
        })
        npm = res?.stdout?.toString()?.trim() ?? ''
      } catch (e: any) {}
      if (!node || !npm) {
        try {
          const res = await this._init_node()
          node = res.node
          npm = res.npm
        } catch (e) {}
      }
      if (!node || !npm) {
        reject(new Error('NodeJs Not Found And Install Failed'))
        return
      }
      env.PATH = Array.from(
        new Set(`${dirname(npm)}:${dirname(node)}:${env.PATH}`.split(':'))
      ).join(':')
      const npmInstall = () => {
        const node_modules = join(cacheDir!, 'node_modules')
        const package_lock = join(cacheDir!, 'package-lock.json')
        if (existsSync(node_modules) && existsSync(package_lock)) {
          copyFile()
        } else {
          const command = `cd ${cacheDir};npm install dns2 tangerine undici ip;`
          execPromise(command, {
            env,
            shell: '/bin/bash'
          })
            .then(() => {
              copyFile()
            })
            .catch((e: Error) => {
              writeFileSync(logFile, `${e}`)
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
            this.pty?.write(`cd "${cacheDir}"\r`)
            this.pty?.write(`chmod 777 "${cacheFile}"\r`)
            const shell = `cd "${dirname(node)}" && echo '${global.Server.Password}' | sudo -S ./node "${cacheFile}"\r`
            this.pty?.write(shell)
          } catch (e: any) {}
        })
      }

      if (hasSuccessed) {
        next()
      } else {
        npmInstall()
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
      execPromise(`echo '${global.Server.Password}' | sudo -S lsof -i:53 | awk '{print $1,$2,$3}'`)
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
