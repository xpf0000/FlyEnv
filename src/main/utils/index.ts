import { app } from 'electron'
import _fs from 'fs-extra'
import crypto from 'crypto'

const {
  createWriteStream,
  removeSync,
  stat,
  existsSync,
  copyFile,
  appendFile,
  chmod,
  remove,
  mkdirp,
  readFile,
  writeFile
} = _fs

export {
  createWriteStream,
  removeSync,
  stat,
  existsSync,
  copyFile,
  appendFile,
  chmod,
  remove,
  mkdirp,
  readFile,
  writeFile
}

export function md5(str: string) {
  const md5 = crypto.createHash('md5')
  return md5.update(str).digest('hex')
}

export function splitArgv(argv: Array<any>) {
  const args = []
  const extra: { [key: string]: any } = {}
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

export function uuid(length = 32) {
  const num = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'
  let str = ''
  for (let i = 0; i < length; i++) {
    str += num.charAt(Math.floor(Math.random() * num.length))
  }
  return str
}

export function getLanguage(locale?: string) {
  if (locale) {
    return locale
  }
  return app?.getLocale()?.split('-')?.[0] ?? 'en'
}

export const wait = (time = 2000) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(true)
    }, time)
  })
}
