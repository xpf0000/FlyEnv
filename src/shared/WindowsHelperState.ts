export type AppHelperErrorCode =
  | 'helper_binary_missing'
  | 'helper_key_missing'
  | 'helper_key_invalid'
  | 'helper_unreachable'
  | 'helper_pipe_unreachable'
  | 'helper_signature_invalid'
  | 'helper_version_mismatch'
  | 'helper_health_invalid'
  | 'helper_acl_invalid'
  | 'helper_task_invalid'
  | 'helper_task_start_failed'
  | 'helper_start_timeout'
  | 'elevation_uac_cancelled'
  | 'elevation_launch_failed'
  | 'elevation_status_timeout'
  | 'helper_execution_failed'
  | 'windows_fallback_not_supported'

export type WindowsElevationMethod = 'helper' | 'uac'

export const DEFAULT_WINDOWS_ELEVATION_METHOD: WindowsElevationMethod = 'helper'

export const resolveWindowsElevationMethod = (value: unknown): WindowsElevationMethod => {
  return value === 'uac' ? 'uac' : DEFAULT_WINDOWS_ELEVATION_METHOD
}

export type WindowsHelperTransport = 'socket' | 'fallback' | 'prompt' | 'reject'

export type HelperCheckResponse =
  { code: 0; data: true } | { code: 1; data: false; reason: AppHelperErrorCode; stderr?: string }

const APP_HELPER_ERROR_CODES = new Set<AppHelperErrorCode>([
  'helper_binary_missing',
  'helper_key_missing',
  'helper_key_invalid',
  'helper_unreachable',
  'helper_pipe_unreachable',
  'helper_signature_invalid',
  'helper_version_mismatch',
  'helper_health_invalid',
  'helper_acl_invalid',
  'helper_task_invalid',
  'helper_task_start_failed',
  'helper_start_timeout',
  'elevation_uac_cancelled',
  'elevation_launch_failed',
  'elevation_status_timeout',
  'helper_execution_failed',
  'windows_fallback_not_supported'
])

const APP_HELPER_UNAVAILABLE_ERROR_CODES = new Set<AppHelperErrorCode>([
  'helper_binary_missing',
  'helper_key_missing',
  'helper_key_invalid',
  'helper_unreachable',
  'helper_pipe_unreachable',
  'helper_signature_invalid',
  'helper_version_mismatch',
  'helper_health_invalid',
  'helper_acl_invalid',
  'helper_task_invalid',
  'helper_task_start_failed',
  'helper_start_timeout'
])

const FALLBACK_ALLOWLIST = new Set([
  'tools/writeFileByRoot',
  'tools/writeBufferBase64ByRoot',
  'tools/installFlyEnvPowerShellIntegration',
  'tools/ensureFlyEnvDataDirectory',
  'tools/rm',
  'tools/setSystemPath',
  'tools/setSystemEnv',
  'tools/setAutoStartWin',
  'host/sslAddTrustedCert'
])

export class AppHelperError extends Error {
  code: AppHelperErrorCode
  stderr?: string

  constructor(code: AppHelperErrorCode, message: string, stderr?: string) {
    super(message)
    this.name = 'AppHelperError'
    this.code = code
    this.stderr = stderr
  }
}

export const appHelperErrorFromIPC = (payload: unknown): AppHelperError | undefined => {
  if (!payload || typeof payload !== 'object') {
    return undefined
  }
  const { errorCode, msg } = payload as { errorCode?: unknown; msg?: unknown }
  if (
    typeof errorCode !== 'string' ||
    !APP_HELPER_ERROR_CODES.has(errorCode as AppHelperErrorCode)
  ) {
    return undefined
  }
  return new AppHelperError(
    errorCode as AppHelperErrorCode,
    typeof msg === 'string' ? msg : 'App Helper operation failed'
  )
}

export const isAppHelperError = (
  error: unknown,
  code?: AppHelperErrorCode
): error is AppHelperError => {
  if (!(error instanceof AppHelperError)) {
    return false
  }
  if (code) {
    return error.code === code
  }
  return true
}

export const isAppHelperUnavailableError = (error: unknown): error is AppHelperError => {
  return isAppHelperError(error) && APP_HELPER_UNAVAILABLE_ERROR_CODES.has(error.code)
}

export const isWindowsHelperFallbackAllowed = (module: string, fn: string): boolean => {
  return FALLBACK_ALLOWLIST.has(`${module}/${fn}`)
}

export const resolveWindowsHelperTransport = (
  error: unknown,
  module: string,
  fn: string
): WindowsHelperTransport => {
  if (!isAppHelperError(error)) {
    return 'prompt'
  }

  if (error.code === 'helper_binary_missing' && isWindowsHelperFallbackAllowed(module, fn)) {
    return 'fallback'
  }

  if (error.code === 'helper_binary_missing') {
    return 'reject'
  }

  if (error.code === 'helper_execution_failed' || error.code === 'helper_signature_invalid') {
    return 'reject'
  }

  return 'prompt'
}

export const buildHelperCheckResponse = (error: unknown): HelperCheckResponse => {
  if (!error) {
    return { code: 0, data: true }
  }

  if (isAppHelperError(error)) {
    const stderr = error.stderr?.trim()
    return stderr
      ? { code: 1, data: false, reason: error.code, stderr: stderr.slice(0, 4096) }
      : { code: 1, data: false, reason: error.code }
  }

  return { code: 1, data: false, reason: 'helper_execution_failed' }
}

export const shouldOpenHelperInstaller = (reason?: string) => {
  return reason !== 'helper_binary_missing'
}
