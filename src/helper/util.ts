import { mkdirp, remove, existsSync, readFile, writeFile } from '@shared/fs-extra'
import { exec } from 'child_process'
import { promisify } from 'util'
import { platform } from 'node:os'

const execPromise = promisify(exec)

export { execPromise }

export { mkdirp, remove, existsSync, readFile, writeFile }

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
