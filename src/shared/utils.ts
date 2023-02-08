const { spawn } = require('child_process')
const os = require('os')

export function execAsync(
  command: string,
  arg: Array<string> = [],
  options: { [key: string]: any } = {}
) {
  return new Promise((resolve, reject) => {
    const optdefault = { env: process.env }
    if (!optdefault.env['PATH']) {
      optdefault.env['PATH'] =
        '/opt:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
    } else {
      optdefault.env[
        'PATH'
      ] = `/opt:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:${optdefault.env['PATH']}`
    }
    const opt = { ...optdefault, ...options }
    if (global.Server.Proxy) {
      for (const k in global.Server.Proxy) {
        opt.env[k] = global.Server.Proxy[k]
      }
    }
    if (global.Server.isAppleSilicon) {
      arg.unshift('-arm64', command)
      command = 'arch'
    }
    const cp = spawn(command, arg, opt)
    const stdout: Array<Buffer> = []
    const stderr: Array<Buffer> = []
    cp.stdout.on('data', (data: Buffer) => {
      stdout.push(data)
    })

    cp.stderr.on('data', (data: Buffer) => {
      stderr.push(data)
    })

    cp.on('close', (code: number) => {
      const out = Buffer.concat(stdout)
      const err = Buffer.concat(stderr)
      if (code === 0) {
        resolve(out.toString().trim())
      } else {
        reject(err.toString().trim())
      }
    })
  })
}

export function uuid(length = 32) {
  const num = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'
  let str = ''
  for (let i = 0; i < length; i++) {
    str += num.charAt(Math.floor(Math.random() * num.length))
  }
  return str
}

export function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

export function isAppleSilicon() {
  const cpuCore = os.cpus()
  return cpuCore[0].model.includes('Apple')
}
