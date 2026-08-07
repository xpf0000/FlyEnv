import type { AppServerCurrent } from '@/store/app'
import type { AllAppModule } from '@/core/type'

export interface SoftInstalled {
  typeFlag: AllAppModule
  version: string | null
  bin: string
  path: string
  num: number | null
  error?: string
  enable: boolean
  run: boolean
  running: boolean
  phpBin?: string
  phpConfig?: string
  phpize?: string
  flag?: string
  pid?: string
  note?: string
  isLocal7Z?: boolean
  rootPassword?: string
}

export interface AppHostReverseProxyItem {
  path: string
  url: string
}

export interface CronJob {
  id: string
  hostId?: number
  scope?: 'host' | 'global'
  name: string
  command: string
  schedule: string
  enabled: boolean
  description?: string
  workDir?: string
  lastRunTime?: number
  nextRunTime?: number
  lastOutput?: string
  lastError?: string
  lastExitCode?: number
  systemRegistered?: boolean
  systemTaskName?: string
  systemError?: string
  createdAt: number
  updatedAt: number
}

export interface CronRunRecord {
  id: string
  jobId: string
  hostId?: number
  scope?: 'host' | 'global'
  startedAt: number
  finishedAt: number
  duration: number
  exitCode: number
  output?: string
  error?: string
  outputBase64?: string
  errorBase64?: string
}

export interface SystemScheduledTask {
  id: string
  platform: 'windows' | 'unix'
  name: string
  fullName: string
  path?: string
  schedule?: string
  command?: string
  nextRunTime?: number
  state?: string
  enabled?: boolean
  description?: string
  author?: string
  isFlyEnv?: boolean
  jobId?: string
  raw?: string
}

export interface AppHost {
  id: number
  reverseProxy?: AppHostReverseProxyItem[]
  cronJobs?: CronJob[]
  type?: string
  isTop?: boolean
  isSorting?: boolean
  projectName?: string
  projectPort?: number
  startCommand?: string
  subType?: string
  envVarType?: string
  envVar?: string
  jdkDir?: string
  jarDir?: string
  tomcatDir?: string
  nodeDir?: string
  pythonDir?: string
  bin?: string
  envFile: string
  name: string
  alias: string
  useSSL: boolean
  autoSSL: boolean
  ssl: {
    cert: string
    key: string
  }
  port: {
    nginx: number
    nginx_ssl: number
    apache: number
    apache_ssl: number
    caddy: number
    caddy_ssl: number
    frankenphp?: number
    frankenphp_ssl?: number
    tomcat?: number
    tomcat_ssl?: number
  }
  nginx: {
    rewrite: string
  }
  url: string
  root: string
  phpVersion?: number
  phpVersionFull?: string
  mark?: string
  bookmark?: string
}

export interface FtpItem {
  user: string
  pass: string
  dir: string
  disabled: boolean
  mark: string
}

export interface AIChatItem {
  user: 'ai' | 'user'
  content: string
  action?: 'ChooseSiteRoot' | 'SiteAccessIssues'
  actionEnd?: boolean
}

export interface MysqlGroupItem {
  id: string
  version: AppServerCurrent
  port: number | string
  dataDir: string
}

export interface OnlineVersionItem {
  url: string
  version: string
  mVersion: string
}

export type AppServiceAliasItem = {
  id: string
  php?: {
    bin: string
    version: string
  }
  name: string
}

export type ModuleExecItem = {
  id: string
  name: string
  comment: string
  command: string
  commandFile: string
  commandType: 'command' | 'file'
  isSudo?: boolean
  pidPath?: string
  workDir?: string
  env: Record<string, string>
  binBin: string
}

export type ExecResult = {
  stdout: string
  stderr: string
}

export type CallbackFn = (...args: any) => void
