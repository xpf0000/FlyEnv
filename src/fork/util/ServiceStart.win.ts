import { basename, dirname, join } from 'path'
import { I18nT } from '@lang/index'
import {
  AppLog,
  spawnPromiseWithEnv,
  waitPidFile,
  existsSync,
  remove,
  readFile,
  writeFile,
  mkdirp,
  waitTime
} from '../Fn'
import chardet from 'chardet'
import iconv from 'iconv-lite'
import { ServiceStartParams } from './ServiceStart'
import type { ModuleExecItem } from '@shared/app'
import { ProcessPidListByPid } from '@shared/Process.win'
import EnvSync from '@shared/EnvSync'
import { encodePowerShellCommand, powerShellInlineArgs } from '@shared/PowerShellCommand'

export async function readFileAsUTF8(filePath: string): Promise<string> {
  try {
    const buffer: Buffer = await readFile(filePath)
    if (buffer?.length === 0 || buffer?.byteLength === 0) {
      return ''
    }
    const detectedEncoding = chardet.detect(buffer)
    console.log('detectedEncoding: ', detectedEncoding)
    if (
      !detectedEncoding ||
      detectedEncoding.toLowerCase() === 'utf-8' ||
      detectedEncoding.toLowerCase() === 'utf8'
    ) {
      return buffer.toString('utf-8')
    }

    if (typeof detectedEncoding === 'string') {
      let str = ''
      try {
        str = iconv.decode(buffer, detectedEncoding)
      } catch {}
      return str
    }

    try {
      return iconv.decode(buffer, detectedEncoding)
    } catch (conversionError: any) {
      console.error(
        `Error converting from ${detectedEncoding} to UTF-8 for file: ${filePath}`,
        conversionError
      )
      return buffer.toString('utf-8')
    }
  } catch {
    return ''
  }
}

type WindowsCmdServiceStartCommandParams = {
  execEnv: string
  cwd: string
  bin: string
  execArgs: string
  outFile: string
  errFile: string
}

type WindowsCustomerServiceStartScriptParams = {
  env: string
  cwd: string
  commandType: 'command' | 'file'
  command: string
  commandFile: string
  outFile: string
  errFile: string
}

function powerShellSingleQuoted(value: string): string {
  return `'${`${value}`.replace(/'/g, "''")}'`
}

function powerShellArray(values: string[]): string {
  return `@(${values.map(powerShellSingleQuoted).join(', ')})`
}

export function buildWindowsCmdServiceStartCommand(
  params: WindowsCmdServiceStartCommandParams
): string {
  const lines = ['chcp 65001>nul']
  const execEnv = params.execEnv.trim()
  if (execEnv) {
    lines.push(
      ...execEnv
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    )
  }
  lines.push(`cd /d "${params.cwd}"`)
  const execArgs = params.execArgs ? ` ${params.execArgs}` : ''
  lines.push(`start "" /B ${params.bin}${execArgs} > "${params.outFile}" 2>"${params.errFile}"`)
  return lines.join(' & ')
}

export function buildWindowsCustomerServiceStartScript(
  params: WindowsCustomerServiceStartScriptParams
): string {
  const argumentList =
    params.commandType === 'file'
      ? powerShellArray([
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          `"${params.commandFile}"`
        ])
      : powerShellArray([
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-EncodedCommand',
          encodePowerShellCommand(params.command)
        ])

  return `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8

$env:LC_ALL = 'en_US.UTF-8'
$env:LANG = 'en_US.UTF-8'

${params.env}

$OUTLOG = ${powerShellSingleQuoted(params.outFile)}
$ERRLOG = ${powerShellSingleQuoted(params.errFile)}
$ARGUMENTS = ${argumentList}

Set-Location -LiteralPath ${powerShellSingleQuoted(params.cwd)}

$process = Start-Process -FilePath "powershell.exe" \`
    -ArgumentList $ARGUMENTS \`
    -WindowStyle Hidden \`
    -PassThru \`
    -RedirectStandardOutput $OUTLOG \`
    -RedirectStandardError $ERRLOG

if ($process) {
    Write-Host "##FlyEnv-Process-ID$($process.Id)FlyEnv-Process-ID##"
}
else {
    Write-Error "Exec Failed"
    exit 1
}`
}

export async function serviceStartExecCMD(
  param: ServiceStartParams
): Promise<{ 'APP-Service-Start-PID': string }> {
  const baseDir = param.baseDir
  const version = param.version
  const execEnv = param?.execEnv ?? ''
  const cwd = param?.cwd ?? dirname(param.bin)
  const bin = param.bin
  const execArgs = param?.execArgs ?? ''
  const on = param.on
  const checkPidFile = param?.checkPidFile ?? true
  const pidPath = param?.pidPath ?? ''
  const maxTime = param?.maxTime ?? 20
  const timeToWait = param?.timeToWait ?? 500

  if (pidPath && existsSync(pidPath)) {
    try {
      await remove(pidPath)
    } catch {}
  }

  const typeFlag = version.typeFlag
  const versionStr = version.version!.trim()

  const outFile = join(baseDir, `${typeFlag}-${versionStr}-start-out.log`.split(' ').join(''))
  const errFile = join(baseDir, `${typeFlag}-${versionStr}-start-error.log`.split(' ').join(''))

  let execBin = basename(bin)
  if (execBin.includes('.exe')) {
    execBin = `./${execBin}`
  }

  const cmdScript = buildWindowsCmdServiceStartCommand({
    execEnv,
    cwd,
    bin: execBin,
    execArgs,
    outFile,
    errFile
  })

  on({
    'APP-On-Log': AppLog('info', I18nT('appLog.execStartCommand'))
  })

  process.chdir(baseDir)
  let res: any
  try {
    await EnvSync.sync()
    res = await spawnPromiseWithEnv(EnvSync.CMDPath || 'cmd.exe', ['/d', '/s', '/c', cmdScript], {
      cwd: baseDir,
      windowsHide: true,
      windowsVerbatimArguments: true
    })
  } catch (e) {
    on({
      'APP-On-Log': AppLog(
        'error',
        I18nT('appLog.execStartCommandFail', {
          error: e,
          service: `${version.typeFlag}-${version.version}`
        })
      )
    })
    throw e
  }

  on({
    'APP-On-Log': AppLog('info', I18nT('appLog.execStartCommandSuccess'))
  })
  on({
    'APP-Service-Start-Success': true
  })

  if (!checkPidFile) {
    return {
      'APP-Service-Start-PID': ''
    }
  }

  res = await waitPidFile(pidPath, 0, maxTime, timeToWait)
  if (res) {
    if (res?.pid) {
      await writeFile(pidPath, res.pid)
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.startServiceSuccess', { pid: res.pid }))
      })
      return {
        'APP-Service-Start-PID': res.pid
      }
    }
    on({
      'APP-On-Log': AppLog(
        'error',
        I18nT('appLog.startServiceFail', {
          error: res?.error ?? 'Start Fail',
          service: `${version.typeFlag}-${version.version}`
        })
      )
    })
    throw new Error(res?.error ?? 'Start Fail')
  }
  let msg = 'Start Fail'
  if (existsSync(errFile)) {
    msg = (await readFileAsUTF8(errFile)) || 'Start Fail'
  }
  on({
    'APP-On-Log': AppLog(
      'error',
      I18nT('appLog.startServiceFail', {
        error: msg,
        service: `${version.typeFlag}-${version.version}`
      })
    )
  })
  throw new Error(msg)
}

export async function customerServiceStartExec(
  version: ModuleExecItem,
  isService: boolean
): Promise<{ pids?: string[]; 'APP-Service-Start-PID': string }> {
  const pidPath = version?.pidPath ?? ''
  if (pidPath && existsSync(pidPath)) {
    try {
      await remove(pidPath)
    } catch {}
  }

  const baseDir = join(global.Server.BaseDir!, 'module-customer')
  await mkdirp(baseDir)

  const outFile = join(baseDir, `${version.id}-out.log`)
  const errFile = join(baseDir, `${version.id}-error.log`)

  let commandFile = ''
  if (version.commandType === 'file') {
    commandFile = version.commandFile
  } else {
    commandFile = ''
  }

  let env: string = ''
  if (version.binBin && existsSync(version.binBin)) {
    env = `$env:PATH = "${dirname(version.binBin)};" + $env:PATH`
  }
  const fallbackCwd = version.commandType === 'file' ? dirname(commandFile) : baseDir
  const cwd = version.workDir && existsSync(version.workDir) ? version.workDir : fallbackCwd
  const psScript = buildWindowsCustomerServiceStartScript({
    env,
    cwd,
    commandType: version.commandType,
    command: version.command,
    commandFile,
    outFile,
    errFile
  })

  process.chdir(baseDir)
  let res: any
  let error: any
  try {
    await EnvSync.sync()
    res = await spawnPromiseWithEnv(
      EnvSync.PowerShellPath || 'powershell.exe',
      powerShellInlineArgs(psScript),
      {
        cwd: baseDir,
        env: version.env,
        windowsHide: true
      }
    )
  } catch (e) {
    error = e
    if (!isService || !version.pidPath) {
      throw e
    }
  }

  await waitPidFile(errFile, 0, 6, 500)

  if (!isService) {
    let msg = ''
    if (existsSync(errFile)) {
      msg = await readFile(errFile, 'utf-8')
    }
    if (msg) {
      throw new Error(msg)
    }
    return {
      'APP-Service-Start-PID': '-1'
    }
  }

  if (!version.pidPath) {
    let pid = ''
    const stdout = res.stdout.trim() + '\n' + res.stderr.trim()
    const regex = /FlyEnv-Process-ID(.*?)FlyEnv-Process-ID/g
    const match = regex.exec(stdout)
    if (match) {
      pid = match[1]
    }
    if (pid) {
      await waitTime(2000)
      const pids = await ProcessPidListByPid(`${pid}`.trim())
      if (pids.length > 1) {
        return {
          pids,
          'APP-Service-Start-PID': pid
        }
      } else {
        throw new Error(I18nT('fork.startFail'))
      }
    } else {
      throw new Error(stdout)
    }
  }

  res = await waitPidFile(pidPath, 0, 20, 500)
  if (res) {
    if (res?.pid) {
      return {
        'APP-Service-Start-PID': res.pid
      }
    }
  }
  let msg = 'Start Fail: '
  if (error && error?.toString) {
    msg += '\n' + (error?.toString() ?? '')
  }
  if (existsSync(errFile)) {
    msg += '\n' + (await readFile(errFile, 'utf-8'))
  }
  throw new Error(msg)
}
