export type AppHelperErrorCode =
  | 'helper_binary_missing'
  | 'helper_unreachable'
  | 'helper_version_mismatch'
  | 'helper_execution_failed'
  | 'windows_fallback_not_supported'

export type WindowsHelperTransport = 'socket' | 'fallback' | 'prompt' | 'reject'

export type HelperCheckResponse =
  | { code: 0; data: true }
  | { code: 1; data: false; reason: AppHelperErrorCode }

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

  constructor(code: AppHelperErrorCode, message: string) {
    super(message)
    this.name = 'AppHelperError'
    this.code = code
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
    return { code: 1, data: false, reason: error.code }
  }

  return { code: 1, data: false, reason: 'helper_execution_failed' }
}

export const shouldOpenHelperInstaller = (reason?: string) => {
  return reason !== 'helper_binary_missing'
}
