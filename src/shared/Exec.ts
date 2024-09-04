import { fixEnv, uuid } from './utils'
import { merge } from 'lodash'

const { spawn } = require('child_process')
const { join } = require('path')
const { existsSync, remove, writeFile } = require('fs-extra')

export function execPromiseRoot(
  params: string | string[],
  opt?: { [k: string]: any },
  password?: string
): Promise<{
  stdout: string
  stderr: string
}> {
  return new Promise(async (resolve, reject) => {
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
      }
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
