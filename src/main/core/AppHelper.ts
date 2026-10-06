import { join, resolve as PathResolve, basename, dirname } from 'node:path'
import is from 'electron-is'
import { appDebugLog, isLinux, isMacOS, isWindows, uuid } from '@shared/utils'
import {
  AppHelperCheck,
  HelperVersion,
  getWindowsHelperBinaryPath,
  windowsHelperBinaryExists,
  recoverWindowsHelper
} from '@shared/AppHelperCheck'
import {
  AppHelperError,
  type AppHelperErrorCode,
  isAppHelperError
} from '@shared/WindowsHelperState'
import {
  getWindowsHelperIdentity,
  buildWindowsHelperInstallScript,
  readWindowsHelperDiagnostics,
  windowsHelperInstalledPath
} from '@shared/WindowsHelperIdentity'
import { runWindowsHelperInstaller } from './WindowsHelperInstaller'
import { LinuxSudoCancelledError, WindowsSudoCommandError, WindowsSudoError } from '@shared/Sudo'
import { tmpdir, userInfo } from 'node:os'
import { copyFile, chmod, existsSync, mkdirp, readFile } from '@shared/fs-extra'
import type { CallbackFn } from '@shared/app'
import { X509Certificate } from 'node:crypto'
import { lstatSync } from 'node:fs'

type AppHelperMessage = {
  state:
    'needInstall' | 'installing' | 'installed' | 'installFaild' | 'checkSuccess' | 'fallbackToUac'
  reason?: string
  // checkSuccess 同时用于健康检查和实际安装完成；只有后者才能显示安装成功通知。
  installationPerformed?: boolean
}

type AppHelperCallback = (message: AppHelperMessage) => void

type SudoExec = typeof import('@shared/Sudo').exec

type HelperHealthWaitOptions = {
  deadlineMs?: number
  initialDelayMs?: number
  maxDelayMs?: number
  now?: () => number
  sleep?: (milliseconds: number) => Promise<void>
}

export const waitForHelperHealth = async <T>(
  check: () => Promise<T>,
  options: HelperHealthWaitOptions = {}
): Promise<T> => {
  const deadlineMs = options.deadlineMs ?? 30_000
  const maxDelayMs = options.maxDelayMs ?? 2_000
  const now = options.now ?? Date.now
  const sleep =
    options.sleep ??
    ((milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)))
  let delayMs = options.initialDelayMs ?? 250
  const startedAt = now()
  let lastError: unknown

  while (true) {
    try {
      return await check()
    } catch (error) {
      if (!isAppHelperError(error)) {
        throw error
      }
      if (error.code !== 'helper_pipe_unreachable' && error.code !== 'helper_unreachable') {
        throw error
      }
      lastError = error
    }
    const remainingMs = deadlineMs - (now() - startedAt)
    if (remainingMs <= 0) {
      if (isAppHelperError(lastError)) {
        throw new AppHelperError(
          'helper_start_timeout',
          `Timed out waiting for FlyEnv helper health: ${lastError.message}`,
          lastError.stderr
        )
      }
      throw lastError
    }
    const nextDelay = Math.min(delayMs, remainingMs)
    await sleep(nextDelay)
    delayMs = Math.min(delayMs * 2, maxDelayMs)
  }
}

const installerErrorCodes = new Set<AppHelperErrorCode>([
  'helper_binary_missing',
  'helper_acl_invalid',
  'helper_task_invalid',
  'helper_task_start_failed',
  'helper_execution_failed'
])

const toAppHelperInstallError = (error: unknown): AppHelperError => {
  if (isAppHelperError(error)) {
    return error
  }
  if (error instanceof LinuxSudoCancelledError) {
    return new AppHelperError('elevation_cancelled', error.message)
  }
  if (error instanceof WindowsSudoError) {
    return new AppHelperError(error.code, error.message, error.stderr)
  }
  if (error instanceof WindowsSudoCommandError) {
    const marker = error.stderr.match(/FLYENV_HELPER_INSTALL_ERROR:([a-z_]+):(.*)/i)
    if (marker && installerErrorCodes.has(marker[1] as AppHelperErrorCode)) {
      return new AppHelperError(marker[1] as AppHelperErrorCode, marker[2].trim(), error.stderr)
    }
    return new AppHelperError('helper_execution_failed', error.message, error.stderr)
  }
  return new AppHelperError(
    'helper_execution_failed',
    error instanceof Error ? error.message : `${error}`
  )
}

const lazySudo: SudoExec = async (...args) => {
  const { exec } = await import('@shared/Sudo')
  return exec(...args)
}

const quoteLinuxShell = (value: string) => `'${value.replace(/'/g, "'\\''")}'`

function checkLinuxInstallSource(file: string) {
  for (let path = file; ; path = dirname(path)) {
    const stat = lstatSync(path)
    if (stat.isSymbolicLink() || stat.uid !== 0 || (stat.mode & 0o022) !== 0) {
      throw new Error(`Linux production installer source must be root-owned and protected: ${path}`)
    }
    if (dirname(path) === path) return
  }
}

const linuxInstallCommand = async (
  script: string,
  bin: string,
  role: string,
  dataPath: string,
  appRoot: string
) => {
  const ca = join(global.Server.BaseDir!, 'CA/FlyEnv-Root-CA.crt')
  const caFingerprint = existsSync(ca)
    ? new X509Certificate(await readFile(ca)).fingerprint256.replace(/:/g, '').toLowerCase()
    : ''
  const args = [script, bin, role, dataPath, appRoot, caFingerprint ? ca : '', caFingerprint]
  return { command: `/bin/bash ${args.map(quoteLinuxShell).join(' ')}`, caFingerprint }
}

type AppHelperDeps = {
  appHelperCheck: typeof AppHelperCheck
  sudo: SudoExec
  installWindows: typeof runWindowsHelperInstaller
  recoverWindowsHelper: () => Promise<boolean>
  windowsDiagnostics: () => Promise<string>
}

const defaultAppHelperDeps: AppHelperDeps = {
  appHelperCheck: AppHelperCheck,
  sudo: lazySudo,
  installWindows: runWindowsHelperInstaller,
  recoverWindowsHelper,
  windowsDiagnostics: async () =>
    readWindowsHelperDiagnostics(await getWindowsHelperIdentity(), getWindowsHelperBinaryPath())
}

export class AppHelper {
  state: 'normal' | 'installing' | 'installed' = 'normal'

  private installation?: Promise<boolean>

  private _onMessage?: AppHelperCallback

  private _onSuduExecSuccess?: CallbackFn

  constructor(private readonly deps: AppHelperDeps = defaultAppHelperDeps) {}

  onStatusMessage(fn: AppHelperCallback) {
    this._onMessage = fn
  }

  onSuduExecSuccess(fn: CallbackFn) {
    this._onSuduExecSuccess = fn
  }

  private emitStatus(
    state: AppHelperMessage['state'],
    reason?: string,
    installationPerformed?: boolean
  ) {
    // 状态通知属于 UI 副作用。窗口销毁/IPC 发送失败不能把已健康的 Helper
    // 判成安装失败，也不能覆盖安装的真实错误或破坏 installation 的 finally。
    try {
      this._onMessage?.({
        state,
        reason,
        // 其他状态保留原字段；此标志是执行结果信息，不是持久的安装状态缓存。
        ...(installationPerformed === undefined ? {} : { installationPerformed })
      })
    } catch (error) {
      void appDebugLog('[AppHelper][status-notify]', String(error)).catch(() => {})
    }
  }

  async command(): Promise<{
    command: string
    icns: string
    windowsScript?: string
    caFingerprint?: string
  }> {
    if (isWindows()) {
      const bin = getWindowsHelperBinaryPath()
      const backupBin = is.production() ? join(dirname(bin), 'flyenv-helper-backup.exe') : bin
      if (!bin || (!windowsHelperBinaryExists() && !existsSync(backupBin))) {
        throw new AppHelperError('helper_binary_missing', `Windows helper binary missing: ${bin}`)
      }
      const tmpl = await readFile(
        join(global.Server.Static!, 'sh/flyenv-auto-start-now.ps1'),
        'utf-8'
      )
      const windowsIdentity = await getWindowsHelperIdentity()
      const windowsScript = buildWindowsHelperInstallScript(tmpl, {
        identity: windowsIdentity,
        executable: windowsHelperInstalledPath(windowsIdentity),
        sourceExecutable: bin,
        backupExecutable: backupBin,
        dataPath: dirname(global.Server.AppDir!),
        helperVersion: HelperVersion
      })
      return { command: '', icns: '', windowsScript }
    }
    if (isLinux()) {
      const account = userInfo()
      const appRoot = PathResolve(global.Server.Static!, '../../../../')
      const helperFile = global.Server.isArmArch
        ? 'flyenv-helper-linux-arm64'
        : 'flyenv-helper-linux-amd64-v1'
      const binary = is.production()
        ? join(appRoot, 'helper/flyenv-helper')
        : PathResolve(global.Server.Static!, '../../../src/helper-go/dist', helperFile)
      const script = is.production()
        ? join(appRoot, 'helper/flyenv-helper-init.sh')
        : join(global.Server.Static!, 'sh/flyenv-helper-init.sh')
      if (is.production()) {
        checkLinuxInstallSource(binary)
        checkLinuxInstallSource(script)
      }
      return {
        ...(await linuxInstallCommand(
          script,
          binary,
          `${account.uid}:${account.gid}`,
          dirname(global.Server.AppDir!),
          appRoot
        )),
        icns: join(appRoot, 'Icon@256x256.icns')
      }
    }
    let command = ''
    let icns = ``

    const tmpDir = join(tmpdir(), uuid())
    const dataPath = dirname(global.Server.AppDir!)
    const appRoot = PathResolve(global.Server.Static!, '../../../../')
    await mkdirp(tmpDir)
    await chmod(tmpDir, '0755')
    if (is.production()) {
      if (isMacOS()) {
        const uinfo = userInfo()
        const role = `${uinfo.uid}:${uinfo.gid}`
        const binDir = PathResolve(global.Server.Static!, '../../../../')
        const plist = join(binDir, 'plist/com.flyenv.helper.plist')
        const bin = join(binDir, 'helper/flyenv-helper')
        const shDir = join(binDir, 'helper')
        const shFile = join(shDir, 'flyenv-helper-init.sh')

        const tmpFile = join(tmpDir, `${uuid()}.sh`)
        await copyFile(shFile, tmpFile)
        await chmod(tmpFile, '0755')

        const tmpPlist = join(tmpDir, `${uuid()}.plist`)
        await copyFile(plist, tmpPlist)
        await chmod(tmpPlist, '0755')

        const tmpBin = join(tmpDir, `${uuid()}.helper`)
        await copyFile(bin, tmpBin)
        await chmod(tmpBin, '0755')

        command = `cd "${tmpDir}" && sudo /bin/zsh ./${basename(tmpFile)} "${tmpPlist}" "${tmpBin}" "${role}" "${dataPath}" "${appRoot}" && sudo rm -rf "${tmpDir}"`
        icns = join(binDir, 'icon.icns')
      }
    } else {
      if (isMacOS()) {
        const uinfo = userInfo()
        const role = `${uinfo.uid}:${uinfo.gid}`
        const helperFile = global.Server.isArmArch
          ? 'flyenv-helper-darwin-arm64'
          : 'flyenv-helper-darwin-amd64'
        const binDir = PathResolve(global.Server.Static!, '../../../build/')
        const plist = join(binDir, 'plist/com.flyenv.helper.plist')
        const bin = PathResolve(binDir, `../src/helper-go/dist/${helperFile}`)
        const shDir = join(global.Server.Static!, 'sh')
        const shFile = join(shDir, 'flyenv-helper-init.sh')

        const tmpFile = join(tmpDir, `${uuid()}.sh`)
        await copyFile(shFile, tmpFile)
        await chmod(tmpFile, '0755')

        const tmpPlist = join(tmpDir, 'com.flyenv.helper.plist')
        await copyFile(plist, tmpPlist)
        await chmod(tmpPlist, '0755')

        const tmpBin = join(tmpDir, helperFile)
        await copyFile(bin, tmpBin)
        await chmod(tmpBin, '0755')

        command = `cd "${tmpDir}" && sudo /bin/zsh ./${basename(tmpFile)} "${tmpPlist}" "${tmpBin}" "${role}" "${dataPath}" "${appRoot}" && sudo rm -rf "${tmpDir}"`
        icns = join(binDir, 'icon.icns')
      }
    }

    return {
      command,
      icns
    }
  }

  needInstall() {
    if (this.state === 'normal') {
      this.emitStatus('needInstall')
    }
  }

  fallbackToUac(reason?: string) {
    this.emitStatus('fallbackToUac', reason)
  }

  initHelper() {
    if (this.installation) return this.installation
    this.state = 'installing'
    this.installation = this.install().finally(() => {
      this.state = 'normal'
      this.installation = undefined
    })
    return this.installation
  }

  /** Verify a terminal installation without starting another authorization request. */
  async verifyHelperReady(): Promise<boolean> {
    await waitForHelperHealth(() => this.deps.appHelperCheck())
    await this.afterHelperReady()
    return true
  }

  private async afterHelperReady() {
    try {
      await this._onSuduExecSuccess?.()
    } catch (callbackError) {
      appDebugLog('[AppHelper][post-ready]', String(callbackError)).catch(() => {})
    }
  }

  private async install(): Promise<boolean> {
    let windowsInstallation = false
    // 每次 initHelper 都会健康检查。仅在本次真正执行安装后记录，恢复已有任务或
    // 已健康直接返回都为 false；后续健康验证失败仍走 catch，不发成功终态。
    let installationPerformed = false
    try {
      let healthy = false
      try {
        await this.deps.appHelperCheck()
        healthy = true
      } catch (error) {
        const reason = toAppHelperInstallError(error)
        appDebugLog('[AppHelper][repair]', `${reason.code}: ${reason.message}`).catch(() => {})
        if (reason.code === 'helper_pipe_unreachable' || reason.code === 'helper_unreachable') {
          try {
            if (await this.deps.recoverWindowsHelper()) {
              await waitForHelperHealth(() => this.deps.appHelperCheck(), { deadlineMs: 10_000 })
              healthy = true
            }
          } catch (recoveryError) {
            appDebugLog('[AppHelper][recover]', String(recoveryError)).catch(() => {})
          }
        }
      }
      if (!healthy) {
        this.emitStatus('needInstall')
        this.emitStatus('installing')
        const { command, icns, windowsScript } = await this.command()
        windowsInstallation = !!windowsScript
        const { stdout, stderr } = windowsScript
          ? await this.deps.installWindows(windowsScript)
          : await this.deps.sudo(command, { name: 'FlyEnv', icns })
        appDebugLog('[AppHelper][install]', `${stdout}\n${stderr}`).catch(() => {})
        installationPerformed = true
        this.state = 'installed'
        await waitForHelperHealth(() => this.deps.appHelperCheck())
      }
      await this.afterHelperReady()
      this.emitStatus('checkSuccess', undefined, installationPerformed)
      return true
    } catch (error) {
      const appError = toAppHelperInstallError(error)
      if (windowsInstallation && appError.code !== 'elevation_uac_cancelled') {
        try {
          const diagnostics = await this.deps.windowsDiagnostics()
          appError.stderr = [appError.message, diagnostics, appError.stderr]
            .filter(Boolean)
            .join('\n')
        } catch {
          /* Keep the original installation error. */
        }
      }
      appDebugLog(
        '[AppHelper][install][error]',
        `${appError.code}: ${appError.message}\n${appError.stderr ?? ''}`
      ).catch(() => {})
      this.emitStatus('installFaild', appError.code)
      throw appError
    }
  }
}

export const createAppHelper = (deps: Partial<AppHelperDeps> = {}) => {
  return new AppHelper({
    ...defaultAppHelperDeps,
    ...deps
  })
}

export default createAppHelper()
