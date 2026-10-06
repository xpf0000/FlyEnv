import {
  assertGenericUnixFileWrite,
  isSystemHostsPath,
  readUnixHosts
} from './module/Host/UnixHosts'
import type { FSWatcher } from 'node:fs'
import { createWriteStream, realpathSync } from 'node:fs'
import { dirname, join, normalize } from 'path'
import { ForkPromise } from '@shared/ForkPromise'
import crypto from 'crypto'
import axios from 'axios'
import type { AppHost } from '@shared/app'
import { compareVersions } from '@shared/compare-versions'
import Helper from './Helper'
import { format } from 'date-fns'
import { hostname, userInfo } from 'os'
import { machineId } from '@shared/machineId'
import { zipUnpack } from './util/Zip'
import { getAllFileAsync, getSubDirAsync, moveChildDirToParent, moveDirToDir } from './util/Dir'
import { customerServiceStartExec, serviceStartExec } from './util/ServiceStart'
import {
  customerServiceStartExec as customerServiceStartExecWin,
  readFileAsUTF8,
  serviceStartExecCMD
} from './util/ServiceStart.win'
import {
  execPromise,
  execPromiseSudo,
  execPromiseWithEnv,
  spawnPromise,
  spawnPromiseWithEnv,
  spawnPromiseWithStdin
} from '@shared/child-process'
import {
  brewInfoJson,
  brewSearch,
  portSearch,
  versionBinVersion,
  versionBinVersionSync,
  versionCheckBin,
  versionDirCache,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionMacportsFetch,
  versionSort
} from './util/Version'
import {
  appendFile,
  chmod,
  copy,
  copyFile,
  existsSync,
  mkdirp,
  readdir,
  readFile,
  realpath,
  remove,
  rename,
  stat,
  unlink,
  watch,
  writeFile
} from '@shared/fs-extra'
import { addPath, fetchRawPATH, handleWinPathArr, writePath } from './util/PATH.win'
import { isWindows, waitTime } from '@shared/utils'
import { splitHostAliases } from '@shared/siteRuntime'
import { timeOperation } from '@shared/OperationTiming'
import { probeWindowsNTFS } from '@shared/WindowsVolume'
// 本地 AppLogSend 只用进度发送器；原公开发送方法仍重导出，兼容模块和插件。
import { ProcessSendLog } from './ProcessSend'
export { ProcessSendSuccess, ProcessSendError, ProcessSendLog } from './ProcessSend'

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

export {
  machineId,
  zipUnpack,
  moveDirToDir,
  getSubDirAsync,
  getAllFileAsync,
  moveChildDirToParent,
  serviceStartExec,
  customerServiceStartExec,
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
  const alias = splitHostAliases(item.alias)
  return Array.from(new Set([item.name, ...alias])).sort()
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

const validateHelperPath = (path: string): boolean => {
  if (!path) return false
  if (!path.includes('/') && !path.includes('\\')) return true
  const parts = path.replace(/\\/g, '/').split('/')
  if (parts.some((p) => p === '..')) return false
  return true
}

export const writeFileByRoot = async (file: string, content: string) => {
  if (!isWindows()) {
    assertGenericUnixFileWrite(file)
    await writeFile(file, content)
    return true
  }
  if (!validateHelperPath(file)) {
    throw new Error(`Path traversal detected: ${file}`)
  }
  try {
    // 标记外层首次 Node 写入，与统一权限入口的普通权限重试分别统计。
    await timeOperation('file.initial-node-write', () => writeFile(file, content))
    return true
  } catch (e) {
    console.error('writeFileByRoot writeFile error: ', e)
  }
  await Helper.send('tools', 'writeFileByRoot', file, content)
  return true
}

export const readFileByRoot = async (file: string): Promise<string> => {
  if (!isWindows())
    return isSystemHostsPath(file) ? (await readUnixHosts()).content : readFile(file, 'utf8')
  if (!validateHelperPath(file)) {
    throw new Error(`Path traversal detected: ${file}`)
  }
  try {
    return await readFile(file, 'utf-8')
  } catch {}
  return (await Helper.send('tools', 'readFileByRoot', file)) as any
}

export const removeByRoot = async (file: string): Promise<void> => {
  if (!isWindows()) {
    await remove(file)
    return
  }
  if (!validateHelperPath(file)) {
    throw new Error(`Path traversal detected: ${file}`)
  }
  try {
    await remove(file)
    return
  } catch {}
  try {
    await Helper.send('tools', 'rm', file)
  } catch (error) {
    // Windows 取消/拒绝属于删除操作的失败终态，必须交给调用方恢复状态和允许重试。
    if (isWindows()) throw error
  }
  return
}

export const binXattrFix = async (bin: string) => {
  if (!existsSync(bin)) {
    return
  }
  const command = `xattr -dr "com.apple.quarantine" "${bin}"`
  await execPromiseWithEnv(command)
}

/**
 * 等待本次启动产生 PID，文件创建与写入可能是两个步骤，暂时空文件不能立即
 * 判定启动失败，否则已经创建的服务不会登记、后续退出也无法停止它。空 PID
 * 在原预算内重试；读取失败保留原失败语义，不反复发起权限请求。错误日志仅
 * 等待文件出现，允许空内容，调用点用 retryEmpty=false 避免额外启动延迟。
 */
export async function waitPidFile(
  pidFile: string,
  time = 0,
  maxTime = 20,
  timeToWait = 500,
  retryEmpty = true
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
      pid = (await readFileByRoot(pidFile)).trim()
    } catch {
      error = true
    }
    if (!error && !pid && retryEmpty && time < maxTime) {
      await waitTime(timeToWait)
      return waitPidFile(pidFile, time + 1, maxTime, timeToWait, retryEmpty)
    }
    if (error || !pid) {
      return false
    }
    return {
      pid
    }
  } else {
    if (time < maxTime) {
      await waitTime(timeToWait)
      res = res || (await waitPidFile(pidFile, time + 1, maxTime, timeToWait, retryEmpty))
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

/** 单路径调用保持兼容，复用有期限的批量卷格式缓存，不再加载 Get-Volume。 */
export async function isNTFS(fileOrDirPath: string) {
  return (await probeWindowsNTFS([fileOrDirPath]))[0]
}

export const versionCompare = compareVersions
