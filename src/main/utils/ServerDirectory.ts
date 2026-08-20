export type DirectoryCreator = (directory: string) => Promise<unknown>

export type DirectoryPermissionRecoveryResult =
  'recovered' | 'helper-unavailable' | 'helper-binary-missing' | 'failed'

export type DirectoryPermissionFailureReason = Exclude<
  DirectoryPermissionRecoveryResult,
  'recovered'
>

export type BaseDirectoryOptions = {
  createDirectory: DirectoryCreator
  isWindows: () => boolean
  recoverPermissionDenied?: () => Promise<DirectoryPermissionRecoveryResult>
  onPermissionDenied?: (reason: DirectoryPermissionFailureReason) => void
}

export const isDirectoryPermissionError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false
  }
  const code = (error as NodeJS.ErrnoException).code
  return code === 'EACCES' || code === 'EPERM'
}

export const createBaseDirectories = async (
  directories: Array<string | undefined>,
  options: BaseDirectoryOptions
): Promise<boolean> => {
  let recoveryAttempted = false
  for (const directory of directories.filter((directory): directory is string =>
    Boolean(directory)
  )) {
    try {
      await options.createDirectory(directory)
    } catch (error) {
      if (options.isWindows() && isDirectoryPermissionError(error)) {
        if (!recoveryAttempted && options.recoverPermissionDenied) {
          recoveryAttempted = true
          let recovery: DirectoryPermissionRecoveryResult = 'failed'
          try {
            recovery = await options.recoverPermissionDenied()
          } catch (recoveryError) {
            console.warn('[ServerDirectory] Helper data-root recovery failed', recoveryError)
          }
          if (recovery === 'recovered') {
            try {
              await options.createDirectory(directory)
              continue
            } catch (retryError) {
              if (!isDirectoryPermissionError(retryError)) {
                continue
              }
            }
            recovery = 'failed'
          }
          options.onPermissionDenied?.(recovery)
          return false
        }
        options.onPermissionDenied?.('helper-unavailable')
        return false
      }
    }
  }
  return true
}

export const createDeferredHelperInstallRequest = (
  requestInstall: () => void,
  reportFailure?: (reason: DirectoryPermissionFailureReason) => void
) => {
  let permissionDenied: DirectoryPermissionFailureReason | undefined
  let ready = false
  let requested = false
  let failureReported = false

  const requestWhenReady = () => {
    if (!permissionDenied || !ready) {
      return
    }
    if (permissionDenied === 'helper-unavailable') {
      if (requested) {
        return
      }
      requested = true
      requestInstall()
      return
    }
    if (failureReported) {
      return
    }
    failureReported = true
    reportFailure?.(permissionDenied)
  }

  return {
    notifyPermissionDenied: (reason: DirectoryPermissionFailureReason = 'helper-unavailable') => {
      permissionDenied = reason
      requestWhenReady()
    },
    resetRequest: () => {
      requested = false
      failureReported = false
      permissionDenied = undefined
    },
    markReady: () => {
      ready = true
      requestWhenReady()
    }
  }
}
