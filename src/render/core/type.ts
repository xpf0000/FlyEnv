export enum AppModuleTypeEnum {
  site = 'site',
  webServer = 'webServer',
  dataBaseServer = 'dataBaseServer',
  emailServer = 'emailServer',
  language = 'language',
  dataQueue = 'dataQueue',
  searchEngine = 'searchEngine',
  dnsServer = 'dnsServer',
  ftpServer = 'ftpServer',
  other = 'other',
  objectStorage = 'objectStorage',
  ai = 'ai',
  containerRuntime = 'containerRuntime'
}

export type AllAppModuleType = keyof typeof AppModuleTypeEnum

export const AppModuleTypeList: AllAppModuleType[] = [
  'site',
  'ai',
  'containerRuntime',
  'webServer',
  'language',
  'dataBaseServer',
  'dataQueue',
  'emailServer',
  'dnsServer',
  'ftpServer',
  'searchEngine',
  'objectStorage',
  'other'
]

export enum AppModuleEnum {
  caddy = 'caddy',
  nginx = 'nginx',
  php = 'php',
  mysql = 'mysql',
  mariadb = 'mariadb',
  apache = 'apache',
  memcached = 'memcached',
  redis = 'redis',
  mongodb = 'mongodb',
  postgresql = 'postgresql',
  tomcat = 'tomcat',
  'pure-ftpd' = 'pure-ftpd',
  java = 'java',
  composer = 'composer',
  node = 'node',
  dns = 'dns',
  hosts = 'hosts',
  httpserver = 'httpserver',
  tools = 'tools',
  golang = 'golang',
  rabbitmq = 'rabbitmq',
  python = 'python',
  maven = 'maven',
  mailpit = 'mailpit',
  erlang = 'erlang',
  ruby = 'ruby',
  elasticsearch = 'elasticsearch',
  ollama = 'ollama',
  minio = 'minio',
  rust = 'rust',
  meilisearch = 'meilisearch',
  'ftp-srv' = 'ftp-srv',
  'etcd' = 'etcd',
  'deno' = 'deno',
  'bun' = 'bun',
  'perl' = 'perl',
  consul = 'consul',
  gradle = 'gradle',
  typesense = 'typesense',
  podman = 'podman'
}

export type AllAppModule = keyof typeof AppModuleEnum

type LabelFn = () => string

/**
 * App Module Config
 */
export type AppModuleItem = {
  moduleType?: AllAppModuleType
  typeFlag: AllAppModule
  /**
   * Module label. display in Setup -> Menu Show/Hide & Tray Window
   */
  label?: string | LabelFn
  /**
   * Module icon. display in Tray Window
   */
  icon?: any
  /**
   * App left aside module component
   */
  aside: any
  /**
   * Module sort in app left aside
   */
  asideIndex: number
  /**
   * Module home page
   */
  index: any
  /**
   * If module is a service. can start/stop.
   */
  isService?: boolean
  /**
   * If module show in tray window
   */
  isTray?: boolean

  isOnlyRunOne?: boolean

  platform?: Array<'macOS' | 'Windows' | 'Linux'>
}

type ToolType =
  | 'Crypto'
  | 'Converter'
  | 'Web'
  | 'Images'
  | 'Development'
  | 'Network'
  | 'Math'
  | 'Measurement'
  | 'Text'
  | 'Code'
  | 'Custom'

export const AppToolType: ToolType[] = [
  'Code',
  'Development',
  'Crypto',
  'Converter',
  'Web',
  'Images',
  'Network',
  'Math',
  'Measurement',
  'Text',
  'Custom'
]

/**
 * App Tools Module Item
 */
export type AppToolModuleItem = {
  id: string
  type: ToolType | string
  label: string | LabelFn
  icon: any
  component: any
  index: number
  isCustom?: boolean
}
