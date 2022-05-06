import { app } from 'electron'
import is from 'electron-is'
import { resolve } from 'path'
import { existsSync, lstatSync } from 'fs'
import logger from '../core/Logger'

export function getLogPath() {
  return logger.transports.file.file
}

export function getDhtPath(protocol) {
  const name = protocol === 6 ? 'dht6.dat' : 'dht.dat'
  return resolve(app.getPath('userData'), `./${name}`)
}

export function getUserDataPath() {
  return app.getPath('userData')
}

export function getUserDownloadsPath() {
  return app.getPath('downloads')
}

export function transformConfig(config) {
  let result = []
  for (const [k, v] of Object.entries(config)) {
    if (v !== '') {
      result.push(`--${k}=${v}`)
    }
  }
  return result
}

export function isRunningInDmg() {
  if (!is.macOS() || is.dev()) {
    return false
  }
  const appPath = app.getAppPath()
  const result = appPath.startsWith('/Volumes/')
  return result
}

export function moveAppToApplicationsFolder(errorMsg = '') {
  return new Promise((resolve, reject) => {
    try {
      const result = app.moveToApplicationsFolder()
      if (result) {
        resolve(result)
      } else {
        reject(new Error(errorMsg))
      }
    } catch (err) {
      reject(err)
    }
  })
}

export function splitArgv(argv) {
  const args = []
  const extra = {}
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const kv = arg.split('=')
      const key = kv[0]
      const value = kv[1] || '1'
      extra[key] = value
      continue
    }
    args.push(arg)
  }
  return { args, extra }
}

export function parseArgvAsUrl(argv) {
  let arg = argv[1]
  if (!arg) {
    return
  }

  if (checkIsSupportedSchema(arg)) {
    return arg
  }
}

export function checkIsSupportedSchema(url = '') {
  const str = url.toLowerCase()
  if (
    str.startsWith('mo:') ||
    str.startsWith('motrix:') ||
    str.startsWith('http:') ||
    str.startsWith('https:') ||
    str.startsWith('ftp:') ||
    str.startsWith('magnet:') ||
    str.startsWith('thunder:')
  ) {
    return true
  } else {
    return false
  }
}

export function isDirectory(path) {
  return existsSync(path) && lstatSync(path).isDirectory()
}

export function parseArgvAsFile(argv) {
  let arg = argv[1]
  if (!arg || isDirectory(arg)) {
    return
  }

  if (is.linux()) {
    arg = arg.replace('file://', '')
  }
  return arg
}

export function uuid(length = 32) {
  const num = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'
  let str = ''
  for (let i = 0; i < length; i++) {
    str += num.charAt(Math.floor(Math.random() * num.length))
  }
  return str
}
