import { createWriteStream, realpathSync } from 'node:fs'
import type { FSWatcher } from 'node:fs'
import { dirname, join, normalize, parse } from 'path'
import { ForkPromise } from '@shared/ForkPromise'
import crypto from 'crypto'
import axios from 'axios'
import type { AppHost } from '@shared/app'
import Helper from './Helper'
import { format } from 'date-fns'
import { hostname, userInfo } from 'os'
import _node_machine_id from 'node-machine-id'
import { zipUnpack } from './util/Zip'
import { moveDirToDir, getSubDirAsync, getAllFileAsync, moveChildDirToParent } from './util/Dir'
import { serviceStartExec, customerServiceStartExec } from './util/ServiceStart'
import {
  serviceStartExec as serviceStartExecWin,
  serviceStartExecCMD,
  readFileAsUTF8,
  customerServiceStartExec as customerServiceStartExecWin
} from './util/ServiceStart.win'
import {
  execPromise,
  execPromiseSudo,
  execPromiseWithEnv,
  spawnPromiseWithEnv,
  spawnPromise,
  spawnPromiseWithStdin
} from '@shared/child-process'
import {
  versionBinVersionSync,
  versionBinVersion,
  versionCheckBin,
  brewInfoJson,
  brewSearch,
  portSearch,
  versionFixed,
  versionDirCache,
  versionFilterSame,
  versionLocalFetch,
  versionMacportsFetch,
  versionSort
} from './util/Version'
import {
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
  appendFile,
  rename,
  stat
} from '@shared/fs-extra'
import { addPath, fetchRawPATH, handleWinPathArr, writePath } from './util/PATH.win'
import { isWindows, waitTime } from '@shared/utils'

export { waitTime, addPath, fetchRawPATH, handleWinPathArr, writePath }

export {
  versionBinVersionSync,
  versionBinVersion,
  versionCheckBin,
  brewInfoJson,
  brewSearch,
  portSearch,
  versionFixed,
  versionDirCache,
  versionFilterSame,
  versionLocalFetch,
  versionMacportsFetch,
  versionSort
}

const { machineId } = _node_machine_id

export {
  machineId,
  zipUnpack,
  moveDirToDir,
  getSubDirAsync,
  getAllFileAsync,
  moveChildDirToParent,
  serviceStartExec,
  customerServiceStartExec,
  serviceStartExecWin,
  serviceStartExecCMD,
  readFileAsUTF8,
  customerServiceStartExecWin
}

export {
  createWriteStream,
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
  appendFile,
  rename,
  stat
}

export {
  execPromise,
  execPromiseSudo,
  execPromiseWithEnv,
  spawnPromiseWithEnv,
  spawnPromise,
  spawnPromiseWithStdin
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

export async function setDir777ToCurrentUser(folderPath: string) {
  if (!existsSync(folderPath)) {
    return
  }
  const username = userInfo().username
  const domain = hostname()
  const identity = `"${domain}\\${username}"`

  const args = [`"${normalize(folderPath)}"`, '/grant', `${identity}:(F)`, '/t', '/c', '/q']

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

export function md5(str: string) {
  const md5 = crypto.createHash('md5')
  return md5.update(str).digest('hex')
}

export function downloadFile(url: string, savepath: string) {
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
  } catch {
    /* empty */
  }
  console.log('systemProxyGet: ', proxy)
  return proxy
}

export const writeFileByRoot = async (file: string, content: string) => {
  await Helper.send('tools', 'writeFileByRoot', file, content)
  return true
}

export const readFileByRoot = async (file: string): Promise<string> => {
  return (await Helper.send('tools', 'readFileByRoot', file)) as any
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
    let pid = ''
    let error = false
    try {
      pid = (await readFile(pidFile, 'utf-8')).trim()
    } catch {
      error = true
    }
    if (error) {
      try {
        pid = ((await Helper.send('tools', 'readFileByRoot', pidFile)) as string).trim()
      } catch {}
    }
    if (!pid) {
      return false
    }
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

export function fetchPathByBin(bin: string) {
  let path = dirname(bin)
  const spliteKey = isWindows() ? '\\' : '/'
  const paths = bin.split(spliteKey)
  let isBin = paths.pop()
  while (isBin) {
    if (['bin', 'sbin'].includes(isBin)) {
      path = paths.join(spliteKey)
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

export const versionCompare = (a: string, b: string) => {
  if (a === b) {
    return 0
  }
  const aArr = a.split('.')
  const bArr = b.split('.')
  if (!aArr.length || !bArr.length) {
    return 0
  }
  const max = Math.max(aArr.length, bArr.length)
  for (let i = 0; i < max; i++) {
    let aNum = 0
    let bNum = 0
    try {
      aNum = parseInt(aArr?.shift?.() ?? '0')
      aNum = isNaN(aNum) ? 0 : aNum
      bNum = parseInt(bArr?.shift?.() ?? '0')
      bNum = isNaN(bNum) ? 0 : bNum
    } catch {}
    if (aNum > bNum) {
      return 1
    }
    if (aNum < bNum) {
      return -1
    }
  }
  return 0
}
