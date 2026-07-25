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

export type WindowsHelperTransport = 'socket' | 'fallback' | 'prompt' | 'reject'

export type HelperCheckResponse =
  | { code: 0; data: true }
  | { code: 1; data: false; reason: AppHelperErrorCode; stderr?: string }

const FALLBACK_ALLOWLIST = new Set([
  'tools/writeFileByRoot',
  'tools/writeBufferBase64ByRoot',
  'tools/rm',
  'tools/setSystemPath',
  'tools/setSystemEnv',
  'tools/setAutoStartWin',
  'host/sslAddTrustedCert'
])

const FALLBACK_ERROR_CODES = new Set<AppHelperErrorCode>([
  'helper_execution_failed'
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

  if (isWindowsHelperFallbackAllowed(module, fn) && FALLBACK_ERROR_CODES.has(error.code)) {
    return 'fallback'
  }

  if (error.code === 'helper_binary_missing') {
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
