export type DamengSettings = {
  port: number
  pageSize: 4 | 8 | 16 | 32
  extentSize: 16 | 32 | 64
  charset: 0 | 1 | 2
  caseSensitive: boolean
  bufferMB: number
  logSizeMB: number
}

export type DamengCredentials = { sysdbaPassword: string; auditorPassword: string }
export type DamengInitParams = DamengSettings & DamengCredentials
export type DamengInitResult = { initialized: true; resumed: boolean }
export type DamengInstallPath = { programDir: string; bin: string }
export type DamengInstallResult = DamengInstallPath & {
  installed: true
  installError?: string
  warning?: string
}

export const DAMENG_LIMITS = {
  port: { min: 1024, max: 65534 },
  bufferMB: { min: 8, max: 4096 },
  logSizeMB: { min: 256, max: 8192 },
  pageSizes: [4, 8, 16, 32],
  extentSizes: [16, 32, 64],
  charsets: [0, 1, 2]
} as const

export const DAMENG_INITIAL_STORAGE = {
  tablespaceMB: 128,
  tablespaceCount: 3,
  redoLogCount: 2
} as const

export const validateDamengSettings = (value: DamengSettings): void => {
  for (const key of ['port', 'bufferMB', 'logSizeMB'] as const) {
    const { min, max } = DAMENG_LIMITS[key]
    if (!Number.isInteger(value[key]) || value[key] < min || value[key] > max) {
      throw new Error(`Invalid Dameng initialization setting: ${key}`)
    }
  }
  if (
    !DAMENG_LIMITS.pageSizes.includes(value.pageSize) ||
    !DAMENG_LIMITS.extentSizes.includes(value.extentSize) ||
    !DAMENG_LIMITS.charsets.includes(value.charset) ||
    typeof value.caseSensitive !== 'boolean'
  )
    throw new Error('Invalid Dameng initialization settings')
}

export const defaultDamengSettings = (): DamengSettings => ({
  port: 5236,
  pageSize: 8,
  extentSize: 16,
  charset: 1,
  caseSensitive: true,
  bufferMB: 256,
  logSizeMB: 256
})

export type DamengVersionItem = {
  id: string
  name: string
  version: string
  url: string
  appDir: string
  bin: string
  zip: string
  downloaded: boolean
  installed: boolean
  registrationPending?: boolean
  downing: boolean
  progress?: number
  downState?: string
  disabled?: boolean
  note?: string
  typeFlag?: string
}

export type DamengRuntime = {
  installId: string
  initialized: boolean
  initializationCompleted?: boolean
  dataDir: string
  configFile: string
  logFile: string
  serviceName: string
  port: number
}

export type DamengInstanceInfo = {
  initialized: boolean
  version: string
  configFile: string
  logFile: string
  expiredDate?: string
  licenseError?: string
}
