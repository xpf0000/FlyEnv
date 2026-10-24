import { join, resolve as PathResolve, dirname } from 'node:path'
import is from 'electron-is'
import { appDebugLog, isLinux, isMacOS, isWindows } from '@shared/utils'
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
  isAppHelperError,
  isAppHelperUnavailableError
} from '@shared/WindowsHelperState'
import {
  getWindowsHelperIdentity,
  buildWindowsHelperInstallScript,
  readWindowsHelperDiagnostics,
  windowsHelperInstalledPath
} from '@shared/WindowsHelperIdentity'
import { runWindowsHelperInstaller } from './WindowsHelperInstaller'
import { SudoCancelledError, WindowsSudoError } from '@shared/SudoError'
import { userInfo } from 'node:os'
import { existsSync, readFile } from '@shared/fs-extra'
import type { CallbackFn } from '@shared/app'
import { statSync, realpathSync } from 'node:fs'

type AppHelperMessage = {
  state:
    'needInstall' | 'installing' | 'installed' | 'installFaild' | 'checkSuccess' | 'fallbackToUac'
  reason?: string
  stderr?: string
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
  'helper_signature_invalid',
  'helper_version_mismatch',
  'helper_acl_invalid',
  'helper_task_invalid',
  'helper_task_start_failed',
  'helper_execution_failed'
])

const toAppHelperInstallError = (error: unknown): AppHelperError => {
  if (isAppHelperError(error)) {
    return error
  }
  const message = error instanceof Error ? error.message : `${error}`
  if (error instanceof SudoCancelledError) {
    return new AppHelperError(error.code, message, error.stderr)
  }
  if (error instanceof WindowsSudoError) {
    return new AppHelperError(error.code, error.message, error.stderr)
  }
  const rawStderr = (error as { stderr?: unknown } | null)?.stderr
  const stderr = typeof rawStderr === 'string' ? rawStderr : undefined
  // The existing macOS Sudo applet includes stderr in Error.message.
  const diagnostic = stderr ?? message
  const marker = diagnostic.match(/FLYENV_HELPER_INSTALL_ERROR:([a-z_]+):(.*)/i)
  if (marker && installerErrorCodes.has(marker[1] as AppHelperErrorCode)) {
    return new AppHelperError(
      marker[1] as AppHelperErrorCode,
      marker[2].trim(),
      stderr ?? diagnostic.slice(marker.index)
    )
  }
  return new AppHelperError('helper_execution_failed', message, stderr)
}

const lazySudo: SudoExec = async (...args) => {
  const { exec } = await import('@shared/Sudo')
  try {
    return await exec(...args)
  } catch (error) {
    // The macOS applet embeds the command and stderr in its error message.
    const prefix = `Command failed: ${args[0]}\n`
    if (isMacOS() && error instanceof Error && error.message.startsWith(prefix)) {
      Object.assign(error, { stderr: error.message.slice(prefix.length) })
    }
    throw error
  }
}

const quoteLinuxShell = (value: string) => `'${value.replace(/'/g, "'\\''")}'`

function checkLinuxInstallSource(file: string, appRoot: string) {
  if (!file.startsWith(`${appRoot}/`)) throw new Error('Invalid FlyEnv installer resource path')
  if (!statSync(file).isFile()) throw new Error(`Invalid FlyEnv installer resource: ${file}`)
}

const linuxInstallCommand = (
  script: string,
  bin: string,
  role: string,
  dataPath: string,
  appRoot: string
) => {
  const args = [script, bin, role, dataPath, appRoot]
  return { command: `/bin/bash ${args.map(quoteLinuxShell).join(' ')}` }
}

// Verify the source application in place, then stage only the three installer
// resources. Byte copies avoid importing Finder flags, ACLs and quarantine.
export const macOSHelperBootstrap = `set -eu
umask 077
mode="$1"
source="$2"
role="$6"
data="$7"
# Resolve the fixed staging location; system parent permissions are user-managed.
for parent in / /private /private/var /private/var/root; do
  [ -d "$parent" ] && [ ! -L "$parent" ] || { echo 'FLYENV_HELPER_INSTALL_ERROR:helper_acl_invalid:Invalid staging parent' >&2; exit 1; }
done
stage=$(/usr/bin/mktemp -d /private/var/root/flyenv-helper-install.XXXXXXXX)
trap '/bin/rm -rf "$stage"' EXIT HUP INT TERM
# This newly created staging directory is private to the elevated operation.
# Remove inherited ACLs before creating the files that will run as root.
/bin/chmod -N "$stage"
if [ "$mode" = production ]; then
  resources="$source/Contents/Resources"
  for path in "$source" "$source/Contents" "$resources" "$resources/helper" "$resources/plist" "$resources/helper/flyenv-helper-init.sh" "$resources/helper/flyenv-helper" "$resources/plist/com.flyenv.helper.plist"; do
    [ ! -L "$path" ] || { echo 'FLYENV_HELPER_INSTALL_ERROR:helper_signature_invalid:Symlink in installer resource path' >&2; exit 1; }
  done
  /usr/bin/codesign --verify --deep --strict --all-architectures -R '=identifier "phpstudy.xpfme.com" and anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] and certificate leaf[field.1.2.840.113635.100.6.1.13] and certificate leaf[subject.OU] = "956BZQ2F2P"' "$source" || { echo 'FLYENV_HELPER_INSTALL_ERROR:helper_signature_invalid:FlyEnv application signature or resources are invalid. Use an officially signed build.' >&2; exit 1; }
  [ "$(/usr/libexec/PlistBuddy -c 'Print :FlyEnvHelperProtocolVersion' "$source/Contents/Info.plist")" = ${HelperVersion} ] || { echo 'FLYENV_HELPER_INSTALL_ERROR:helper_version_mismatch:Unsupported signed helper installation protocol' >&2; exit 1; }
  binary_source="$resources/helper/flyenv-helper"
  installer_source="$resources/helper/flyenv-helper-init.sh"
  plist_source="$resources/plist/com.flyenv.helper.plist"
elif [ "$mode" = development ]; then
  echo 'Explicit administrator development installation: unsigned helper and installer.' >&2
  binary_source="$3"
  installer_source="$4"
  plist_source="$5"
else
  echo 'Invalid installer mode' >&2
  exit 1
fi
binary="$stage/flyenv-helper"
installer="$stage/flyenv-helper-init.sh"
plist="$stage/com.flyenv.helper.plist"
for file in "$binary_source" "$installer_source" "$plist_source"; do
  [ -f "$file" ] && [ ! -L "$file" ] || { echo 'Invalid installer resource' >&2; exit 1; }
done
/bin/cat "$binary_source" > "$binary"
/bin/cat "$installer_source" > "$installer"
/bin/cat "$plist_source" > "$plist"
/bin/chmod 0700 "$stage" "$binary"
/usr/bin/xattr -dr com.apple.quarantine "$binary" "$installer" "$plist"
if [ "$mode" = production ]; then
  /usr/bin/codesign --verify --strict --all-architectures -R '=identifier "flyenv-helper" and anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] and certificate leaf[field.1.2.840.113635.100.6.1.13] and certificate leaf[subject.OU] = "956BZQ2F2P"' "$binary" || { echo 'FLYENV_HELPER_INSTALL_ERROR:helper_signature_invalid:FlyEnv helper signature is invalid. Use an officially signed build.' >&2; exit 1; }
fi
/bin/sh "$installer" "$binary" "$plist" "$role" "$data"
`

type MacOSHelperInstallOptions = {
  mode: 'production' | 'development'
  source: string
  binary: string
  installer: string
  plist: string
  role: string
  dataRoot: string
}

export function buildMacOSHelperInstallCommand(options: MacOSHelperInstallOptions): string {
  const args = [
    options.mode,
    options.source,
    options.binary,
    options.installer,
    options.plist,
    options.role,
    options.dataRoot
  ]
  return `/usr/bin/sudo /usr/bin/env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin /bin/sh -c ${quoteLinuxShell(macOSHelperBootstrap)} flyenv-helper-bootstrap ${args.map(quoteLinuxShell).join(' ')}`
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
    readWindowsHelperDiagnostics(await getWindowsHelperIdentity(), HelperVersion)
}

export class AppHelper {
  state: 'normal' | 'installing' | 'installed' = 'normal'

  private installation?: Promise<boolean>
  private preparation?: Promise<boolean>
  private terminalInstallation = false

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
    installationPerformed?: boolean,
    stderr?: string
  ) {
    // 状态通知属于 UI 副作用。窗口销毁/IPC 发送失败不能把已健康的 Helper
    // 判成安装失败，也不能覆盖安装的真实错误或破坏 installation 的 finally。
    try {
      this._onMessage?.({
        state,
        reason,
        ...(stderr ? { stderr } : {}),
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
        checkLinuxInstallSource(binary, appRoot)
        checkLinuxInstallSource(script, appRoot)
      }
      return {
        ...linuxInstallCommand(
          script,
          binary,
          `${account.uid}:${account.gid}`,
          dirname(global.Server.AppDir!),
          appRoot
        ),
        icns: join(appRoot, 'Icon@256x256.icns')
      }
    }
    if (isMacOS()) {
      const account = userInfo()
      const production = is.production()
      const appRoot = PathResolve(global.Server.Static!, '../../../../')
      const helperFile = global.Server.isArmArch
        ? 'flyenv-helper-darwin-arm64'
        : 'flyenv-helper-darwin-amd64'
      return {
        command: buildMacOSHelperInstallCommand({
          mode: production ? 'production' : 'development',
          source: production ? dirname(dirname(appRoot)) : '',
          binary: production
            ? ''
            : PathResolve(global.Server.Static!, '../../../src/helper-go/dist', helperFile),
          installer: production ? '' : join(global.Server.Static!, 'sh/flyenv-helper-init.sh'),
          plist: production
            ? ''
            : PathResolve(global.Server.Static!, '../../../build/plist/com.flyenv.helper.plist'),
          role: `${account.uid}:${account.gid}`,
          dataRoot: realpathSync(dirname(global.Server.AppDir!))
        }),
        icns: production
          ? join(appRoot, 'icon.icns')
          : PathResolve(global.Server.Static!, '../../../build/Icon.icns')
      }
    }
    throw new Error('Unsupported helper installer platform')
  }

  needInstall(reason?: string) {
    if (this.state === 'normal') {
      this.emitStatus('needInstall', reason)
    }
  }

  fallbackToUac(reason?: string) {
    this.emitStatus('fallbackToUac', reason)
  }

  initHelper() {
    return this.startInstallation(() => this.install())
  }

  /** 业务请求只能检查/恢复已有实例；安装必须由 renderer 确认后的安装 IPC 发起。 */
  ensureReady(): Promise<boolean> {
    if (this.installation) return this.installation
    if (this.preparation) return this.preparation
    this.preparation = this.checkOrRecover()
      .then(() => true)
      .catch((error) => {
        const reason = toAppHelperInstallError(error)
        if (isAppHelperUnavailableError(reason)) this.needInstall(reason.code)
        // 当前业务未完成，保留失败；通知不能隐式批准安装或重放业务动作。
        throw reason
      })
      .finally(() => {
        this.preparation = undefined
      })
    return this.preparation
  }

  /** The main process retains ownership through actual terminal exit and health. */
  installInTerminal(
    execute: (options: Awaited<ReturnType<AppHelper['command']>>) => Promise<void>
  ) {
    return this.startInstallation(async () => {
      try {
        const options = await this.command()
        await execute(options)
        return await this.verifyHelperReady()
      } catch (error) {
        void appDebugLog(
          '[AppHelper][terminal-install][error]',
          error instanceof Error ? (error.stack ?? error.message) : String(error)
        ).catch(() => {})
        throw error
      }
    }, true)
  }

  private startInstallation(run: () => Promise<boolean>, terminal = false): Promise<boolean> {
    if (this.installation) {
      if (!terminal && !this.terminalInstallation) return this.installation
      return Promise.reject(new Error('FlyEnv helper installation is already in progress'))
    }
    this.state = 'installing'
    this.terminalInstallation = terminal
    this.installation = run().finally(() => {
      this.state = 'normal'
      this.terminalInstallation = false
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

  private async checkOrRecover(): Promise<void> {
    try {
      await this.deps.appHelperCheck()
    } catch (error) {
      const reason = toAppHelperInstallError(error)
      appDebugLog('[AppHelper][repair]', `${reason.code}: ${reason.message}`).catch(() => {})
      if (reason.code === 'helper_pipe_unreachable' || reason.code === 'helper_unreachable') {
        try {
          if (await this.deps.recoverWindowsHelper()) {
            await waitForHelperHealth(() => this.deps.appHelperCheck(), { deadlineMs: 10_000 })
            return
          }
        } catch (recoveryError) {
          appDebugLog('[AppHelper][recover]', String(recoveryError)).catch(() => {})
        }
      }
      throw reason
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
        await this.checkOrRecover()
        healthy = true
      } catch {
        // 只有明确的安装入口才可在检查/恢复失败后继续执行提权安装。
      }
      if (!healthy) {
        this.emitStatus('needInstall')
        this.emitStatus('installing')
        const { command, icns, windowsScript } = await this.command()
        windowsInstallation = !!windowsScript
        const { stdout, stderr } = windowsScript
          ? await this.deps.installWindows(windowsScript)
          : await this.deps.sudo(command, { name: 'FlyEnv', ...(icns ? { icns } : {}) })
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
        [
          `${appError.code}: ${appError.message}`,
          appError.stderr,
          error instanceof Error ? error.stack : String(error)
        ]
          .filter(Boolean)
          .join('\n')
      ).catch(() => {})
      this.emitStatus('installFaild', appError.code, undefined, appError.stderr ?? appError.message)
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
