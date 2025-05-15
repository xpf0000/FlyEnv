import { type ChildProcess, spawn } from 'child_process'
import { merge } from 'lodash'
import { createWriteStream, existsSync, mkdirSync, readdirSync, realpathSync, statSync } from 'fs'
import path, { basename, dirname, join } from 'path'
import { ForkPromise } from '@shared/ForkPromise'
import crypto from 'crypto'
import axios from 'axios'
import { mkdirp, readdir, readFile, remove, writeFile } from 'fs-extra'
import type { AppHost, SoftInstalled } from '@shared/app'
import { compareVersions } from 'compare-versions'
import { execPromise, execPromiseRoot } from './util/Exec'
import Helper from './Helper'
import { I18nT } from '@lang/index'
import { format } from 'date-fns'
import EnvSync from './util/EnvSync'

export { execPromise, execPromiseRoot }

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

export const AppLog = (type: 'info' | 'error' | 'debug', msg: string) => {
  const time = format(new Date(), 'yyyy/MM/dd HH:mm:ss')
  return `[${time}] [${type}] : ${msg}`
}

export const AppLogSend = (type: 'info' | 'error' | 'debug', msg: string) => {
  ProcessSendLog('APP-On-Log', AppLog(type, msg))
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

export function spawnPromise(
  cammand: string,
  params: Array<any>,
  opt?: { [k: string]: any }
): ForkPromise<any> {
  return new ForkPromise(async (resolve, reject, on) => {
    const stdout: Array<Uint8Array> = []
    const stderr: Array<Uint8Array> = []
    const env = await EnvSync.sync()
    let child: ChildProcess
    try {
      child = spawn(
        cammand,
        params,
        merge(
          {
            env
          },
          opt
        )
      )
    } catch (e) {
      reject(e)
      return
    }
    const stdinFn = (txt: string) => {
      child?.stdin?.write(`${txt}\n`)
    }
    let exit = false
    const onEnd = (code: number | null) => {
      if (exit) return
      exit = true
      console.log('onEnd code: ', code)
      if (!code) {
        resolve(Buffer.concat(stdout).toString().trim())
      } else {
        reject(new Error(Buffer.concat(stderr).toString().trim()))
      }
    }
    child?.stdout?.on('data', (data) => {
      stdout.push(data)
      on(data.toString(), stdinFn)
    })
    child?.stderr?.on('data', (err) => {
      stderr.push(err)
      on(err.toString(), stdinFn)
    })
    child.on('exit', onEnd)
    child.on('close', onEnd)
  })
}

export async function spawnPromiseMore(
  cammand: string,
  params: Array<any>,
  opt?: { [k: string]: any }
): Promise<{
  promise: ForkPromise<any>
  spawn: ChildProcess
}> {
  const stdout: Array<Uint8Array> = []
  const stderr: Array<Uint8Array> = []
  const env = await EnvSync.sync()
  const child = spawn(
    cammand,
    params,
    merge(
      {
        env
      },
      opt
    )
  )
  const stdinFn = (txt: string) => {
    child?.stdin?.write(`${txt}\n`)
  }
  const promise = new ForkPromise((resolve, reject, on) => {
    let exit = false
    const onEnd = (code: number | null) => {
      if (exit) return
      exit = true
      if (!code) {
        resolve(Buffer.concat(stdout).toString().trim())
      } else {
        reject(new Error(Buffer.concat(stderr).toString().trim()))
      }
    }
    child.stdout.on('data', (data) => {
      stdout.push(data)
      on(data.toString(), stdinFn)
    })
    child.stderr.on('data', (err) => {
      stderr.push(err)
      on(err.toString(), stdinFn)
    })
    child.on('exit', onEnd)
    child.on('close', onEnd)
  })
  return {
    promise,
    spawn: child
  }
}

export function createFolder(fp: string) {
  fp = fp.replace(/\\/g, '/')
  if (existsSync(fp)) {
    return true
  }
  const arr = fp.split('/')
  let dir = '/'
  for (const p of arr) {
    dir = join(dir, p)
    if (!existsSync(dir)) {
      mkdirSync(dir)
    }
  }
  return existsSync(fp)
}

export function md5(str: string) {
  const md5 = crypto.createHash('md5')
  return md5.update(str).digest('hex')
}

export function getAllFile(fp: string, fullpath = true, basePath: Array<string> = []) {
  let arr: Array<string> = []
  if (!existsSync(fp)) {
    return arr
  }
  const state = statSync(fp)
  if (state.isFile()) {
    return [fp]
  }
  const files = readdirSync(fp)
  files.forEach(function (item) {
    const base = [...basePath]
    base.push(item)
    const fPath = join(fp, item)
    if (existsSync(fPath)) {
      const stat = statSync(fPath)
      if (stat.isDirectory()) {
        const sub = getAllFile(fPath, fullpath, base)
        arr = arr.concat(sub)
      }
      if (stat.isFile()) {
        arr.push(fullpath ? fPath : base.join('/'))
      }
    }
  })
  return arr
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
      } catch (e) {
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
      .then(function (response) {
        const base = dirname(savepath)
        createFolder(base)
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
    } catch (e) {}
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
    const childPath = path.join(dirPath, file.name)
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
    const childPath = path.join(dirPath, file.name)
    if (!existsSync(childPath)) {
      continue
    }
    if (
      file.isDirectory() ||
      (file.isSymbolicLink() && statSync(realpathSync(childPath)).isDirectory())
    ) {
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

export const systemProxyGet = async () => {
  const proxy: any = {}
  const services = ['Wi-Fi', 'Ethernet']
  try {
    for (const service of services) {
      let res = await execPromise(`networksetup -getwebproxy ${service}`)
      let result = res?.stdout?.match(
        /(?:Enabled:\s)(\w+)\n(?:Server:\s)([^\n]+)\n(?:Port:\s)(\d+)/
      )
      if (result) {
        const [_, enabled, server, port] = result
        console.log(_)
        if (enabled === 'Yes') {
          proxy['http_proxy'] = `http://${server}:${port}`
        }
      }

      res = await execPromise(`networksetup -getsecurewebproxy ${service}`)
      result = res?.stdout?.match(/(?:Enabled:\s)(\w+)\n(?:Server:\s)([^\n]+)\n(?:Port:\s)(\d+)/)
      if (result) {
        const [_, enabled, server, port] = result
        console.log(_)
        if (enabled === 'Yes') {
          proxy['https_proxy'] = `http://${server}:${port}`
        }
      }

      res = await execPromise(`networksetup -getsocksfirewallproxy ${service}`)
      result = res?.stdout?.match(/(?:Enabled:\s)(\w+)\n(?:Server:\s)([^\n]+)\n(?:Port:\s)(\d+)/)
      if (result) {
        const [_, enabled, server, port] = result
        console.log(_)
        if (enabled === 'Yes') {
          proxy['all_proxy'] = `http://${server}:${port}`
        }
      }
    }
  } catch (e) {}
  console.log('systemProxyGet: ', proxy)
  return proxy
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
  console.log('versionCheckBin: ', binPath)
  if (existsSync(binPath)) {
    console.log('binPath: ', binPath)
    binPath = realpathSync(binPath)
    if (!existsSync(binPath)) {
      return false
    }
    const stat = statSync(binPath)
    console.log('stat: ', stat.isFile(), stat.isDirectory(), stat.isSymbolicLink())
    if (!stat.isFile()) {
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
      const str = res.stdout + res.stderr
      let version: string | undefined = ''
      try {
        version = reg?.exec(str)?.[2]?.trim()
        reg!.lastIndex = 0
      } catch (e) {}
      resolve({
        version
      })
    }
    try {
      const res = await execPromise(command)
      console.log('versionBinVersion: ', command, {
        stdout: res.stdout,
        stderr: res.stderr
      })
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
  binName: string,
  searchName: string
): Promise<Array<SoftInstalled>> => {
  const installed: Set<string> = new Set()
  const systemDirs = ['/', '/opt', '/usr', global.Server.AppDir!, ...customDirs]

  const realDirDict: { [k: string]: string } = {}
  const findInstalled = async (dir: string, depth = 0, maxDepth = 2) => {
    if (!existsSync(dir)) {
      return
    }
    dir = realpathSync(dir)
    console.log('findInstalled dir: ', dir)
    let binPath = versionCheckBin(join(dir, `${binName}`))
    console.log('binPath 0: ', binPath)
    if (binPath) {
      realDirDict[binPath] = join(dir, `${binName}`)
      installed.add(binPath)
      return
    }
    binPath = versionCheckBin(join(dir, `bin/${binName}`))
    console.log('binPath 1: ', binPath)
    if (binPath) {
      realDirDict[binPath] = join(dir, `bin/${binName}`)
      installed.add(binPath)
      return
    }
    binPath = versionCheckBin(join(dir, `sbin/${binName}`))
    console.log('binPath 2: ', binPath)
    if (binPath) {
      realDirDict[binPath] = join(dir, `sbin/${binName}`)
      installed.add(binPath)
      return
    }
    if (depth >= maxDepth) {
      return
    }
    const sub = versionDirCache?.[dir] ?? (await getSubDirAsync(dir))
    if (!versionDirCache?.[dir]) {
      versionDirCache[dir] = sub
    }
    console.log('sub: ', sub)
    for (const s of sub) {
      await findInstalled(s, depth + 1, maxDepth)
    }
  }

  for (const s of systemDirs) {
    await findInstalled(s, 0, 1)
  }

  const base = ['/usr/local/Cellar', '/opt/homebrew/Cellar']
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
        await findInstalled(s)
      }
    }
  }
  const count = installed.size
  if (count === 0) {
    return []
  }

  const list: Array<SoftInstalled> = []
  const installedList: Array<string> = Array.from(installed)
  for (const i of installedList) {
    let path = i
    if (path.includes('/sbin/') || path.includes('/bin/')) {
      path = path
        .replace(`/sbin/`, '/##SPLIT##/')
        .replace(`/bin/`, '/##SPLIT##/')
        .split('/##SPLIT##/')
        .shift()!
    } else {
      path = dirname(path)
    }
    const item = {
      bin: i,
      path: `${path}/`,
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
      let path = bin
      if (bin.includes('/sbin/') || bin.includes('/bin/')) {
        path = path
          .replace(`/sbin/`, '/##SPLIT##/')
          .replace(`/bin/`, '/##SPLIT##/')
          .split('/##SPLIT##/')
          .shift()!
      } else {
        path = dirname(path)
      }
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
  const info: any = {}
  const cammand = ['brew', 'info', ...names, '--json', '--formula'].join(' ')
  console.log('brewinfo doRun: ', cammand)
  try {
    const res = await execPromise(cammand, {
      env: {
        HOMEBREW_NO_INSTALL_FROM_API: 1
      }
    })
    const arr = JSON.parse(res.stdout)
    arr.forEach((item: any) => {
      info[item.full_name] = {
        version: item?.versions?.stable ?? '',
        installed: item?.installed?.length > 0,
        name: item.full_name,
        flag: 'brew'
      }
    })
  } catch (e) {}
  return info
}

export const brewSearch = async (
  all: string[],
  cammand: string,
  handleContent?: (content: string) => string
) => {
  try {
    const res = await execPromise(cammand, {
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
  const Info: { [k: string]: any } = {}
  try {
    let arr = []
    const info = await spawnPromise('port', ['search', '--name', '--line', '--regex', reg])
    arr = info
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
    arr.forEach((item: any) => {
      Info[item.name] = item
    })
  } catch (e) {}
  return Info
}

export const writeFileByRoot = async (file: string, content: string) => {
  try {
    await Helper.send('tools', 'writeFileByRoot', file, content)
  } catch (e) {
    throw e
  }
  return true
}

export const readFileByRoot = async (file: string): Promise<string> => {
  try {
    return (await Helper.send('tools', 'readFileByRoot', file)) as any
  } catch (e) {
    throw e
  }
}

export async function waitPidFile(
  pidFile: string,
  time = 0,
  maxTime = 20,
  timeToWait = 500
): Promise<
  | {
      pid?: string
      error?: string
    }
  | false
> {
  let res:
    | {
        pid?: string
        error?: string
      }
    | false = false
  if (existsSync(pidFile)) {
    const pid = (await readFile(pidFile, 'utf-8')).trim()
    return {
      pid
    }
  } else {
    if (time < maxTime) {
      await waitTime(timeToWait)
      res = res || (await waitPidFile(pidFile, time + 1, maxTime, timeToWait))
    } else {
      res = false
    }
  }
  console.log('waitPid: ', time, res)
  return res
}

export async function serviceStartExec(
  version: SoftInstalled,
  pidPath: string,
  baseDir: string,
  bin: string,
  execArgs: string,
  execEnv: string,
  on: Function,
  maxTime = 20,
  timeToWait = 500,
  checkPidFile = true
): Promise<{ 'APP-Service-Start-PID': string }> {
  if (pidPath && existsSync(pidPath)) {
    try {
      await remove(pidPath)
    } catch (e) {}
  }
  await mkdirp(baseDir)
  const outFile = join(baseDir, `start.${version.version}.out.log`)
  const errFile = join(baseDir, `start.${version.version}.error.log`)

  let psScript = await readFile(join(global.Server.Static!, 'sh/flyenv-async-exec.sh'), 'utf8')

  psScript = psScript
    .replace('#ENV#', execEnv)
    .replace('#CWD#', dirname(bin))
    .replace('#BIN#', basename(bin))
    .replace('#ARGS#', execArgs)
    .replace('#OUTLOG#', outFile)
    .replace('#ERRLOG#', errFile)

  const psName = `start-${version.version!.trim()}.sh`.split(' ').join('')
  const psPath = join(baseDir, psName)
  await writeFile(psPath, psScript)

  on({
    'APP-On-Log': AppLog('info', I18nT('appLog.execStartCommand'))
  })

  process.chdir(baseDir)
  let res: any
  let error: any
  try {
    res = await spawnPromise('zsh', [psName], {
      cwd: baseDir
    })
  } catch (e) {
    error = e
  }

  on({
    'APP-On-Log': AppLog('info', I18nT('appLog.execStartCommandSuccess'))
  })
  on({
    'APP-Service-Start-Success': true
  })

  if (!checkPidFile) {
    let pid = ''
    const stdout = res.trim()
    const regex = /FlyEnv-Process-ID(.*?)FlyEnv-Process-ID/g
    const match = regex.exec(stdout)
    if (match) {
      pid = match[1]
    }
    await writeFile(pidPath, pid)
    on({
      'APP-On-Log': AppLog('info', I18nT('appLog.startServiceSuccess', { pid: pid }))
    })
    return {
      'APP-Service-Start-PID': pid
    }
  }

  res = await waitPidFile(pidPath, 0, maxTime, timeToWait)
  if (res) {
    if (res?.pid) {
      await writeFile(pidPath, res.pid)
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.startServiceSuccess', { pid: res.pid }))
      })
      return {
        'APP-Service-Start-PID': res.pid
      }
    }
    on({
      'APP-On-Log': AppLog(
        'error',
        I18nT('appLog.startServiceFail', {
          error: res?.error ?? 'Start Fail',
          service: `${version.typeFlag}-${version.version}`
        })
      )
    })
    throw new Error(res?.error ?? 'Start Fail')
  }
  let msg = 'Start Fail'
  if (existsSync(errFile)) {
    msg = (await readFile(errFile, 'utf-8')) || `${error?.toString() ?? ''}` || 'Start Fail'
  }
  on({
    'APP-On-Log': AppLog(
      'error',
      I18nT('appLog.startServiceFail', {
        error: msg,
        service: `${version.typeFlag}-${version.version}`
      })
    )
  })
  throw new Error(msg)
}
