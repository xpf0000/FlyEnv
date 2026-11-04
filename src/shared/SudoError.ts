export const PERMISSION_DENIED = 'User did not grant permission.'

export class SudoCancelledError extends Error {
  constructor(
    message: string = PERMISSION_DENIED,
    readonly code: 'elevation_cancelled' | 'elevation_uac_cancelled' = 'elevation_cancelled',
    readonly stderr?: string
  ) {
    super(message)
    this.name = 'SudoCancelledError'
  }
}

export type WindowsSudoErrorCode = 'elevation_launch_failed' | 'elevation_status_timeout'

export class WindowsSudoError extends Error {
  constructor(
    readonly code: WindowsSudoErrorCode,
    message: string,
    readonly stderr?: string
  ) {
    super(message)
    this.name = 'WindowsSudoError'
  }
}

export class WindowsSudoCommandError extends Error {
  constructor(
    readonly exitCode: number,
    message: string,
    readonly stderr: string
  ) {
    super(message)
    this.name = 'WindowsSudoCommandError'
  }
}

export const classifyWindowsElevationError = (
  error: unknown
): WindowsSudoError | SudoCancelledError => {
  const message = error instanceof Error ? error.message : `${error}`
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  if (
    code === '1223' ||
    /\b1223\b|operation was cancel(?:ed|led)|user cancel(?:ed|led)/i.test(message)
  ) {
    return new SudoCancelledError(PERMISSION_DENIED, 'elevation_uac_cancelled', message)
  }
  return new WindowsSudoError(
    'elevation_launch_failed',
    `Failed to launch elevated PowerShell: ${message}`,
    message
  )
}
