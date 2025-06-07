import {
  createWriteStream,
  existsSync,
  readdirSync,
  realpathSync,
  statSync,
  type FSWatcher
} from 'fs'
import { dirname, isAbsolute, join, parse, normalize } from 'path'
import { ForkPromise } from '@shared/ForkPromise'
import crypto from 'crypto'
import axios from 'axios'
import _fs from 'fs-extra'
import type { AppHost, SoftInstalled } from '@shared/app'
import { compareVersions } from 'compare-versions'
import chardet from 'chardet'
import iconv from 'iconv-lite'
import { userInfo, hostname } from 'os'
import _node_machine_id from 'node-machine-id'
import { execPromise, spawnPromise, customerServiceStartExec } from './util/Exec'
import { zipUnPack } from './util/Zip'
import {
  serviceStartExec,
  serviceStartExecCMD,
  serviceStartExecGetPID,
  waitPidFile
} from './util/ServiceStart'

const { machineId } = _node_machine_id

export {
  machineId,
  execPromise,
  spawnPromise,
  customerServiceStartExec,
  zipUnPack,
  serviceStartExec,
  serviceStartExecCMD,
  serviceStartExecGetPID,
  waitPidFile
}

const {
  watch,
  copy,
  chmod,
  copyFile,
  unlink,
  readdir,
  writeFile,
  realpath,
  remove,
  mkdirp,
  readFile,
  appendFile,
  rename
} = _fs

export {
  rename,
  realpathSync,
  FSWatcher,
  watch,
  copy,
  chmod,
  copyFile,
  unlink,
  readdir,
  writeFile,
  realpath,
  remove,
  mkdirp,
  readFile,
  existsSync,
  appendFile
}

export function pathFixedToUnix(path: string) {
  return path.split('\\').join('/')
}

export const ProcessSendSuccess = (key: string, data: any, on?: boolean) => {
  process?.send?.({
    on,
    key,
    info: {
      code: 0,
      data
    }
  })
}

export const ProcessSendError = (key: string, msg: any, on?: boolean) => {
  process?.send?.({
    on,
    key,
    info: {
      code: 1,
      msg
    }
  })
}

export const ProcessSendLog = (key: string, msg: any, on?: boolean) => {
  process?.send?.({
    on,
    key,
    info: {
      code: 200,
      msg
    }
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

export function waitTime(time: number) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(true)
    }, time)
  })
}

export function md5(str: string) {
  const md5 = crypto.createHash('md5')
  return md5.update(str).digest('hex')
}

export function downFile(url: string, savepath: string) {
  return new ForkPromise((resolve, reject, on) => {
    const proxyUrl =
      Object.values(global?.Server?.Proxy ?? {})?.find((s: string) => s.includes('://')) ?? ''
    let proxy: any = {}
    if (proxyUrl) {
      try {
        const u = new URL(proxyUrl)
        proxy.protocol = u.protocol.replace(':', '')
        proxy.host = u.hostname
        proxy.port = u.port
      } catch {
        proxy = undefined
      }
    } else {
      proxy = undefined
    }
    axios({
      method: 'get',
      url: url,
      responseType: 'stream',
      proxy: proxy,
      onDownloadProgress: (progress) => {
        if (progress.total) {
          const percent = Math.round((progress.loaded * 100.0) / progress.total)
          on(percent)
        }
      }
    })
      .then(async (response) => {
        const base = dirname(savepath)
        await mkdirp(base)
        const stream = createWriteStream(savepath)
        response.data.pipe(stream)
        stream.on('error', (err) => {
          reject(err)
        })
        stream.on('finish', () => {
          resolve(true)
        })
      })
      .catch((err) => {
        reject(err)
      })
  })
}

export function getSubDir(fp: string, fullpath = true) {
  const arr: Array<string> = []
  if (!existsSync(fp)) {
    return arr
  }
  const stat = statSync(fp)
  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    try {
      const files = readdirSync(fp)
      files.forEach(function (item) {
        const fPath = join(fp, item)
        if (existsSync(fPath)) {
          const stat = statSync(fPath)
          if (stat.isDirectory() && !stat.isSymbolicLink()) {
            arr.push(fullpath ? fPath : item)
          }
        }
      })
    } catch {}
  }
  return arr
}

export const getAllFileAsync = async (
  dirPath: string,
  fullpath = true,
  basePath: Array<string> = []
): Promise<string[]> => {
  if (!existsSync(dirPath)) {
    return []
  }
  const list: Array<string> = []
  const files = await readdir(dirPath, { withFileTypes: true })
  for (const file of files) {
    const arr = [...basePath]
    arr.push(file.name)
    const childPath = join(dirPath, file.name)
    if (file.isDirectory()) {
      const sub = await getAllFileAsync(childPath, fullpath, arr)
      list.push(...sub)
    } else if (file.isFile()) {
      const name = fullpath ? childPath : arr.join('/')
      list.push(name)
    }
  }
  return list
}

export const getSubDirAsync = async (dirPath: string, fullpath = true): Promise<string[]> => {
  if (!existsSync(dirPath)) {
    return []
  }
  const list: Array<string> = []
  const files = await readdir(dirPath, { withFileTypes: true })
  for (const file of files) {
    const childPath = join(dirPath, file.name)
    if (file.isDirectory()) {
      const name = fullpath ? childPath : file.name
      list.push(name)
    }
  }
  return list
}

export const hostAlias = (item: AppHost) => {
  const alias = item.alias
    ? item.alias.split('\n').filter((n) => {
        return n && n.length > 0
      })
    : []
  const arr = Array.from(new Set(alias)).sort()
  arr.unshift(item.name)
  return arr
}

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
    console.log('binPath: ', binPath)
    binPath = realpathSync(binPath)
    if (!existsSync(binPath)) {
      return false
    }
    if (!statSync(binPath).isFile()) {
      return false
    }
    console.log('binPath realpathSync: ', binPath)
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

export const versionBinVersion = (
  bin: string,
  command: string,
  reg: RegExp
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
    try {
      const res = await execPromise(command, {
        cwd: dirname(bin)
      })
      console.log('versionBinVersion: ', command, reg, res)
      handleThen(res)
    } catch (e) {
      console.log('versionBinVersion err: ', e)
      handleCatch(e)
    }
  })
}

export const versionDirCache: Record<string, string[]> = {}

export const versionLocalFetch = async (
  customDirs: string[],
  binName: string
): Promise<Array<SoftInstalled>> => {
  const installed: Set<string> = new Set()

  const findInstalled = async (dir: string, depth = 0, maxDepth = 2) => {
    if (!existsSync(dir)) {
      return
    }
    dir = realpathSync(dir)
    let binPath = versionCheckBin(join(dir, `${binName}`))
    if (binPath) {
      installed.add(binPath)
      return
    }
    binPath = versionCheckBin(join(dir, `bin/${binName}`))
    if (binPath) {
      installed.add(binPath)
      return
    }
    binPath = versionCheckBin(join(dir, `sbin/${binName}`))
    if (binPath) {
      installed.add(binPath)
      return
    }
    if (depth >= maxDepth) {
      return false
    }
    const sub = versionDirCache?.[dir] ?? (await getSubDirAsync(dir))
    if (!versionDirCache?.[dir]) {
      versionDirCache[dir] = sub
    }
    for (const s of sub) {
      await findInstalled(s, depth + 1, maxDepth)
    }
    return
  }

  const base = global.Server.AppDir!
  const subDir = versionDirCache?.[base] ?? (await getSubDirAsync(base))
  if (!versionDirCache?.[base]) {
    versionDirCache[base] = subDir
  }
  for (const f of subDir) {
    await findInstalled(f)
  }

  for (const s of customDirs) {
    await findInstalled(s, 0, 1)
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
      path: `${path}`,
      run: false,
      running: false
    }
    if (!list.find((f) => f.path === item.path && f.bin === item.bin)) {
      list.push(item as any)
    }
  }
  return list
}

export const versionInitedApp = async (type: string, bin: string) => {
  const versions: SoftInstalled[] = []
  const zipDir = join(global.Server.Static!, 'zip')
  const allZip = versionDirCache?.[zipDir] ?? (await getAllFileAsync(zipDir, false))
  if (!versionDirCache?.[zipDir]) {
    versionDirCache[zipDir] = allZip
  }
  const varr = allZip
    .filter((z) => z.startsWith(`${type}-`) && z.endsWith('.7z'))
    .map((z) => z.replace(`${type}-`, '').replace('.7z', ''))
  varr.forEach((v) => {
    const num = Number(v.split('.').slice(0, 2).join(''))
    versions.push({
      version: v,
      bin: join(global.Server.AppDir!, `${type}-${v}`, bin),
      path: join(global.Server.AppDir!, `${type}-${v}`),
      num: num,
      enable: true,
      error: undefined,
      run: false,
      running: false,
      isLocal7Z: true,
      typeFlag: type as any
    })
  })
  return versions
}

export const AppLog = (type: 'info' | 'error', msg: string) => {
  const time = new Date().getTime()
  return `[${type}]${time}:${msg}`
}

export const fetchRawPATH = (): ForkPromise<string[]> => {
  return new ForkPromise(async (resolve, reject) => {
    const sh = join(global.Server.Static!, 'sh/path-get.ps1')
    const copySh = join(global.Server.Cache!, 'path-get.ps1')
    if (existsSync(copySh)) {
      await remove(copySh)
    }
    await copyFile(sh, copySh)
    process.chdir(global.Server.Cache!)
    let res: any
    try {
      res = await spawnPromise(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          `"Unblock-File -LiteralPath './path-get.ps1'; & './path-get.ps1'"`
        ],
        {
          shell: 'powershell.exe',
          cwd: global.Server.Cache!
        }
      )
    } catch (e) {
      await appendFile(join(global.Server.BaseDir!, 'debug.log'), `[_fetchRawPATH][error]: ${e}\n`)
      return reject(e)
    }

    let str = ''
    const stdout = res.trim()
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
  process.chdir(global.Server.Cache!)
  try {
    await execPromise(
      `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Unblock-File -LiteralPath '${copySh}'; & '${copySh}'"`
    )
  } catch (e) {
    console.log('writePath error: ', e)
    await appendFile(join(global.Server.BaseDir!, 'debug.log'), `[writePath][error]: ${e}\n`)
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

/**
 * move dir's file and sub dir to other dir
 * @param src
 * @param dest
 */
export async function moveDirToDir(src: string, dest: string) {
  // 读取源目录
  const entries = await readdir(src, { withFileTypes: true })

  for (const entry of entries) {
    const srcPath = join(src, entry.name)
    const destPath = join(dest, entry.name)

    if (entry.isDirectory()) {
      await mkdirp(destPath)
      // 递归移动子文件夹
      await moveDirToDir(srcPath, destPath)
    } else {
      // 移动文件
      await rename(srcPath, destPath)
    }
  }
}

export async function moveChildDirToParent(dir: string) {
  const sub = await readdir(dir)
  for (const s of sub) {
    const sdir = join(dir, s)
    await moveDirToDir(sdir, dir)
    await remove(sdir)
  }
}

export function fetchPathByBin(bin: string) {
  let path = dirname(bin)
  const paths = bin.split(`\\`)
  let isBin = paths.pop()
  while (isBin) {
    if (['bin', 'sbin'].includes(isBin)) {
      path = paths.join(`\\`)
      isBin = undefined
      break
    }
    isBin = paths.pop()
  }
  return path
}

const NTFS: Record<string, boolean> = {}

export async function isNTFS(fileOrDirPath: string) {
  const driveLetter = parse(fileOrDirPath).root.replace(/[:\\]/g, '')
  if (NTFS?.[driveLetter] !== undefined) {
    return NTFS[driveLetter]
  }
  try {
    const jsonResult =
      (
        await execPromise(
          `powershell -command "Get-Volume -DriveLetter ${driveLetter} | ConvertTo-Json"`,
          { encoding: 'utf-8' }
        )
      )?.stdout ?? ''
    const { FileSystem, FileSystemType } = JSON.parse(jsonResult)
    const is = FileSystem === 'NTFS' || FileSystemType === 'NTFS'
    NTFS[driveLetter] = is
    return is
  } catch {
    return false
  }
}

export async function readFileAsUTF8(filePath: string): Promise<string> {
  try {
    const buffer: Buffer = await readFile(filePath)
    if (buffer?.length === 0 || buffer?.byteLength === 0) {
      return ''
    }
    const detectedEncoding = chardet.detect(buffer)
    console.log('detectedEncoding: ', detectedEncoding)
    if (
      !detectedEncoding ||
      detectedEncoding.toLowerCase() === 'utf-8' ||
      detectedEncoding.toLowerCase() === 'utf8'
    ) {
      return buffer.toString('utf-8')
    }

    if (typeof detectedEncoding === 'string') {
      let str = ''
      try {
        str = iconv.decode(buffer, detectedEncoding)
      } catch {}
      return str
    }

    try {
      return iconv.decode(buffer, detectedEncoding)
    } catch (conversionError: any) {
      console.error(
        `Error converting from ${detectedEncoding} to UTF-8 for file: ${filePath}`,
        conversionError
      )
      return buffer.toString('utf-8')
    }
  } catch {
    return ''
  }
}

export function stringToUTF8(str: string): string {
  try {
    const buffer: Buffer = Buffer.from(str)
    if (buffer?.length === 0 || buffer?.byteLength === 0) {
      return ''
    }
    const detectedEncoding = chardet.detect(buffer)
    console.log('detectedEncoding: ', detectedEncoding)
    if (
      !detectedEncoding ||
      detectedEncoding.toLowerCase() === 'utf-8' ||
      detectedEncoding.toLowerCase() === 'utf8'
    ) {
      return buffer.toString('utf-8')
    }

    if (typeof detectedEncoding === 'string') {
      let str = ''
      try {
        str = iconv.decode(buffer, detectedEncoding)
      } catch {}
      return str
    }

    try {
      return iconv.decode(buffer, detectedEncoding)
    } catch (conversionError: any) {
      console.error(
        `Error converting from ${detectedEncoding} to UTF-8 for str: ${str}`,
        conversionError
      )
      return buffer.toString('utf-8')
    }
  } catch {
    return ''
  }
}

export async function setDir777ToCurrentUser(folderPath: string) {
  if (!existsSync(folderPath)) {
    return
  }
  const username = userInfo().username
  const domain = hostname()
  const identity = `"${domain}\\${username}"`

  const args = [
    `"${normalize(folderPath)}"`,
    '/grant',
    `${identity}:(F)`, // 注意这里不再额外加引号
    '/t',
    '/c',
    '/q'
  ]

  console.log(`Executing: icacls ${args.join(' ')}`)
  await appendFile(
    join(global.Server.BaseDir!, 'debug.log'),
    `[setDir777ToCurrentUser][args]: icacls ${args.join(' ')}\n`
  )
  try {
    await spawnPromise('icacls', args, {
      shell: true,
      windowsHide: true
    })
  } catch (e) {
    await appendFile(
      join(global.Server.BaseDir!, 'debug.log'),
      `[setDir777ToCurrentUser][error]: ${e}\n`
    )
  }
}
