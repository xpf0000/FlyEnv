import { app } from 'electron'
import { arch, cpus } from 'os'
import {
  appendFile,
  chmod,
  copyFile,
  createWriteStream,
  existsSync,
  mkdirp,
  readFile,
  remove,
  stat,
  unlinkSync,
  writeFile
} from '@shared/fs-extra'
import { isLinux, isMacOS, pathFixedToUnix } from '@shared/utils'
import Helper from '../../fork/Helper'

export {
  createWriteStream,
  unlinkSync,
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

export function isArmArch() {
  if (isMacOS()) {
    const cpuCore = cpus()
    return cpuCore[0].model.includes('Apple')
  }
  if (isLinux()) {
    return arch() !== 'x64'
  }
  return false
}

export async function readFileFixed(file: string): Promise<string> {
  const path = pathFixedToUnix(file)
  try {
    return await readFile(path, 'utf-8')
  } catch {}
  try {
    return (await Helper.send('tools', 'readFileByRoot', path)) as any
  } catch {}
  throw new Error(`readFileFixed Failed: ${file}`)
}

export async function writeFileFixed(file: string, content: string) {
  const path = pathFixedToUnix(file)
  try {
    return await writeFile(path, content)
  } catch {}
  try {
    return await Helper.send('tools', 'writeFileByRoot', path, content)
  } catch {}

  throw new Error(`writeFileFixed Failed: ${file}`)
}
