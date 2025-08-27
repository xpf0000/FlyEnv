import { exec as execChildProcess } from 'node:child_process'
import * as fs from 'node:fs/promises'
import os, { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { uuid, waitTime } from './utils'
import { existsSync } from 'node:fs'

const APPLET =
  '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'
const PERMISSION_DENIED = 'User did not grant permission.'
const NO_POLKIT_AGENT = 'No polkit authentication agent found.'
const MAX_BUFFER = 134217728

interface Options {
  name: string
  icns?: string
  env?: Record<string, string>
  dir?: string
  debug?: boolean
}

interface Instance {
  command: string
  options: Options
  uuid?: string
  path?: string
  pathElevate?: string
  pathExecute?: string
  pathCommand?: string
  pathStdout?: string
  pathStderr?: string
  pathStatus?: string
}

// ## Helper Functions ##

function escapeDoubleQuotes(str: string): string {
  if (typeof str !== 'string') throw new Error('Expected a string.')
  return str.replace(/"/g, '\\"')
}

function validName(str: string): boolean {
  if (!/^[a-z0-9 ]+$/i.test(str)) return false
  if (str.trim().length === 0) return false
  if (str.length > 70) return false
  return true
}

const execChildProcessAsync = promisify(execChildProcess)

async function remove(targetPath: string): Promise<void> {
  if (typeof targetPath !== 'string' || !targetPath.trim()) {
    throw new Error('Argument path not defined.')
  }
  let command: string
  if (process.platform === 'win32') {
    if (/"/.test(targetPath)) {
      throw new Error('Argument path cannot contain double-quotes.')
    }
    command = `rmdir /s /q "${targetPath}"`
  } else {
    command = `/bin/rm -rf "${escapeDoubleQuotes(path.normalize(targetPath))}"`
  }
  await execChildProcessAsync(command, { encoding: 'utf-8' })
}

// ## Linux Helpers ##

async function linuxBinary(): Promise<string> {
  const paths = ['/usr/bin/kdesudo', '/usr/bin/pkexec']

  for (const binaryPath of paths) {
    try {
      await fs.stat(binaryPath)
      return binaryPath
    } catch (error: any) {
      if (error.code !== 'ENOTDIR' && error.code !== 'ENOENT') {
        throw error
      }
    }
  }

  throw new Error('Unable to find pkexec or kdesudo.')
}

// ## macOS Helpers ##

async function macApplet(instance: Instance): Promise<void> {
  const parent = path.dirname(instance.path!)
  await fs.mkdir(parent, { recursive: true })
  const zip = path.join(parent, 'sudo-prompt-applet.zip')
  await fs.writeFile(zip, APPLET, 'base64')
  const command = `/usr/bin/unzip -o "${escapeDoubleQuotes(zip)}" -d "${escapeDoubleQuotes(instance.path!)}"`
  await execChildProcessAsync(command, { encoding: 'utf-8' })
}

async function macCommand(instance: Instance): Promise<void> {
  const scriptPath = path.join(instance.path!, 'Contents', 'MacOS', 'sudo-prompt-command')
  const script: string[] = []
  script.push(`cd "${escapeDoubleQuotes(process.cwd())}"`)
  if (instance.options.env) {
    for (const key in instance.options.env) {
      const value = instance.options.env[key]
      script.push(`export ${key}="${escapeDoubleQuotes(value)}"`)
    }
  }
  script.push(instance.command)
  await fs.writeFile(scriptPath, script.join('\n'), 'utf-8')
}

async function macIcon(instance: Instance): Promise<void> {
  if (!instance.options.icns) return
  const buffer = await fs.readFile(instance.options.icns)
  const icnsPath = path.join(instance.path!, 'Contents', 'Resources', 'applet.icns')
  await fs.writeFile(icnsPath, buffer)
}

async function macOpen(instance: Instance): Promise<{ stdout: string; stderr: string }> {
  const binary = path.join(instance.path!, 'Contents', 'MacOS', 'applet')
  const options = {
    cwd: path.dirname(binary),
    encoding: 'utf-8'
  }
  return await execChildProcessAsync('./' + path.basename(binary), options)
}

async function macPropertyList(instance: Instance): Promise<void> {
  const plist = path.join(instance.path!, 'Contents', 'Info.plist')
  const plistPath = escapeDoubleQuotes(plist)
  const key = escapeDoubleQuotes('CFBundleName')
  const value = `${instance.options.name} Password Prompt`
  if (/'/.test(value)) {
    throw new Error('Value should not contain single quotes.')
  }
  const command = `/usr/bin/defaults write "${plistPath}" "${key}" '${value}'`
  await execChildProcessAsync(command, { encoding: 'utf-8' })
}

async function macResult(instance: Instance): Promise<{ stdout: string; stderr: string }> {
  const cwd = path.join(instance.path!, 'Contents', 'MacOS')

  let code: string
  try {
    code = await fs.readFile(path.join(cwd, 'code'), 'utf-8')
  } catch (error: any) {
    if (error.code === 'ENOENT') throw new Error(PERMISSION_DENIED)
    throw error
  }

  const stdout = await fs.readFile(path.join(cwd, 'stdout'), 'utf-8')
  const stderr = await fs.readFile(path.join(cwd, 'stderr'), 'utf-8')

  const exitCode = parseInt(code.trim(), 10)
  if (exitCode === 0) {
    return { stdout, stderr }
  } else {
    const cmdError = new Error(`Command failed: ${instance.command}\n${stderr}`)
    ;(cmdError as NodeJS.ErrnoException).code = exitCode.toString()
    throw cmdError
  }
}

// ## Windows Helpers ##

async function windowsElevate(instance: Instance): Promise<void> {
  const command = `powershell.exe Start-Process -FilePath "'${instance.pathExecute!.replace(/'/g, "`'")}'" -WindowStyle hidden -Verb runAs`
  try {
    await execChildProcessAsync(command, { encoding: 'utf-8' })
  } catch {
    throw new Error(PERMISSION_DENIED)
  }
  console.log('windowsElevate !!!')
}

async function windowsResult(instance: Instance): Promise<{ stdout: string; stderr: string }> {
  const code = await fs.readFile(instance.pathStatus!, 'utf-8')
  const stdout = await fs.readFile(instance.pathStdout!, 'utf-8')
  const stderr = await fs.readFile(instance.pathStderr!, 'utf-8')

  const exitCode = parseInt(code.trim(), 10)
  if (exitCode === 0) {
    return { stdout, stderr }
  } else {
    const cmdError = new Error(`Command failed: ${instance.command}\r\n${stderr}`)
    ;(cmdError as NodeJS.ErrnoException).code = exitCode.toString()
    throw cmdError
  }
}

async function windowsWaitForStatus(instance: Instance): Promise<void> {
  let times = 0
  while (times < 20) {
    const a = existsSync(instance.pathStatus!)
    const b = existsSync(instance.pathStdout!)
    const c = existsSync(instance.pathStderr!)
    console.log('windowsWaitForStatus times: ', times, a, b, c)
    if (a && b && c) {
      return
    }
    await waitTime(1000)
    times += 1
  }
}

async function windowsWriteCommandScript(instance: Instance): Promise<void> {
  const cwd = process.cwd()
  if (/"/.test(cwd)) {
    throw new Error('process.cwd() cannot contain double-quotes.')
  }
  const script: string[] = []
  script.push('@echo off')
  script.push('chcp 65001>nul')
  script.push(`cd /d "${cwd}"`)
  if (instance.options.env) {
    for (const key in instance.options.env) {
      const value = instance.options.env[key]
      script.push(`set ${key}=${value.replace(/([<>\\|&^])/g, '^$1')}`)
    }
  }
  script.push(instance.command)
  await fs.writeFile(instance.pathCommand!, script.join('\r\n'), 'utf-8')
  console.log('windowsWriteCommandScript: ', instance.pathCommand)
}

async function windowsWriteExecuteScript(instance: Instance): Promise<void> {
  const script: string[] = []
  script.push('@echo off')
  script.push('setlocal enabledelayedexpansion')
  script.push(
    `call "${instance.pathCommand!}" > "${instance.pathStdout!}" 2> "${instance.pathStderr!}"`
  )
  script.push(`(echo !ERRORLEVEL!) > "${instance.pathStatus!}"`)
  script.push('endlocal')
  await fs.writeFile(instance.pathExecute!, script.join('\r\n'), 'utf-8')
  console.log('windowsWriteExecuteScript: ', instance.pathExecute)
}

// ## Platform-Specific Implementations ##

async function linux(instance: Instance): Promise<{ stdout: string; stderr: string }> {
  const binary = await linuxBinary()

  const command: string[] = []
  command.push(`cd "${escapeDoubleQuotes(process.cwd())}";`)

  if (instance.options.env) {
    for (const key in instance.options.env) {
      const value = instance.options.env[key]
      command.push(`export ${key}="${escapeDoubleQuotes(value)}";`)
    }
  }

  command.push(`"${escapeDoubleQuotes(binary)}"`)

  if (/kdesudo/i.test(binary)) {
    command.push(
      '--comment',
      `"${instance.options.name} wants to make changes. Enter your password to allow this."`
    )
    command.push('-d')
    command.push('--')
  } else if (/pkexec/i.test(binary)) {
    command.push('--disable-internal-agent')
  }

  const magic = 'SUDOPROMPT\n'
  command.push(`/bin/bash -c "echo ${escapeDoubleQuotes(magic.trim())}; ${instance.command}"`)

  const finalCommand = command.join(' ')

  const { stdout, stderr } = await execChildProcessAsync(finalCommand, {
    encoding: 'utf-8',
    maxBuffer: MAX_BUFFER
  })
  const elevated = stdout && stdout.slice(0, magic.length) === magic
  if (elevated) {
    const actualStdout = stdout.slice(magic.length)
    return { stdout: actualStdout, stderr }
  }

  if (/No authentication agent found/.test(stderr)) {
    throw new Error(NO_POLKIT_AGENT)
  } else {
    throw new Error(PERMISSION_DENIED)
  }
}

async function mac(instance: Instance): Promise<{ stdout: string; stderr: string }> {
  const temp = instance?.options?.dir ?? tmpdir()
  if (!temp) throw new Error('os.tmpdir() not defined.')

  const user = process.env.USER
  if (!user) throw new Error("env['USER'] not defined.")

  instance.uuid = uuid()
  instance.path = path.join(temp, instance.uuid, instance.options.name + '.app')

  try {
    await macApplet(instance)
    await macIcon(instance)
    await macPropertyList(instance)
    await macCommand(instance)
    await macOpen(instance)
    const result = await macResult(instance)
    await remove(path.dirname(instance.path!))
    return result
  } catch (error) {
    try {
      await remove(path.dirname(instance.path!))
    } catch (removeError) {
      console.error('Error during cleanup:', removeError)
    }
    throw error
  }
}

async function windows(instance: Instance): Promise<{ stdout: string; stderr: string }> {
  const temp = os.tmpdir()
  if (!temp) throw new Error('os.tmpdir() not defined.')

  instance.uuid = uuid()
  instance.path = path.join(temp, instance.uuid)

  if (/"/.test(instance.path)) {
    throw new Error('instance.path cannot contain double-quotes.')
  }

  instance.pathElevate = path.join(instance.path, 'elevate.vbs')
  instance.pathExecute = path.join(instance.path, 'execute.bat')
  instance.pathCommand = path.join(instance.path, 'command.bat')
  instance.pathStdout = path.join(instance.path, 'stdout')
  instance.pathStderr = path.join(instance.path, 'stderr')
  instance.pathStatus = path.join(instance.path, 'status')

  try {
    await fs.mkdir(instance.path, { recursive: true })
    await windowsWriteExecuteScript(instance)
    await windowsWriteCommandScript(instance)
    await windowsElevate(instance)
    await windowsWaitForStatus(instance)
    const result = await windowsResult(instance)
    await remove(instance.path!)
    return result
  } catch (error) {
    try {
      await remove(instance.path!)
    } catch (removeError) {
      console.error('Error during cleanup:', removeError)
    }
    throw error
  }
}

async function attempt(instance: Instance): Promise<{ stdout: string; stderr: string }> {
  const platform = process.platform
  if (platform === 'darwin') return mac(instance)
  if (platform === 'linux') return linux(instance)
  if (platform === 'win32') return windows(instance)
  throw new Error('Platform not yet supported.')
}

// ## Main Exported Function ##

export async function exec(
  command: string,
  options?: Partial<Options>
): Promise<{ stdout: string; stderr: string }> {
  if (typeof command !== 'string') {
    throw new Error('Command should be a string.')
  }

  if (/^sudo/i.test(command)) {
    throw new Error('Command should not be prefixed with "sudo".')
  }

  const opts: Partial<Options> = options || {}

  if (typeof opts.name === 'undefined') {
    const title = process.title
    if (validName(title)) {
      opts.name = title
    } else {
      throw new Error('process.title cannot be used as a valid name.')
    }
  } else if (!validName(opts.name)) {
    throw new Error(
      'options.name must be alphanumeric only (spaces are allowed) and <= 70 characters.'
    )
  }

  if (typeof opts.icns !== 'undefined') {
    if (typeof opts.icns !== 'string') {
      throw new Error('options.icns must be a string if provided.')
    } else if (opts.icns.trim().length === 0) {
      throw new Error('options.icns must not be empty if provided.')
    }
  }

  if (typeof opts.env !== 'undefined') {
    if (typeof opts.env !== 'object' || opts.env === null) {
      throw new Error('options.env must be an object if provided.')
    } else if (Object.keys(opts.env).length === 0) {
      throw new Error('options.env must not be empty if provided.')
    } else {
      for (const key in opts.env) {
        const value = opts.env[key]
        if (typeof key !== 'string' || typeof value !== 'string') {
          throw new Error('options.env environment variables must be strings.')
        }
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
          throw new Error(
            'options.env has an invalid environment variable name: ' + JSON.stringify(key)
          )
        }
        if (/[\r\n]/.test(value)) {
          throw new Error(
            'options.env has an invalid environment variable value: ' + JSON.stringify(value)
          )
        }
      }
    }
  }

  const platform = process.platform
  if (platform !== 'darwin' && platform !== 'linux' && platform !== 'win32') {
    throw new Error('Platform not yet supported.')
  }

  const instance: Instance = {
    command: command,
    options: opts as Options
  }

  return await attempt(instance)
}
