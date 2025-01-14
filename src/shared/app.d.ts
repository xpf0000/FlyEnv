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
}

export interface AppHostReverseProxyItem {
  path: string
  url: string
}

export interface AppHost {
  id: number
  reverseProxy?: AppHostReverseProxyItem[]
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
    tomcat?: number
    tomcat_ssl?: number
  }
  nginx: {
    rewrite: string
  }
  url: string
  root: string
  phpVersion?: number
  mark?: string
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
