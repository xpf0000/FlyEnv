import { exec as execChildProcess } from 'child_process'
import crypto from 'crypto'
import * as fs from 'fs/promises'
import os, { tmpdir } from 'os'
import path from 'path'
import process from 'process'

import { promisify } from 'node:util'
import { uuid } from '@shared/utils'

const APPLET = '' // Base64 content of the applet zip
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
  while (true) {
    try {
      const stats = await fs.stat(instance.pathStatus!)
      if (stats.size >= 2) return
    } catch (error: any) {
      if (error.code !== 'ENOENT') throw error
    }

    try {
      await fs.stat(instance.pathStdout!)
    } catch {
      throw new Error(PERMISSION_DENIED)
    }

    await new Promise((resolve) => setTimeout(resolve, 1000))
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
}

async function windowsWriteExecuteScript(instance: Instance): Promise<void> {
  const script: string[] = []
  script.push('@echo off')
  script.push(
    `call "${instance.pathCommand!}" > "${instance.pathStdout!}" 2> "${instance.pathStderr!}"`
  )
  script.push(`(echo %ERRORLEVEL%) > "${instance.pathStatus!}"`)
  await fs.writeFile(instance.pathExecute!, script.join('\r\n'), 'utf-8')
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
  command.push(
    `/bin/bash -c "echo ${escapeDoubleQuotes(magic.trim())}; ${escapeDoubleQuotes(instance.command)}"`
  )

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
