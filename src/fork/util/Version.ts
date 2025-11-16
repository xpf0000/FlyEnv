import { statSync } from 'node:fs'
import type { SoftInstalled } from '@shared/app'
import { compareVersions } from 'compare-versions'
import { dirname, join } from 'path'
import {
  spawnPromiseWithEnv,
  existsSync,
  realpathSync,
  execPromiseWithEnv,
  getSubDirAsync,
  execPromise,
  fetchPathByBin
} from '../Fn'
import { isLinux, isWindows } from '@shared/utils'
import * as process from 'node:process'
import { userInfo } from 'node:os'
import { execSync } from 'node:child_process'

export function versionFixed(version?: string | null) {
  return (
    version
      ?.split('.')
      ?.map((v) => {
        const vn = parseInt(v)
        if (isNaN(vn)) {
          return '0'
        }
        return `${vn}`
      })
      ?.join('.') ?? '0'
  )
}

export const versionCheckBin = (binPath: string) => {
  if (existsSync(binPath)) {
    binPath = realpathSync(binPath)
    if (!existsSync(binPath)) {
      return false
    }
    const stat = statSync(binPath)
    if (!stat.isFile()) {
      return false
    }
    return binPath
  }
  return false
}

export const versionSort = (versions: SoftInstalled[]) => {
  return versions.sort((a, b) => {
    const bv = versionFixed(b.version)
    const av = versionFixed(a.version)
    return compareVersions(bv, av)
  })
}

export const versionFilterSame = (versions: SoftInstalled[]) => {
  const arr: SoftInstalled[] = []
  let item = versions.pop()
  while (item) {
    const has = versions.some((v) => v.bin === item?.bin)
    if (!has) {
      arr.push(item)
    }
    item = versions.pop()
  }
  return arr
}

export const versionBinVersionSync = (bin: string, command: string, reg: RegExp): string => {
  let version: string | undefined = ''
  const cwd = dirname(bin)
  try {
    process.chdir(cwd)
    const res = execSync(command, {
      cwd,
      shell: undefined
    }).toString()
    let str = res
    str = str.replace(new RegExp(`\r\n`, 'g'), `\n`)
    try {
      version = reg?.exec(str)?.[2]?.trim()
      reg!.lastIndex = 0
    } catch {}
  } catch (e) {
    console.log('versionBinVersion err: ', e)
  }
  return version ?? ''
}

export const versionBinVersion = (
  bin: string,
  command: string,
  reg: RegExp,
  findInError?: boolean
): Promise<{ version?: string; error?: string }> => {
  return new Promise(async (resolve) => {
    const handleCatch = (err: any) => {
      resolve({
        error: command + '<br/>' + err.toString().trim().replace(new RegExp('\n', 'g'), '<br/>'),
        version: undefined
      })
    }
    const handleThen = (res: any) => {
      let str = res.stdout + res.stderr
      str = str.replace(new RegExp(`\r\n`, 'g'), `\n`)
      let version: string | undefined = ''
      try {
        version = reg?.exec(str)?.[2]?.trim()
        reg!.lastIndex = 0
      } catch {}
      resolve({
        version
      })
    }
    const cwd = dirname(bin)
    try {
      process.chdir(cwd)
      const res = await execPromise(command, {
        cwd,
        shell: undefined
      })
      console.log('versionBinVersion: ', command, reg, bin, res)
      handleThen(res)
    } catch (e) {
      console.log('versionBinVersion err: ', e)
      if (findInError) {
        handleThen({
          stdout: '',
          stderr: `${e}`
        })
        return
      }
      handleCatch(e)
    }
  })
}

export const versionDirCache: Record<string, string[]> = {}

export const versionLocalFetch = async (
  customDirs: string[],
  binName: string,
  searchName?: string,
  binPaths?: string[]
): Promise<Array<SoftInstalled>> => {
  const installed: Set<string> = new Set()
  let searchDepth1Dir: string[] = []
  let searchDepth2Dir: string[] = []
  if (isWindows()) {
    searchDepth1Dir = [...customDirs]
    searchDepth2Dir = [global.Server.AppDir!]
  } else {
    searchDepth1Dir = ['/', '/opt', '/opt/local/', '/usr', ...customDirs]
    searchDepth2Dir = [global.Server.AppDir!]
    if (searchName) {
      const base = ['/usr/local/Cellar', '/opt/homebrew/Cellar']
      if (isLinux()) {
        base.push('/home/linuxbrew/.linuxbrew/Cellar')
        const uinfo = userInfo()
        base.push(join(uinfo.homedir, '.linuxbrew/bin/brew'))
      }
      for (const b of base) {
        if (!existsSync(b)) {
          continue
        }
        const subDir = versionDirCache?.[b] ?? (await getSubDirAsync(b))
        if (!versionDirCache?.[b]) {
          versionDirCache[b] = subDir
        }
        const subDirFilter = subDir.filter((f) => {
          return f.includes(searchName)
        })
        for (const f of subDirFilter) {
          const subDir1 = versionDirCache?.[f] ?? (await getSubDirAsync(f))
          if (!versionDirCache?.[f]) {
            versionDirCache[f] = subDir1
          }
          for (const s of subDir1) {
            searchDepth2Dir.push(s)
          }
        }
      }
    }
  }

  const checkedDir: Set<string> = new Set()

  const findInstalled = async (dir: string, depth = 0, maxDepth = 2) => {
    if (!existsSync(dir)) {
      return
    }
    dir = realpathSync(dir)
    if (checkedDir.has(dir)) {
      return
    }
    let binPath: string | boolean = false
    if (binPaths) {
      for (const p of binPaths) {
        binPath = versionCheckBin(join(dir, p))
        if (binPath) {
          installed.add(binPath)
          checkedDir.add(dir)
          return
        }
      }
    }
    binPath = versionCheckBin(join(dir, `${binName}`))
    if (binPath) {
      installed.add(binPath)
      checkedDir.add(dir)
      return
    }
    binPath = versionCheckBin(join(dir, `bin/${binName}`))
    if (binPath) {
      installed.add(binPath)
      checkedDir.add(dir)
      return
    }
    binPath = versionCheckBin(join(dir, `sbin/${binName}`))
    if (binPath) {
      installed.add(binPath)
      checkedDir.add(dir)
      return
    }
    if (depth >= maxDepth) {
      checkedDir.add(dir)
      return
    }
    checkedDir.add(dir)
    const sub = versionDirCache?.[dir] ?? (await getSubDirAsync(dir))
    if (!versionDirCache?.[dir]) {
      versionDirCache[dir] = sub
    }
    for (const s of sub) {
      await findInstalled(s, depth + 1, maxDepth)
    }
  }

  for (const s of searchDepth1Dir) {
    await findInstalled(s, 0, 1)
  }

  for (const s of searchDepth2Dir) {
    await findInstalled(s)
  }

  const count = installed.size
  if (count === 0) {
    return []
  }

  const list: Array<SoftInstalled> = []
  const installedList: Array<string> = Array.from(installed)
  for (const i of installedList) {
    const path = fetchPathByBin(i)
    const item = {
      bin: i,
      path,
      run: false,
      running: false
    }
    if (!list.find((f) => f.path === item.path && f.bin === item.bin)) {
      list.push(item as any)
    }
  }
  return list
}

export const versionMacportsFetch = async (bins: string[]): Promise<Array<SoftInstalled>> => {
  const list: Array<SoftInstalled> = []
  const base = '/opt/local/'
  const find = (fpm: string) => {
    let bin = join(base, fpm)
    if (existsSync(bin)) {
      bin = realpathSync(bin)
      const path = fetchPathByBin(bin)
      const item = {
        bin,
        path: `${path}/`,
        run: false,
        running: false
      }
      list.push(item as any)
    }
    return true
  }
  for (const fpm of bins) {
    find(fpm)
  }
  list.forEach((item) => {
    item.flag = 'macports'
  })
  return list
}

export const brewInfoJson = async (names: string[]) => {
  const info: any = []
  const command = ['brew', 'info', ...names, '--json', '--formula'].join(' ')
  console.log('brewinfo doRun: ', command)
  try {
    const res = await execPromiseWithEnv(command, {
      env: {
        HOMEBREW_NO_INSTALL_FROM_API: 1
      }
    })
    const arr = JSON.parse(res.stdout)
    arr.forEach((item: any) => {
      info.push({
        version: item?.versions?.stable ?? '',
        installed: item?.installed?.length > 0,
        name: item.full_name,
        flag: 'brew'
      })
    })
  } catch (e) {
    console.error('brewInfoJson nginx: ', e)
  }
  return info
}

export const brewSearch = async (
  all: string[],
  command: string,
  handleContent?: (content: string) => string
) => {
  try {
    const res = await execPromiseWithEnv(command, {
      env: {
        HOMEBREW_NO_INSTALL_FROM_API: 1
      }
    })
    let content: any = res.stdout
    console.log('brewinfo content: ', content)
    if (handleContent) {
      content = handleContent(content)
    }
    content = content
      .split('\n')
      .map((s: string) => s.trim())
      .filter((s: string) => s && !s.includes(' '))
    all.push(...content)
  } catch (e) {
    console.log('brewSearch err: ', e)
  }
  return all
}

export const portSearch = async (
  reg: string,
  filter: (f: string) => boolean,
  isInstalled: (name: string, version?: string) => boolean
) => {
  try {
    let arr = []
    const info = await spawnPromiseWithEnv('port', ['search', '--name', '--line', '--regex', reg])
    arr = info.stdout
      .split('\n')
      .filter(filter)
      .map((m: string) => {
        const a = m.split('\t').filter((f) => f.trim().length > 0)
        const name = a.shift() ?? ''
        const version = a.shift() ?? ''
        const installed = isInstalled(name, version)
        return {
          name,
          version,
          installed,
          flag: 'port'
        }
      })
    arr.sort((a, b) => compareVersions(b.version, a.version))
    return arr
  } catch (e) {
    console.log('portSearch err: ', e)
  }
  return []
}
