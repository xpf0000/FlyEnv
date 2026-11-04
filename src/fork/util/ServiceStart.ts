import type { ModuleExecItem, SoftInstalled } from '@shared/app'
import { dirname, join } from 'path'
import { I18nT } from '@lang/runtime'
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
import { isLinux, isMacOS, isWindows } from '@shared/utils'
import { closeSync, openSync, constants } from 'node:fs'
import { access, readdir, rename, stat } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import EnvSync from '@shared/EnvSync'
import { ProcessListFetch } from '@shared/Process'
import { resolveWindowsPowerShellPath } from '@shared/WindowsSystemPaths'

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
  /** Linux: retry a failed low-port bind as the same user with CAP_NET_BIND_SERVICE. */
  lowPortService?: boolean
  /** Known listeners select the low-port helper before starting; unknown listeners retain the fallback. */
  listenPorts?: number[]
  version: SoftInstalled
  pidPath?: string
  baseDir: string
  bin: string
  execArgs?: string[]
  execEnv?: Record<string, string>
  on: (...args: any) => void
  waitTime?: number
  cwd?: string
  /** Override where the process stdout is written (default: baseDir/<flag>-<ver>-start-out.log) */
  outFile?: string
  /** Override where the process stderr is written (default: baseDir/<flag>-<ver>-start-error.log) */
  errFile?: string
  /** Redact executable arguments and environment values from the startup diagnostic log. */
  sensitive?: boolean
  /** Keep wrapper processes attached when the platform launcher cannot survive CREATE_NEW_PROCESS_GROUP. */
  detached?: boolean
}

type ServiceStartSpawnLogParam = Omit<ServiceStartSpawnParams, 'execArgs' | 'execEnv'> & {
  execArgs?: string[] | '[REDACTED]'
  execEnv?: Record<string, string> | '[REDACTED]'
}

/** Preserve legacy root-owned logs without asking the helper to chmod/chown files. */
async function prepareUnixLog(file: string): Promise<void> {
  if (isWindows() || !existsSync(file)) return
  try {
    await access(file, constants.W_OK)
    return
  } catch (error) {
    if (!['EACCES', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
  }
  const info = await stat(file)
  if (!info.isFile() || info.uid !== 0) throw new Error(`Service log is not writable: ${file}`)
  // This succeeds only when the desktop user already owns write access to the parent.
  await rename(file, `${file}.previous-${process.pid}-${Date.now()}`)
  await writeFile(file, '')
}

export async function prepareUnixLogDirectory(
  directory: string,
  accept: (name: string) => boolean = () => true
): Promise<void> {
  if (isWindows() || !existsSync(directory)) return
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isFile() && !entry.name.includes('.previous-') && accept(entry.name))
      await prepareUnixLog(join(directory, entry.name))
  }
}

export function serviceStartSpawnLogParam(
  param: ServiceStartSpawnParams
): ServiceStartSpawnLogParam {
  if (!param.sensitive) return param
  const { execArgs, execEnv, ...safeParam } = param
  return {
    ...safeParam,
    execArgs: execArgs ? '[REDACTED]' : undefined,
    execEnv: execEnv ? '[REDACTED]' : undefined
  }
}

type UnixCustomerServiceStartScriptParams = {
  env: string
  cwd: string
  commandType: 'command' | 'file'
  command: string
  commandFile: string
  outFile: string
  errFile: string
  shell: '/bin/bash' | '/bin/zsh'
}

function shellSingleQuoted(value: string): string {
  return `'${`${value}`.replace(/'/g, "'\\''")}'`
}

function shellDoubleQuoted(value: string): string {
  return `"${`${value}`
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/`/g, '\\`')}"`
}

export function buildUnixCustomerServiceStartScript(
  params: UnixCustomerServiceStartScriptParams
): string {
  const lines = [
    'export LC_ALL=en_US.UTF-8',
    'export LANG=en_US.UTF-8',
    params.env.trim(),
    `cd ${shellDoubleQuoted(params.cwd)}`
  ].filter(Boolean)
  const outFile = shellDoubleQuoted(params.outFile)
  const errFile = shellDoubleQuoted(params.errFile)

  if (params.commandType === 'file') {
    lines.push(`nohup ${shellDoubleQuoted(params.commandFile)} > ${outFile} 2>${errFile} &`)
  } else {
    lines.push(
      `nohup ${params.shell} -lc ${shellSingleQuoted(params.command)} > ${outFile} 2>${errFile} &`
    )
  }

  lines.push('echo "##FlyEnv-Process-ID$!FlyEnv-Process-ID##"')
  return lines.join('\n')
}

export async function serviceStartExec(
  param: ServiceStartParams
): Promise<{ 'APP-Service-Start-PID': string }> {
  if (!isWindows() && param.root) {
    throw new Error('Unix helper does not execute root scripts')
  }
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
    // 删除旧 PID 失败应在启动前结束，不能读旧文件并登记为新实例。
    await remove(pidPath)
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
  const shell = isMacOS() ? '/bin/zsh' : '/bin/bash'
  if (param?.root) {
    try {
      res = await Helper.send('tools', 'runScript', shell, psPath)
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
    if (!res) {
      let msg = 'Start Fail'
      if (error) {
        msg = error && error?.toString ? error?.toString() : ''
      }
      if (!error && existsSync(errFile)) {
        msg = await readFile(errFile, 'utf-8')
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
  if (error) {
    msg = error && error?.toString ? error?.toString() : ''
  }
  if (!error && existsSync(errFile)) {
    msg = await readFile(errFile, 'utf-8')
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
  console.log('customerServiceStartExec: ', version.id, isService)
  if (!isWindows() && version.isSudo) {
    throw new Error('Unix custom commands requiring sudo must run in XTerm')
  }

  const pidPath = version?.pidPath ?? ''
  if (pidPath && existsSync(pidPath)) {
    // 停止契约必须绑定本次实际启动的根；历史 PID 文件清理失败时不能继续
    // 启动再复用旧文件。这里在创建外部进程前失败，避免产生未正确登记的实例。
    await remove(pidPath)
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

  let commandFile = ''
  if (version.commandType === 'file') {
    commandFile = version.commandFile
  }

  let env: string = ''
  if (version.binBin && existsSync(version.binBin)) {
    env = `export PATH="${dirname(version.binBin)}:$PATH"`
  }

  const shell = isMacOS() ? '/bin/zsh' : '/bin/bash'
  const fallbackCwd = version.commandType === 'file' ? dirname(commandFile) : baseDir
  const cwd = version.workDir && existsSync(version.workDir) ? version.workDir : fallbackCwd

  if (version.commandType === 'file') {
    const uinfo = userInfo()
    const uid = uinfo.uid
    const gid = uinfo.gid

    try {
      await execPromise(`chmod 0777 "${commandFile}"`)
    } catch {}

    try {
      await execPromise(`chown -R ${uid}:${gid} "${commandFile}"`)
    } catch {}
  }

  const inlineScript = buildUnixCustomerServiceStartScript({
    env,
    cwd,
    commandType: version.commandType,
    command: version.command,
    commandFile,
    outFile,
    errFile,
    shell
  })

  process.chdir(baseDir)
  let res: any
  let error: any
  try {
    if (version.isSudo) {
      res = await execPromiseSudo([shell, '-lc', inlineScript], {
        cwd: baseDir,
        env: version.env
      })
      console.log('customerServiceStartExec execPromiseSudo execRes: ', res)
    } else {
      res = await spawnPromiseWithEnv(shell, ['-lc', inlineScript], {
        cwd: baseDir,
        env: version.env
      })
    }
  } catch (e) {
    error = e
    if (!isService || !version.pidPath) {
      throw e
    }
  }

  // 错误日志存在而为空是正常情况；只等待出现，不按 PID 的空文件语义重试。
  await waitPidFile(errFile, 0, 6, 500, false)

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
  console.log('serviceStartSpawn param: ', serviceStartSpawnLogParam(param))
  const baseDir = param.baseDir
  const version = param.version
  const execEnv = param?.execEnv ?? ''
  const bin = param.bin
  const execArgs = param?.execArgs ?? []
  const on = param.on
  const pidPath = param?.pidPath ?? ''

  if (pidPath && existsSync(pidPath)) {
    // 同一条规则适用于 spawn 包装，避免旧 PID 冒充本次启动结果。
    await remove(pidPath)
  }

  await mkdirp(baseDir)

  const typeFlag = version.typeFlag
  const versionStr = version.version!.trim()

  const outFile =
    param?.outFile ?? join(baseDir, `${typeFlag}-${versionStr}-start-out.log`.split(' ').join(''))
  const errFile =
    param?.errFile ?? join(baseDir, `${typeFlag}-${versionStr}-start-error.log`.split(' ').join(''))

  await mkdirp(dirname(outFile))
  await mkdirp(dirname(errFile))
  await prepareUnixLog(outFile)
  await prepareUnixLog(errFile)

  const env = await EnvSync.sync()
  // 环境同步和系统程序解析可能失败，必须在打开日志句柄前完成，避免失败启动泄漏句柄。
  const powerShell =
    isWindows() && bin.toLowerCase().endsWith('.ps1') ? resolveWindowsPowerShellPath() : undefined

  on({
    'APP-On-Log': AppLog('info', I18nT('appLog.execStartCommand'))
  })

  const doExec = (): Promise<{ 'APP-Service-Start-PID': string }> => {
    const cwd = param?.cwd ?? dirname(bin)
    const options: any = {
      detached: param.detached ?? true,
      cwd,
      env: {
        ...env,
        ...execEnv
      },
      windowsHide: true // 隐藏 cmd 窗口
    }
    if (isWindows()) {
      if (powerShell) {
        // .ps1 入口同样使用受验证的系统绝对路径，不能依赖 PATH 或用户环境覆盖。
        options.shell = powerShell
      } else if (!bin.endsWith('.exe') && !bin.endsWith('.com')) {
        options.shell = true
      }
    }
    // 两个文件打开以及 spawn 均可能同步失败；无论子进程是否创建都释放父方句柄。
    const out = openSync(outFile, 'a')
    let err: number | undefined
    let cp: ReturnType<typeof spawn>
    try {
      err = openSync(errFile, 'a')
      cp = spawn(bin, execArgs, { ...options, stdio: ['ignore', out, err] })
    } finally {
      closeSync(out)
      if (err !== undefined) closeSync(err)
    }

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
          try {
            if (pidPath) {
              await mkdirp(dirname(pidPath))
              await writeFile(pidPath, pid)
            }
          } catch (e) {
            on({
              'APP-On-Log': AppLog('error', `Save PID file failed: ${e}`)
            })
          }
          cp.unref() // 让子进程独立运行，不挂钩主进程
          resolve({ 'APP-Service-Start-PID': pid })
        } else {
          reject(new Error(I18nT('fork.startFail')))
        }
      }, param?.waitTime ?? 2000)
    })
  }

  try {
    const launchLowPort = async () => {
      const pid = await Helper.send<number>('service', 'launchLowPort', {
        service: version.typeFlag,
        bin,
        args: execArgs,
        env: { ...env, ...execEnv },
        cwd: param.cwd ?? dirname(bin),
        outFile,
        errFile
      })
      if (pidPath) {
        try {
          await writeFile(pidPath, `${pid}`)
        } catch (error) {
          on({ 'APP-On-Log': AppLog('error', `Save PID file failed: ${error}`) })
        }
      }
      return { 'APP-Service-Start-PID': `${pid}` }
    }
    if (isLinux() && param.lowPortService && param.listenPorts?.length) {
      let threshold = 1024
      try {
        const value = Number(
          (await readFile('/proc/sys/net/ipv4/ip_unprivileged_port_start', 'utf8')).trim()
        )
        if (Number.isInteger(value) && value >= 0 && value <= 65535) threshold = value
      } catch {
        // Older kernels or unavailable procfs retain the default privileged-port boundary.
      }
      if (param.listenPorts.some((port) => Number.isInteger(port) && port > 0 && port < threshold))
        return await launchLowPort()
    }
    const before = existsSync(errFile) ? (await readFile(errFile, 'utf8')).length : 0
    try {
      return await doExec()
    } catch (error) {
      const output = existsSync(errFile) ? (await readFile(errFile, 'utf8')).slice(before) : ''
      if (
        !isLinux() ||
        !param.lowPortService ||
        !/(?:bind|listen)[\s\S]{0,300}(?:permission denied|operation not permitted)|(?:permission denied|operation not permitted)[\s\S]{0,300}(?:bind|listen)/i.test(
          output
        )
      )
        throw new Error(output.trim() ? `${error}\n${output.trim()}` : String(error))
      return await launchLowPort()
    }
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
