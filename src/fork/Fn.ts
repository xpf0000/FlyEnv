import { createWriteStream, realpathSync } from 'node:fs'
import type { FSWatcher } from 'node:fs'
import { dirname, join, normalize } from 'path'
import { ForkPromise } from '@shared/ForkPromise'
import crypto from 'crypto'
import axios from 'axios'
import type { AppHost } from '@shared/app'
import Helper from './Helper'
import { format } from 'date-fns'
import { hostname, userInfo } from 'os'
import _node_machine_id from 'node-machine-id'
import { zipUnPack } from './util/Zip'
import { moveDirToDir, getSubDirAsync, getAllFileAsync, moveChildDirToParent } from './util/Dir'
import { serviceStartExec, customerServiceStartExec } from './util/ServiceStart'
import {
  serviceStartExec as serviceStartExecWin,
  serviceStartExecCMD,
  serviceStartExecGetPID,
  readFileAsUTF8
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

import { versionLocalFetchWin, versionInitedApp } from './util/Version.win'

export {
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
  versionSort,
  versionLocalFetchWin,
  versionInitedApp
}

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
  rename
} from '@shared/fs-extra'

const { machineId } = _node_machine_id

export {
  machineId,
  zipUnPack,
  moveDirToDir,
  getSubDirAsync,
  getAllFileAsync,
  moveChildDirToParent,
  serviceStartExec,
  customerServiceStartExec,
  serviceStartExecWin,
  serviceStartExecCMD,
  serviceStartExecGetPID,
  readFileAsUTF8
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
  rename
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

export function waitTime(time: number) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(true)
    }, time)
  })
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
