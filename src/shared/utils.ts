import crypto from 'node:crypto'
import { cpus } from 'node:os'
import { join } from 'node:path'
import { platform } from 'node:os'
import { appendFile } from './fs-extra'

export async function appDebugLog(flag: string, info: string) {
  try {
    const debugFile = join(global.Server.BaseDir!, 'debug.log')
    await appendFile(debugFile, `${flag}: ${info}\n`)
  } catch {
    /* empty */
  }
}

export function waitTime(time: number) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(true)
    }, time)
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

export function isArmArch() {
  const cpuCore = cpus()
  return cpuCore[0].model.includes('Apple')
}

export function md5(str: string) {
  const md5 = crypto.createHash('md5')
  return md5.update(str).digest('hex')
}

export function pathFixedToUnix(path: string) {
  const needAdd = path.endsWith('\\')
  const p = path
    .split('\\')
    .filter((s) => !!s.trim())
    .join('/')
  return needAdd ? `${p}/` : p
}

const os = platform()

export function isWindows() {
  return os === 'win32'
}

export function isMacOS() {
  return os === 'darwin'
}

export function isLinux() {
  return os === 'linux'
}

export function defaultShell() {
  if (isMacOS()) {
    return '#!/bin/zsh'
  }
  if (isLinux()) {
    return '#!/bin/bash'
  }
  return ''
}
