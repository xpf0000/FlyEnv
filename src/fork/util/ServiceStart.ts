import {
  existsSync,
  waitTime,
  readFile,
  remove,
  writeFile,
  AppLog,
  spawnPromise,
  readFileAsUTF8
} from '../Fn'
import { type SoftInstalled } from '@shared/app'
import { join, dirname, basename } from 'path'
import { I18nT } from '@lang/index'

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

export async function serviceStartExec(
  version: SoftInstalled,
  pidPath: string,
  baseDir: string,
  bin: string,
  execArgs: string,
  execEnv: string,
  on: (...args: any) => void,
  maxTime = 20,
  timeToWait = 500,
  checkPidFile = true
): Promise<{ 'APP-Service-Start-PID': string }> {
  if (pidPath && existsSync(pidPath)) {
    try {
      await remove(pidPath)
    } catch {}
  }

  const typeFlag = version.typeFlag
  const versionStr = version.version!.trim()

  const outFile = join(baseDir, `${typeFlag}-${versionStr}-start-out.log`.split(' ').join(''))
  const errFile = join(baseDir, `${typeFlag}-${versionStr}-start-error.log`.split(' ').join(''))

  let psScript = await readFile(join(window.Server.Static!, 'sh/flyenv-async-exec.ps1'), 'utf8')

  psScript = psScript
    .replace('#ENV#', execEnv)
    .replace('#CWD#', dirname(bin))
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
    res = await spawnPromise(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `"Unblock-File -LiteralPath './${psName}'; & './${psName}'"`
      ],
      {
        shell: 'powershell.exe',
        cwd: baseDir
      }
    )
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
  version: SoftInstalled,
  pidPath: string,
  baseDir: string,
  bin: string,
  execArgs: string,
  execEnv: string,
  on: (...args: any) => void,
  maxTime = 20,
  timeToWait = 500,
  checkPidFile = true
): Promise<{ 'APP-Service-Start-PID': string }> {
  if (pidPath && existsSync(pidPath)) {
    try {
      await remove(pidPath)
    } catch {}
  }

  const typeFlag = version.typeFlag
  const versionStr = version.version!.trim()

  const outFile = join(baseDir, `${typeFlag}-${versionStr}-start-out.log`.split(' ').join(''))
  const errFile = join(baseDir, `${typeFlag}-${versionStr}-start-error.log`.split(' ').join(''))

  let psScript = await readFile(join(window.Server.Static!, 'sh/flyenv-async-exec.cmd'), 'utf8')

  let execBin = basename(bin)
  if (execBin.includes('.exe')) {
    execBin = `./${execBin}`
  }

  psScript = psScript
    .replace('#ENV#', execEnv)
    .replace('#CWD#', dirname(bin))
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
    res = await spawnPromise(psName, [], {
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

export async function serviceStartExecGetPID(
  version: SoftInstalled,
  pidPath: string,
  baseDir: string,
  cwdDir: string,
  bin: string,
  execArgs: string,
  execEnv: string,
  on: (...args: any) => void
): Promise<{ 'APP-Service-Start-PID': string }> {
  if (pidPath && existsSync(pidPath)) {
    try {
      await remove(pidPath)
    } catch {}
  }

  const typeFlag = version.typeFlag
  const versionStr = version.version!.trim()

  const outFile = join(baseDir, `${typeFlag}-${versionStr}-start-out.log`.split(' ').join(''))
  const errFile = join(baseDir, `${typeFlag}-${versionStr}-start-error.log`.split(' ').join(''))

  let psScript = await readFile(join(window.Server.Static!, 'sh/flyenv-async-exec.ps1'), 'utf8')

  psScript = psScript
    .replace('#ENV#', execEnv)
    .replace('#CWD#', cwdDir)
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
    res = await spawnPromise(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `"Unblock-File -LiteralPath './${psName}'; & './${psName}'"`
      ],
      {
        shell: 'powershell.exe',
        cwd: baseDir
      }
    )
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
