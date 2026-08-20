import { type ChildProcess, exec, spawn } from 'child_process'
import { promisify } from 'util'
import { mergeProcessOptions } from './process-options'
import EnvSync from './EnvSync'
import { isMacOS, uuid } from '@shared/utils'
import { ForkPromise } from '@shared/ForkPromise'
import { join } from 'path'
import { remove, writeFile, existsSync } from './fs-extra'

export const execPromise = promisify(exec)

type ForkPromiseResType = ForkPromise<{
  stdout: string
  stderr: string
}>

type SpawnPromiseWithEnvTiming = {
  onEnvSync?: (durationMs: number) => void
  onSpawn?: (durationMs: number) => void
  onExit?: (details: {
    code: number | null
    durationMs: number
    stdoutBytes: number
    stderrBytes: number
  }) => void
  onError?: (details: { durationMs: number; error: Error }) => void
}

type SpawnPromiseWithEnvOptions = {
  [key: string]: any
  trimOutput?: boolean
  timing?: SpawnPromiseWithEnvTiming
}

const reportSpawnPromiseWithEnvTiming = (callback: (() => void) | undefined) => {
  try {
    callback?.()
  } catch {}
}

export function execPromiseSudo(
  params: string | string[],
  opt?: { [k: string]: any },
  password?: string
): ForkPromiseResType {
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
      args.push('/bin/zsh', file)
    } else {
      args.push(...params)
    }
    console.log('args: ', args)
    const env = await EnvSync.sync()
    let child: ChildProcess
    try {
      child = spawn(
        'sudo',
        args,
        mergeProcessOptions(
          {
            shell: '/bin/zsh',
            env
          },
          opt
        )
      )
    } catch (e) {
      reject(e)
      return
    }

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
    child?.on('error', (err: Error) => {
      exit = true
      reject(err)
    })
    child?.on('exit', onEnd)
    child?.on('close', onEnd)
  })
}

export const execPromiseWithEnv = (
  command: string,
  opt?: { [k: string]: any }
): Promise<{
  stdout: string
  stderr: string
}> => {
  return new Promise(async (resolve, reject) => {
    try {
      const env = await EnvSync.sync()
      const option: any = {
        env
      }
      if (isMacOS()) {
        option.shell = '/bin/zsh'
      }
      const res = await execPromise(command, mergeProcessOptions(option, opt))
      resolve({
        stdout: res.stdout.toString(),
        stderr: res.stderr.toString()
      })
    } catch (e) {
      reject(e)
    }
  })
}

export const spawnPromise = (
  command: string,
  arg: Array<string> = [],
  options: { [key: string]: any } = {}
): ForkPromiseResType => {
  return new ForkPromise(async (resolve, reject) => {
    let cp: ChildProcess
    try {
      cp = spawn(command, arg, options)
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
    cp.on('error', (err: Error) => {
      exit = true
      reject(err)
    })
    cp.on('exit', onEnd)
    cp.on('close', onEnd)
  })
}

export const spawnPromiseWithEnv = (
  command: string,
  arg: Array<string> = [],
  options: SpawnPromiseWithEnvOptions = {}
): ForkPromiseResType => {
  return new ForkPromise(async (resolve, reject, on) => {
    const envSyncStartedAt = Date.now()
    const env = await EnvSync.sync()
    const { trimOutput = true, timing, ...spawnOptions } = options
    reportSpawnPromiseWithEnvTiming(() => timing?.onEnvSync?.(Date.now() - envSyncStartedAt))
    const optdefault: any = {
      env
    }
    if (isMacOS()) {
      optdefault.shell = '/bin/zsh'
    }
    const opt = mergeProcessOptions(optdefault, spawnOptions)
    let cp: ChildProcess
    const spawnStartedAt = Date.now()
    try {
      cp = spawn(command, arg, opt)
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e))
      reportSpawnPromiseWithEnvTiming(() =>
        timing?.onError?.({ durationMs: Date.now() - spawnStartedAt, error })
      )
      reject(e)
      return
    }

    const stdout: Array<Uint8Array> = []
    const stderr: Array<Uint8Array> = []

    const stdinFn = (txt: string) => {
      cp?.stdin?.write(`${txt}\n`)
    }

    cp?.stdout?.on('data', (data: Uint8Array) => {
      stdout.push(data)
      on(data.toString(), stdinFn)
    })

    cp?.stderr?.on('data', (data: Uint8Array) => {
      stderr.push(data)
    })

    let exit = false
    const onEnd = async (code: number | null) => {
      if (exit) return
      exit = true
      const stdoutText = Buffer.concat(stdout).toString()
      const stderrText = Buffer.concat(stderr).toString()
      reportSpawnPromiseWithEnvTiming(() =>
        timing?.onExit?.({
          code,
          durationMs: Date.now() - spawnStartedAt,
          stdoutBytes: Buffer.byteLength(stdoutText),
          stderrBytes: Buffer.byteLength(stderrText)
        })
      )
      if (!code) {
        resolve({
          stdout: trimOutput ? stdoutText.trim() : stdoutText,
          stderr: trimOutput ? stderrText.trim() : stderrText
        })
      } else {
        reject(new Error(trimOutput ? stderrText.trim() : stderrText))
      }
    }
    cp.on('spawn', () => {
      reportSpawnPromiseWithEnvTiming(() => timing?.onSpawn?.(Date.now() - spawnStartedAt))
    })
    cp.on('error', (err: Error) => {
      exit = true
      reportSpawnPromiseWithEnvTiming(() =>
        timing?.onError?.({ durationMs: Date.now() - spawnStartedAt, error: err })
      )
      reject(err)
    })
    cp.on('exit', onEnd)
    cp.on('close', onEnd)
  })
}

export const spawnPromiseWithStdin = (
  command: string,
  arg: Array<string> = [],
  options: { [key: string]: any } = {}
): ForkPromiseResType => {
  return new ForkPromise(async (resolve, reject, on) => {
    let cp: ChildProcess
    try {
      cp = spawn(command, arg, options)
    } catch (e) {
      reject(e)
      return
    }

    const stdout: Array<Uint8Array> = []
    const stderr: Array<Uint8Array> = []

    const stdinFn = (txt: string) => {
      cp?.stdin?.write(`${txt}\n`)
    }

    cp?.stdout?.on('data', (data: Uint8Array) => {
      stdout.push(data)
      on(data.toString(), stdinFn)
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
    cp.on('error', (err: Error) => {
      exit = true
      reject(err)
    })
    cp.on('exit', onEnd)
    cp.on('close', onEnd)
  })
}
