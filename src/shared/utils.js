const { spawn } = require('child_process')
const os = require('os')

export function execAsync(command, arg = [], options = {}) {
  return new Promise((resolve, reject) => {
    let optdefault = { env: process.env }
    if (!optdefault.env['PATH']) {
      optdefault.env['PATH'] =
        '/opt:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
    } else {
      optdefault.env[
        'PATH'
      ] = `/opt:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:${optdefault.env['PATH']}`
    }
    let opt = { ...optdefault, ...options }
    if (global.Server.isAppleSilicon) {
      arg.unshift('-arm64', command)
      command = 'arch'
    }
    const cp = spawn(command, arg, opt)
    let stdout = []
    let stderr = []
    cp.stdout.on('data', (data) => {
      stdout.push(data)
    })

    cp.stderr.on('data', (data) => {
      stderr.push(data)
    })

    cp.on('close', (code) => {
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

export function hasClass(element, cls) {
  return (' ' + element.className + ' ').indexOf(cls) > -1
}

export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

export function isAppleSilicon() {
  let cpuCore = os.cpus()
  return cpuCore[0].model.includes('Apple')
}
