import { fixEnv, uuid } from './utils'
import { merge } from 'lodash'
import { ForkPromise } from '@shared/ForkPromise'

const { spawn } = require('child_process')
const { join } = require('path')
const { existsSync, remove, writeFile } = require('fs-extra')

export function execPromiseRoot(
  params: string | string[],
  opt?: { [k: string]: any },
  password?: string
): ForkPromise<{
  stdout: string
  stderr: string
}> {
  return new ForkPromise(async (resolve, reject, on) => {
    const stdout: Array<Buffer> = []
    const stderr: Array<Buffer> = []
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
    const child = spawn(
      'sudo',
      args,
      merge(
        {
          env: fixEnv()
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
    const onPassword = (data: Buffer) => {
      const str = data.toString()
      console.log('onPassword str: ', str, str.startsWith('Password:'))
      if (str.startsWith('Password:')) {
        child?.stdin?.write(password ?? global.Server.Password!)
        child?.stdin?.write(`\n`)
        return
      }
      on(str)
    }
    child?.stdout?.on('data', (data: Buffer) => {
      stdout.push(data)
      onPassword(data)
    })
    child?.stderr?.on('data', (err: Buffer) => {
      stderr.push(err)
      onPassword(err)
    })
    child.on('exit', onEnd)
    child.on('close', onEnd)
  })
}

export function execPromiseRootWhenNeed(
  command: string,
  params: string[],
  opt?: { [k: string]: any }
): ForkPromise<{
  stdout: string
  stderr: string
}> {
  return new ForkPromise(async (resolve, reject, on) => {
    const stdout: Array<Buffer> = []
    const stderr: Array<Buffer> = []
    const child = spawn(
      command,
      params,
      merge(
        {
          env: fixEnv()
        },
        opt
      )
    )

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
    const onPassword = (data: Buffer) => {
      const str = data.toString()
      console.log('onPassword str: ', str, str.startsWith('Password:'))
      if (str.includes('Password:')) {
        child?.stdin?.write(global.Server.Password!)
        child?.stdin?.write(`\n`)
        return
      }
      on(str)
    }
    child?.stdout?.on('data', (data: Buffer) => {
      stdout.push(data)
      onPassword(data)
    })
    child?.stderr?.on('data', (err: Buffer) => {
      stderr.push(err)
      onPassword(err)
    })
    child.on('exit', onEnd)
    child.on('close', onEnd)
  })
}
