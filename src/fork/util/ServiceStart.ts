import type { ModuleExecItem, SoftInstalled } from '@shared/app'
import { dirname, join } from 'path'
import { I18nT } from '@lang/index'
import Helper from '../Helper'
import { userInfo } from 'os'
import {
  AppLog,
  spawnPromiseWithEnv,
  waitPidFile,
  existsSync,
  remove,
  mkdirp,
  readFile,
  writeFile,
  execPromiseSudo
} from '../Fn'
import { isMacOS } from '@shared/utils'

export type ServiceStartParams = {
  version: SoftInstalled
  pidPath?: string
  baseDir: string
  bin: string
  execArgs?: string
  execEnv?: string
  on: (...args: any) => void
  maxTime?: number
  timeToWait?: number
  checkPidFile?: boolean
  cwd?: string
  root?: boolean
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

  await mkdirp(baseDir)

  const typeFlag = version.typeFlag
  const versionStr = version.version!.trim()

  const outFile = join(baseDir, `${typeFlag}-${versionStr}-start-out.log`.split(' ').join(''))
  const errFile = join(baseDir, `${typeFlag}-${versionStr}-start-error.log`.split(' ').join(''))

  let psScript = await readFile(join(global.Server.Static!, 'sh/flyenv-async-exec.sh'), 'utf8')

  psScript = psScript
    .replace('#ENV#', execEnv)
    .replace('#CWD#', cwd)
    .replace('#ARGS#', execArgs)
    .replace('#OUTLOG#', outFile)
    .replace('#ERRLOG#', errFile)
    .replace('#BIN#', bin)

  const psName = `start-${version.version!.trim()}.sh`.split(' ').join('')
  const psPath = join(baseDir, psName)
  await writeFile(psPath, psScript)

  on({
    'APP-On-Log': AppLog('info', I18nT('appLog.execStartCommand'))
  })

  process.chdir(baseDir)
  let res: any
  let error: any
  const shell = isMacOS() ? 'zsh' : 'bash'
  if (param?.root) {
    try {
      res = await Helper.send('tools', 'exec', `${shell} "${psPath}"`)
    } catch (e) {
      error = e
    }
  } else {
    try {
      res = await spawnPromiseWithEnv(shell, [psName], {
        cwd: baseDir
      })
    } catch (e) {
      error = e
    }
  }

  on({
    'APP-On-Log': AppLog('info', I18nT('appLog.execStartCommandSuccess'))
  })
  on({
    'APP-Service-Start-Success': true
  })

  if (!checkPidFile) {
    let pid = ''
    const stdout = res.stdout.trim() + '\n' + res.stderr.trim()
    const regex = /FlyEnv-Process-ID(.*?)FlyEnv-Process-ID/g
    const match = regex.exec(stdout)
    if (match) {
      pid = match[1]
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
    msg = await readFile(errFile, 'utf-8')
  } else if (error) {
    msg = error && error?.toString ? error?.toString() : ''
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
  console.log('customerServiceStartExec: ', version, isService)

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

  try {
    await Helper.send('tools', 'rm', errFile)
  } catch {}
  try {
    await Helper.send('tools', 'rm', outFile)
  } catch {}

  let psScript = await readFile(join(global.Server.Static!, 'sh/flyenv-async-exec.sh'), 'utf8')

  let bin = ''
  if (version.commandType === 'file') {
    bin = version.commandFile
  } else {
    bin = join(baseDir, `${version.id}.start.sh`)
    await writeFile(bin, version.command)
  }
  const uinfo = userInfo()
  const uid = uinfo.uid
  const gid = uinfo.gid

  try {
    await Helper.send('tools', 'chmod', bin, '0777')
  } catch {}

  try {
    await Helper.send('tools', 'exec', `chown -R ${uid}:${gid} "${bin}"`)
  } catch {}

  psScript = psScript
    .replace('#ENV#', '')
    .replace('#CWD#', dirname(bin))
    .replace('#BIN#', bin)
    .replace('#ARGS#', '')
    .replace('#OUTLOG#', outFile)
    .replace('#ERRLOG#', errFile)

  const psName = `start-${version.id.trim()}.sh`.split(' ').join('')
  const psPath = join(baseDir, psName)
  await writeFile(psPath, psScript)

  try {
    await Helper.send('tools', 'chmod', psPath, '0777')
  } catch {}

  try {
    await Helper.send('tools', 'exec', `chown -R ${uid}:${gid} "${psPath}"`)
  } catch {}

  const shell = isMacOS() ? 'zsh' : 'bash'

  process.chdir(baseDir)
  let res: any
  let error: any
  try {
    if (version.isSudo) {
      const execRes = await execPromiseSudo([shell, psName], {
        cwd: baseDir
      })
      res = (execRes.stdout + '\n' + execRes.stderr).trim()
    } else {
      res = await spawnPromiseWithEnv(shell, [psName], {
        cwd: baseDir,
        shell: `/bin/${shell}`
      })
    }
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
      await writeFile(pidPath, res.pid)
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
