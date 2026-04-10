import { app } from 'electron'
import { resolve, join } from 'node:path'
import { existsSync } from 'node:fs'
import { isMacOS, isWindows } from '@shared/utils'
import is from 'electron-is'

/**
 * 获取 macOS 运行路径
 */
const getMacOSRunPath = (): string => {
  const userData = app.getPath('userData')
  const oldPath = resolve(userData, '../../PhpWebStudy')
  const newPath = resolve(userData, '../../FlyEnv')

  if (existsSync(oldPath) && oldPath.includes('PhpWebStudy')) {
    return oldPath
  }
  return newPath
}

/**
 * 获取 Windows 便携版路径
 */
const getWindowsPortablePath = (): string => {
  const baseDir = process.env.PORTABLE_EXECUTABLE_DIR!
  const oldPath = join(baseDir, 'PhpWebStudy-Data')
  const newPath = join(baseDir, 'FlyEnv-Data')

  return existsSync(oldPath) ? oldPath : newPath
}

/**
 * 获取 Windows 安装版路径
 */
const getWindowsInstalledPath = (): string => {
  const exePath = app.getPath('exe')
  const oldPath = resolve(exePath, '../../PhpWebStudy-Data').split('\\').join('/')
  const oldPath1 = resolve(oldPath, '../../PhpWebStudy-Data').split('\\').join('/')
  const newPath = resolve(exePath, '../../FlyEnv-Data').split('\\').join('/')

  if (existsSync(oldPath) && oldPath.includes('PhpWebStudy-Data')) {
    return oldPath
  }
  if (existsSync(oldPath1) && oldPath1.includes('PhpWebStudy-Data')) {
    return oldPath1
  }
  return newPath
}

/**
 * 获取 Windows 运行路径
 */
const getWindowsRunPath = (): string => {
  if (is.dev()) {
    return resolve(__static, '../../../data')
  }

  if (process.env?.PORTABLE_EXECUTABLE_DIR) {
    return getWindowsPortablePath()
  }

  return getWindowsInstalledPath()
}

/**
 * 确定运行路径
 */
export const DetermineRunPath = (): string => {
  let runpath = ''

  if (isMacOS()) {
    runpath = getMacOSRunPath()
  } else if (isWindows()) {
    runpath = getWindowsRunPath()
  } else {
    runpath = resolve(app.getPath('userData'), '../FlyEnv')
  }

  return runpath
}
