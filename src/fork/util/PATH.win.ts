import { isAbsolute, join } from 'path'
import { ForkPromise } from '@shared/ForkPromise'
import { copyFile, existsSync, readFile, remove, writeFile } from '../Fn'
import { appDebugLog } from '@shared/utils'
import Helper from '../Helper'

export const fetchRawPATH = (): ForkPromise<string[]> => {
  return new ForkPromise(async (resolve, reject) => {
    console.log('fetchRawPATH !!!!!!')
    const sh = join(global.Server.Static!, 'sh/path-get.ps1')
    const copySh = join(global.Server.Cache!, 'path-get.ps1')
    if (existsSync(copySh)) {
      await remove(copySh)
    }
    await copyFile(sh, copySh)
    const commands = [`Unblock-File -LiteralPath '${copySh}'; & '${copySh}'`]
    let res: any
    try {
      res = await Helper.send('tools', 'exec', commands.join(' '), {
        cwd: global.Server.Cache!
      })
    } catch (e) {
      console.log('fetchRawPATH error: ', e)
      appDebugLog('[_fetchRawPATH][error]', `${e}`).catch()
      return reject(e)
    }

    console.log('fetchRawPATH res: ', res)

    let str = ''
    const stdout = res.stdout.trim() + '\n' + res.stderr.trim()
    console.log('fetchRawPATH stdout: ', stdout)
    const regex = /FlyEnv-PATH-GET([\s\S]*?)FlyEnv-PATH-GET/g
    const match = regex.exec(stdout)
    if (match) {
      str = match[1].trim()
    }
    console.log('fetchRawPATH str: ', {
      str
    })
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
  const sh = join(global.Server.Static!, 'sh/path-set.ps1')
  const copySh = join(global.Server.Cache!, 'path-set.ps1')
  if (existsSync(copySh)) {
    await remove(copySh)
  }
  const pathStr = path.join(';')
  let content = await readFile(sh, 'utf-8')
  content = content.replace('##NEW_PATH##', pathStr).replace('##OTHER##', other)
  await writeFile(copySh, content, 'utf-8')
  try {
    const command = `Unblock-File -LiteralPath '${copySh}'; & '${copySh}'`
    await Helper.send('tools', 'exec', command)
  } catch (e) {
    console.log('writePath error: ', e)
    appDebugLog('[writePath][error]', `${e}`)
  }
}

export const addPath = async (dir: string) => {
  let allPath: string[] = []
  try {
    allPath = await fetchRawPATH()
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
