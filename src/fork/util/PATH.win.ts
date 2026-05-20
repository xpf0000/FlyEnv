import { isAbsolute } from 'path'
import { ForkPromise } from '@shared/ForkPromise'
import { appDebugLog } from '@shared/utils'
import Helper from '../Helper'
import { AppHelperCheck } from '@shared/AppHelperCheck'

export const fetchRawPATH = (useHelper = false): ForkPromise<string[]> => {
  return new ForkPromise(async (resolve, reject) => {
    console.log('fetchRawPATH !!!!!!')
    let helperEnable = false
    try {
      if (Helper.enable) {
        helperEnable = true
      } else if (await AppHelperCheck()) {
        helperEnable = true
      }
    } catch {
      helperEnable = false
    }

    if (!useHelper && !helperEnable) {
      reject(new Error('Need Install FlyEnv Helper'))
      return
    }

    let res: any
    try {
      const pathStr = await Helper.send<string>('tools', 'getSystemPath')
      res = { stdout: pathStr, stderr: '' }
    } catch (e) {
      console.log('fetchRawPATH error: ', e)
      appDebugLog('[_fetchRawPATH][error]', `${e}`).catch()
      return reject(e)
    }

    console.log('fetchRawPATH res: ', res)

    let str = res.stdout.trim()
    console.log('fetchRawPATH str: ', { str })
    str = str.replace(new RegExp(`\r\n`, 'g'), '').replace(new RegExp(`\n`, 'g'), '')
    if (!str.includes(':\\') && !str.includes('%')) {
      return resolve([])
    }
    const oldPath = Array.from(new Set(str.split(';') ?? []))
      .filter((s) => !!s.trim())
      .map((s) => s.trim())
    console.log('_fetchRawPATH: ', str, oldPath)
    resolve(oldPath)
  })
}

export const handleWinPathArr = (paths: string[]) => {
  return Array.from(new Set(paths))
    .map((p) => {
      return p.trim()
    })
    .filter((p) => {
      if (!p) {
        return false
      }
      return isAbsolute(p) || p.includes('%') || p.includes('$env:')
    })
    .sort((a, b) => {
      // 判断a的类型
      const aType = isAbsolute(a)
        ? 1
        : a.startsWith('%SystemRoot%')
          ? 2
          : a.includes('%') || a.includes('$env:')
            ? 3
            : 4
      // 判断b的类型
      const bType = isAbsolute(b)
        ? 1
        : b.startsWith('%SystemRoot%')
          ? 2
          : b.includes('%') || b.includes('$env:')
            ? 3
            : 4
      // 比较优先级
      return aType - bType
    })
}

export const writePath = async (path: string[], other: string = '') => {
  console.log('writePath paths: ', path)
  try {
    const otherVars: Record<string, string> = {}
    if (other) {
      // parse simple key=value pairs if needed, currently other is always empty
    }
    await Helper.send('tools', 'setSystemPath', path, otherVars)
  } catch (e) {
    console.log('writePath error: ', e)
    appDebugLog('[writePath][error]', `${e}`)
  }
}

export const addPath = async (dir: string) => {
  let allPath: string[] = []
  try {
    allPath = await fetchRawPATH(true)
  } catch {
    return
  }
  const index = allPath.indexOf(dir)
  if (index === 0) {
    return
  }
  if (index > 0) {
    allPath.splice(index, 1)
  }
  allPath.unshift(dir)
  const savePath = handleWinPathArr(allPath)
  try {
    await writePath(savePath)
  } catch {}
}
