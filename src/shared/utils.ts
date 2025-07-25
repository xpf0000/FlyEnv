import crypto from 'node:crypto'
import { merge } from 'lodash-es'
import { spawn, exec } from 'node:child_process'
import { cpus } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { platform } from 'node:os'
import { chmod, copyFile, appendFile } from './fs-extra'

const execPromise = promisify(exec)

export async function appDebugLog(flag: string, info: string) {
  try {
    const debugFile = join(global.Server.BaseDir!, 'debug.log')
    await appendFile(debugFile, `${flag}: ${info}\n`)
  } catch {
    /* empty */
  }
}

let AppEnv: any

export async function fixEnv(): Promise<{ [k: string]: any }> {
  console.log('fixEnv !!!', typeof AppEnv)
  if (AppEnv) {
    return AppEnv
  }
  const file = join(global.Server.Cache!, 'env.sh')
  await copyFile(join(global.Server.Static!, 'sh/env.sh'), file)
  let text = ''
  try {
    await chmod(file, '0777')
    const res = await execPromise(`./env.sh`, {
      cwd: global.Server.Cache!,
      shell: '/bin/zsh'
    })
    text = res.stdout
  } catch (e: any) {
    appDebugLog('[fixEnv][env.sh][error]', e.toString()).then().catch()
  }

  AppEnv = process.env
  text
    .toString()
    .trim()
    .split('\n')
    .forEach((l: string) => {
      const arr = l.split('=')
      const k = arr.shift()
      const v = arr.join('')
      if (k) {
        AppEnv[k] = v
      }
    })
  const PATH = `${AppEnv['PATH']}:/opt:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/Homebrew/bin:/opt/local/bin:/opt/local/sbin:/usr/local/bin:/usr/bin:/usr/sbin`
  AppEnv['PATH'] = Array.from(new Set(PATH.split(':'))).join(':')
  if (global.Server.Proxy) {
    for (const k in global.Server.Proxy) {
      AppEnv[k] = global.Server.Proxy[k]
    }
  }
  return AppEnv
}

export function execAsync(
  command: string,
  arg: Array<string> = [],
  options: { [key: string]: any } = {}
) {
  return new Promise(async (resolve, reject) => {
    const env = await fixEnv()
    const optdefault = {
      env
    }
    const opt = merge(optdefault, options)
    if (global.Server.isArmArch) {
      arg.unshift('-arm64', command)
      command = 'arch'
    }
    const cp = spawn(command, arg, opt)
    const stdout: Array<Uint8Array> = []
    const stderr: Array<Uint8Array> = []
    cp.stdout.on('data', (data: Uint8Array) => {
      stdout.push(data)
    })

    cp.stderr.on('data', (data: Uint8Array) => {
      stderr.push(data)
    })

    cp.on('close', (code: number) => {
      const out = Buffer.concat(stdout)
      const err = Buffer.concat(stderr)
      if (!code) {
        resolve(out.toString().trim())
      } else {
        reject(err.toString().trim())
      }
    })
  })
}

export function waitTime(time: number) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(true)
    }, time)
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

export function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

export function isArmArch() {
  const cpuCore = cpus()
  return cpuCore[0].model.includes('Apple')
}

export function md5(str: string) {
  const md5 = crypto.createHash('md5')
  return md5.update(str).digest('hex')
}

export function pathFixedToUnix(path: string) {
  const needAdd = path.endsWith('\\')
  const p = path
    .split('\\')
    .filter((s) => !!s.trim())
    .join('/')
  return needAdd ? `${p}/` : p
}

const os = platform()

export function isWindows() {
  return os === 'win32'
}

export function isMacOS() {
  return os === 'darwin'
}

export function isLinux() {
  return os === 'linux'
}

export function defaultShell() {
  if (isMacOS()) {
    return '#!/bin/zsh'
  }
  if (isLinux()) {
    return '#!/bin/bash'
  }
  return ''
}
