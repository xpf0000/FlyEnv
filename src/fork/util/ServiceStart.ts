import type { ModuleExecItem, SoftInstalled } from '@shared/app'
import { dirname, join } from 'path'
import { I18nT } from '@lang/index'
import Helper from '../Helper'
import { userInfo } from 'os'
import {
  AppLog,
  execPromise,
  execPromiseSudo,
  existsSync,
  mkdirp,
  readFile,
  remove,
  removeByRoot,
  spawnPromiseWithEnv,
  waitPidFile,
  waitTime,
  writeFile
} from '../Fn'
import { isMacOS, isWindows } from '@shared/utils'
import { closeSync, openSync } from 'node:fs'
import { spawn } from 'node:child_process'
import EnvSync from '@shared/EnvSync'
import { ProcessListFetch } from '@shared/Process'

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

export type ServiceStartSpawnParams = {
  version: SoftInstalled
  pidPath?: string
  baseDir: string
  bin: string
  execArgs?: string[]
  execEnv?: Record<string, string>
  on: (...args: any) => void
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
    await removeByRoot(errFile)
  } catch {}
  try {
    await removeByRoot(outFile)
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
    await execPromise(`chmod 0777 "${bin}"`)
  } catch {}

  try {
    await execPromise(`chown -R ${uid}:${gid} "${bin}"`)
  } catch {}

  let env: string = ''
  if (version.binBin && existsSync(version.binBin)) {
    env = `export PATH="${dirname(version.binBin)}:$PATH"`
  }

  psScript = psScript
    .replace('#ENV#', env)
    .replace('#CWD#', dirname(bin))
    .replace('#BIN#', bin)
    .replace('#ARGS#', '')
    .replace('#OUTLOG#', outFile)
    .replace('#ERRLOG#', errFile)

  const psName = `start-${version.id.trim()}.sh`.split(' ').join('')
  const psPath = join(baseDir, psName)
  await writeFile(psPath, psScript)

  try {
    await execPromise(`chmod 0777 "${psPath}"`)
  } catch {}

  try {
    await execPromise(`chown -R ${uid}:${gid} "${psPath}"`)
  } catch {}

  const shell = isMacOS() ? 'zsh' : 'bash'

  process.chdir(baseDir)
  let res: any
  let error: any
  try {
    if (version.isSudo) {
      res = await execPromiseSudo([shell, psName], {
        cwd: baseDir,
        env: version.env
      })
      console.log('customerServiceStartExec execPromiseSudo execRes: ', res)
    } else {
      res = await spawnPromiseWithEnv(shell, [psName], {
        cwd: baseDir,
        shell: `/bin/${shell}`,
        env: version.env
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
      await waitTime(2000)
      const plist = await ProcessListFetch()
      const find = plist.find((p) => `${p.PID}` === `${pid}`)
      if (find) {
        return {
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

/**
 * Start the service using the spawn detached: true method and directly return the process ID after startup.
 * @param param
 */
export async function serviceStartSpawn(
  param: ServiceStartSpawnParams
): Promise<{ 'APP-Service-Start-PID': string }> {
  console.log('serviceStartSpawn param: ', param)
  const baseDir = param.baseDir
  const version = param.version
  const execEnv = param?.execEnv ?? ''
  const bin = param.bin
  const execArgs = param?.execArgs ?? []
  const on = param.on
  const pidPath = param?.pidPath ?? ''

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

  const out = openSync(outFile, 'a')
  const err = openSync(errFile, 'a')

  const env = await EnvSync.sync()

  on({
    'APP-On-Log': AppLog('info', I18nT('appLog.execStartCommand'))
  })

  const doExec = (): Promise<{ 'APP-Service-Start-PID': string }> => {
    const cwd = dirname(bin)
    const options: any = {
      detached: true,
      stdio: ['ignore', out, err],
      cwd,
      env: {
        ...env,
        ...execEnv
      },
      windowsHide: true // 隐藏 cmd 窗口
    }
    if (isWindows()) {
      if (bin.endsWith('.ps1')) {
        options.shell = 'powershell.exe'
      } else if (!bin.endsWith('.exe') && !bin.endsWith('.com')) {
        options.shell = true
      }
    }
    // 2. 启动进程
    const cp = spawn(bin, execArgs, options)
    // 3. 立即关闭父进程中的句柄 (子进程已继承)
    closeSync(out)
    closeSync(err)

    return new Promise((resolve, reject) => {
      // 监听启动瞬间的错误（如文件路径不存在、权限不足）
      cp.on('error', (err) => {
        reject(err)
      })

      let timer: NodeJS.Timeout | undefined = undefined

      // 关键：检测启动后的早期崩溃（例如 Token 错误导致 1-2 秒内退出）
      const startupExitHandler = () => {
        clearTimeout(timer)
        reject(new Error(I18nT('fork.startFail')))
      }
      cp.on('exit', startupExitHandler)

      // 如果 2 秒内没退出，我们认为启动基本成功
      timer = setTimeout(async () => {
        cp.off('exit', startupExitHandler) // 移除早期退出监听

        if (cp.pid) {
          const pid = `${cp.pid}`
          await writeFile(pidPath, pid)
          cp.unref() // 让子进程独立运行，不挂钩主进程
          resolve({ 'APP-Service-Start-PID': pid })
        }
      }, 2000)
    })
  }

  try {
    return await doExec()
  } catch (e) {
    on({
      'APP-On-Log': AppLog(
        'error',
        I18nT('appLog.startServiceFail', {
          error: e,
          service: `${version.typeFlag}-${version.version}`
        })
      )
    })
    throw e
  }
}
