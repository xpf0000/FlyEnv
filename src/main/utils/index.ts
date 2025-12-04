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
import logger from '../core/Logger'

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
  writeFile,
  logger
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

/**
 * Normalize locale code to full format for PostgreSQL and other services
 * Converts short locale codes (e.g., "vi") to full locale format (e.g., "vi_VN.UTF-8")
 */
export function getLocale(): string {
  const locale = app?.getLocale() ?? ''
  // Treat null / undefined / empty / whitespace as missing
  if (locale.trim() === '') {
    return 'en_US.UTF-8' // Safe default fallback
  }

  const localeMap: Record<string, string> = {
    vi: 'vi_VN' // Vietnamese
  }

  // Check if locale is in the map
  if (localeMap[locale]) {
    return `${localeMap[locale]}.UTF-8`
  }

  // For locales already in format "xx_YY" or "xx-YY", convert hyphen to underscore
  const normalized = locale.split('-').join('_')

  // If already has underscore (e.g., "en_US"), use it as is
  if (normalized.includes('_')) {
    // Warn if not in our known locale map
    if (!Object.values(localeMap).includes(normalized)) {
      logger.warn(`Using unvalidated locale code: ${locale}`)
    }
    return `${normalized}.UTF-8`
  }

  // For unknown short codes, use safe fallback to prevent invalid locale codes
  // Log warning for debugging purposes
  logger.warn(`Unknown locale code: ${locale}, falling back to en_US.UTF-8`)
  return 'en_US.UTF-8'
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
