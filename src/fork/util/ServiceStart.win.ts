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
  mkdirp
} from '../Fn'
import chardet from 'chardet'
import iconv from 'iconv-lite'
import { ServiceStartParams } from './ServiceStart'
import type { ModuleExecItem } from '@shared/app'
import { powershellExecFile } from './Powershell'

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

export async function serviceStartExec(
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

  let psScript = await readFile(join(global.Server.Static!, 'sh/flyenv-async-exec.ps1'), 'utf8')

  psScript = psScript
    .replace('#ENV#', execEnv)
    .replace('#CWD#', cwd)
    .replace('#BIN#', bin)
    .replace('#ARGS#', execArgs)
    .replace('#OUTLOG#', outFile)
    .replace('#ERRLOG#', errFile)

  const psName = `${typeFlag}-${versionStr}-start.ps1`.split(' ').join('')
  const psPath = join(baseDir, psName)
  await writeFile(psPath, psScript)

  on({
    'APP-On-Log': AppLog('info', I18nT('appLog.execStartCommand'))
  })

  process.chdir(baseDir)
  let res: any
  try {
    res = await powershellExecFile(psPath, [], { cwd: baseDir })
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
    let pid = ''
    const stdout = res.trim()
    const regex = /FlyEnv-Process-ID(.*?)FlyEnv-Process-ID/g
    const match = regex.exec(stdout)
    if (match) {
      pid = match[1] // 捕获组 (\d+) 的内容
    }
    await writeFile(pidPath, pid)
    on({
      'APP-On-Log': AppLog('info', I18nT('appLog.startServiceSuccess', { pid: pid }))
    })
    return {
      'APP-Service-Start-PID': pid
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

  let psScript = await readFile(join(global.Server.Static!, 'sh/flyenv-async-exec.cmd'), 'utf8')

  let execBin = basename(bin)
  if (execBin.includes('.exe')) {
    execBin = `./${execBin}`
  }

  psScript = psScript
    .replace('#ENV#', execEnv)
    .replace('#CWD#', cwd)
    .replace('#BIN#', execBin)
    .replace('#ARGS#', execArgs)
    .replace('#OUTLOG#', outFile)
    .replace('#ERRLOG#', errFile)

  const psName = `${typeFlag}-${versionStr}-start.cmd`.split(' ').join('')
  const psPath = join(baseDir, psName)
  await writeFile(psPath, psScript)

  on({
    'APP-On-Log': AppLog('info', I18nT('appLog.execStartCommand'))
  })

  process.chdir(baseDir)
  let res: any
  try {
    res = await spawnPromiseWithEnv(psName, [], {
      shell: 'cmd.exe',
      cwd: baseDir
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
): Promise<{ 'APP-Service-Start-PID': string }> {
  const pidPath = version?.pidPath ?? ''
  if (pidPath && existsSync(pidPath)) {
    try {
      await remove(pidPath)
    } catch {}
  }

  const baseDir = join(global.Server.BaseDir!, 'module-customer')
  await mkdirp(baseDir)

  const outFile = join(baseDir, `${version.id}.out.log`)
  const errFile = join(baseDir, `${version.id}.error.log`)

  let psScript = await readFile(join(global.Server.Static!, 'sh/flyenv-customer-exec.ps1'), 'utf8')

  let bin = ''
  if (version.commandType === 'file') {
    bin = version.commandFile
  } else {
    bin = join(baseDir, `${version.id}.start.ps1`)
    await writeFile(bin, version.command)
  }

  psScript = psScript
    .replace('#CWD#', dirname(bin))
    .replace('#BIN#', bin)
    .replace('#OUTLOG#', outFile)
    .replace('#ERRLOG#', errFile)

  const psName = `start-${version.id.trim()}.ps1`.split(' ').join('')
  const psPath = join(baseDir, psName)
  await writeFile(psPath, psScript)

  process.chdir(baseDir)
  let res: any
  let error: any
  try {
    res = await powershellExecFile(psPath, [], { cwd: baseDir })
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
    const stdout = res.trim()
    const regex = /FlyEnv-Process-ID(.*?)FlyEnv-Process-ID/g
    const match = regex.exec(stdout)
    if (match) {
      pid = match[1]
    }
    if (pid) {
      return {
        'APP-Service-Start-PID': pid
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
