import { merge } from 'lodash'
import { ForkPromise } from '@shared/ForkPromise'
import { ChildProcess, spawn } from 'child_process'
import { join } from 'path'
import { existsSync, remove, writeFile } from 'fs-extra'
import EnvSync from './EnvSync'
import { uuid } from '../utils'

export function execPromiseRoot(
  params: string | string[],
  opt?: { [k: string]: any },
  password?: string
): ForkPromise<{
  stdout: string
  stderr: string
}> {
  return new ForkPromise(async (resolve, reject, on) => {
    const stdout: Array<Uint8Array> = []
    const stderr: Array<Uint8Array> = []
    const args: string[] = ['-S']
    let shFile = ''
    if (typeof params === 'string') {
      const file = join(global.Server.Cache!, `${uuid()}.sh`)
      const content = `#!/bin/zsh\n${params}`
      await writeFile(file, content)
      shFile = file
      args.push('zsh', file)
    } else {
      args.push(...params)
    }
    console.log('args: ', args)
    const env = await EnvSync.sync()
    const child = spawn(
      'sudo',
      args,
      merge(
        {
          shell: '/bin/zsh',
          env
        },
        opt
      )
    )

    let exit = false
    const onEnd = async (code: number | null) => {
      if (exit) return
      exit = true
      if (shFile && existsSync(shFile)) {
        await remove(shFile)
      }
      if (!code) {
        resolve({
          stdout: Buffer.concat(stdout).toString().trim(),
          stderr: Buffer.concat(stderr).toString().trim()
        })
      } else {
        reject(new Error(Buffer.concat(stderr).toString().trim()))
      }
    }
    const onPassword = (data: Uint8Array) => {
      const str = data.toString()
      if (str.startsWith('Password:')) {
        child?.stdin?.write(password ?? global.Server.Password!)
        child?.stdin?.write(`\n`)
        return
      }
      on(str)
    }
    child?.stdout?.on('data', (data: Uint8Array) => {
      stdout.push(data)
      onPassword(data)
    })
    child?.stderr?.on('data', (err: Uint8Array) => {
      stderr.push(err)
      onPassword(err)
    })
    child.on('exit', onEnd)
    child.on('close', onEnd)
  })
}

export function spawnAsync(
  command: string,
  arg: Array<string> = [],
  options: { [key: string]: any } = {}
): Promise<{
  stdout: string
  stderr: string
}> {
  return new Promise(async (resolve, reject) => {
    const env = await EnvSync.sync()
    const optdefault = {
      shell: '/bin/zsh',
      env
    }
    const opt = merge(optdefault, options)
    let cp: ChildProcess
    try {
      cp = spawn(command, arg, opt)
    } catch (e) {
      reject(e)
      return
    }
    const stdout: Array<Uint8Array> = []
    const stderr: Array<Uint8Array> = []
    cp?.stdout?.on('data', (data: Uint8Array) => {
      stdout.push(data)
    })

    cp?.stderr?.on('data', (data: Uint8Array) => {
      stderr.push(data)
    })

    let exit = false
    const onEnd = async (code: number | null) => {
      if (exit) return
      exit = true
      if (!code) {
        resolve({
          stdout: Buffer.concat(stdout).toString().trim(),
          stderr: Buffer.concat(stderr).toString().trim()
        })
      } else {
        reject(new Error(Buffer.concat(stderr).toString().trim()))
      }
    }

    cp.on('exit', onEnd)
    cp.on('close', onEnd)
  })
}
