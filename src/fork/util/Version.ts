import { statSync } from 'node:fs'
import type { SoftInstalled } from '@shared/app'
import { compareVersions } from '@shared/compare-versions'
import { dirname, join } from 'path'
import {
  spawnPromiseWithEnv,
  existsSync,
  realpathSync,
  execPromiseWithEnv,
  getSubDirAsync,
  fetchPathByBin
} from '../Fn'
import { appDebugLog, isLinux, isWindows } from '@shared/utils'
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
    const outputFromExecError = (err: any) => {
      return [err?.stdout, err?.stderr]
        .filter((s) => `${s ?? ''}`.trim().length > 0)
        .map((s) => `${s}`)
        .join('\n')
    }
    const messageFromExecError = (err: any) => {
      return [outputFromExecError(err), `${err}`]
        .filter((s) => `${s ?? ''}`.trim().length > 0)
        .join('\n')
    }
    const handleCatch = (err: any) => {
      resolve({
        error: `${command}\n${messageFromExecError(err)}`,
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
      const res = await execPromiseWithEnv(command, {
        cwd,
        shell: undefined
      })
      console.log('versionBinVersion: ', command, reg, bin, res)
      handleThen(res)
    } catch (e) {
      console.log('versionBinVersion err: ', e)
      appDebugLog('[versionBinVersion][error]', `${e}`).catch()
      if (findInError) {
        handleThen({
          stdout: outputFromExecError(e) || `${e}`,
          stderr: ''
        })
        return
      }
      handleCatch(e)
    }
  })
}

export const versionBinVersionOutput = (
  bin: string,
  command: string
): Promise<{ version?: string; error?: string }> => {
  return new Promise(async (resolve) => {
    const handleCatch = (err: any) => {
      resolve({
        error: `${command}\n${err}`,
        version: undefined
      })
    }
    const cwd = dirname(bin)
    try {
      process.chdir(cwd)
      const res = await execPromiseWithEnv(command, {
        cwd,
        shell: undefined
      })
      resolve({
        version: res.stdout
      })
    } catch (e) {
      handleCatch(e)
    }
  })
}

export const versionDirCache: Record<string, string[]> = {}

const normalizeExistingDir = (dir?: string | null) => {
  const path = dir?.trim()
  if (!path || !existsSync(path)) {
    return undefined
  }
  try {
    if (!statSync(path).isDirectory()) {
      return undefined
    }
    return realpathSync(path)
  } catch {
    return undefined
  }
}

const addCellarDir = (dirs: Set<string>, dir?: string | null) => {
  const path = normalizeExistingDir(dir)
  if (path) {
    dirs.add(path)
  }
}

const addBrewBin = (bins: Set<string>, bin?: string | null) => {
  const path = bin?.trim()
  if (!path) {
    return
  }
  const real = versionCheckBin(path)
  if (real) {
    bins.add(path)
  }
}

const fetchCommandBins = async (command: string) => {
  const fetch = async (args: string[]) => {
    const res = await spawnPromiseWithEnv('which', args)
    return res.stdout
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => !!s)
  }
  try {
    return await fetch(['-a', command])
  } catch {}
  try {
    return await fetch([command])
  } catch {}
  return []
}

const inferCellarDirsFromBrewBin = (bin: string) => {
  const prefix = dirname(dirname(bin))
  const dirs = [join(prefix, 'Cellar')]
  if (prefix.endsWith('/Homebrew')) {
    dirs.push(join(dirname(prefix), 'Cellar'))
  }
  return dirs
}

const fetchCellarDirsByBrewBin = async (bin: string) => {
  const dirs: string[] = []
  try {
    const res = await spawnPromiseWithEnv(bin, ['--cellar'])
    dirs.push(
      ...res.stdout
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => !!s)
    )
  } catch {}
  try {
    const res = await spawnPromiseWithEnv(bin, ['--prefix'])
    dirs.push(
      ...res.stdout
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => !!s)
        .map((s) => join(s, 'Cellar'))
    )
  } catch {}
  dirs.push(...inferCellarDirsFromBrewBin(bin))
  return dirs
}

const fetchBrewCellarDirs = async () => {
  const dirs: Set<string> = new Set()
  const bins: Set<string> = new Set()
  const uinfo = userInfo()
  const fallbackDirs = [
    global.Server?.BrewCellar,
    '/usr/local/Cellar',
    '/opt/homebrew/Cellar',
    '/opt/nanobrew/Cellar',
    '/opt/nanobrew/prefix/Cellar',
    join(uinfo.homedir, '.nanobrew/Cellar')
  ]
  const fallbackBins = [
    global.Server?.BrewBin,
    '/usr/local/bin/brew',
    '/usr/local/Homebrew/bin/brew',
    '/opt/homebrew/bin/brew',
    '/opt/nanobrew/bin/brew',
    '/opt/nanobrew/bin/nb',
    '/opt/nanobrew/bin/nanobrew',
    join(uinfo.homedir, '.nanobrew/bin/brew'),
    join(uinfo.homedir, '.nanobrew/bin/nb'),
    join(uinfo.homedir, '.nanobrew/bin/nanobrew')
  ]
  if (isLinux()) {
    fallbackDirs.push('/home/linuxbrew/.linuxbrew/Cellar', join(uinfo.homedir, '.linuxbrew/Cellar'))
    fallbackBins.push(
      '/home/linuxbrew/.linuxbrew/bin/brew',
      join(uinfo.homedir, '.linuxbrew/bin/brew')
    )
  }

  fallbackDirs.forEach((dir) => addCellarDir(dirs, dir))
  fallbackBins.forEach((bin) => addBrewBin(bins, bin))

  for (const command of ['brew', 'nanobrew']) {
    const commandBins = await fetchCommandBins(command)
    commandBins.forEach((bin) => addBrewBin(bins, bin))
  }

  for (const bin of bins) {
    const commandCellarDirs = await fetchCellarDirsByBrewBin(bin)
    commandCellarDirs.forEach((dir) => addCellarDir(dirs, dir))
  }

  return Array.from(dirs)
}

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
    try {
      const res = await execPromiseWithEnv(`where.exe ${binName}`)
      const bins =
        res?.stdout
          ?.split('\n')
          ?.map((s) => s.trim())
          ?.filter((b) => b && existsSync(b))
          ?.map((s) => dirname(realpathSync(s))) ?? []
      searchDepth1Dir.push(...bins)
    } catch {}
  } else {
    searchDepth1Dir = ['/', '/opt', '/opt/local/', '/usr', ...customDirs]
    searchDepth2Dir = [global.Server.AppDir!]
    if (searchName) {
      const base = await fetchBrewCellarDirs()
      for (const b of base) {
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

    try {
      const res = await execPromiseWithEnv(`which ${binName}`)
      const bins =
        res?.stdout
          ?.split('\n')
          ?.map((s) => s.trim())
          ?.filter((b) => b && existsSync(b))
          ?.map((s) => dirname(realpathSync(s))) ?? []
      searchDepth1Dir.push(...bins)
    } catch {}
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
  if (!names.length) {
    return info
  }
  const fetchInfo = async (formulaNames: string[]) => {
    const command = ['brew', 'info', ...formulaNames, '--json', '--formula'].join(' ')
    console.log('brewinfo doRun: ', command)
    const res = await execPromiseWithEnv(command)
    const arr = JSON.parse(res.stdout)
    arr.forEach((item: any) => {
      info.push({
        version: item?.versions?.stable ?? '',
        installed: item?.installed?.length > 0,
        name: item.full_name,
        flag: 'brew'
      })
    })
  }
  try {
    await fetchInfo(names)
  } catch (e) {
    const message = e instanceof Error ? e.message : `${e}`
    console.warn('brewInfoJson batch failed, retrying separately: ', message)
    if (names.length > 1) {
      for (const name of names) {
        try {
          await fetchInfo([name])
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : `${error}`
          console.warn(`brewInfoJson skipped ${name}: `, errorMessage)
        }
      }
    }
  }
  return info
}

export const brewSearch = async (
  all: string[],
  command: string,
  handleContent?: (content: string) => string
) => {
  try {
    const res = await execPromiseWithEnv(command)
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
    arr.sort((a, b) => compareVersions(versionFixed(b.version), versionFixed(a.version)))
    return arr
  } catch (e) {
    console.log('portSearch err: ', e)
  }
  return []
}
