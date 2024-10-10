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
  tools = 'tools'
}

export type AllAppModule = keyof typeof AppModuleEnum

type LabelFn = () => string

/**
 * App Module Config
 */
export type AppModuleItem = {
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
  | 'Custom'

export const AppToolType: ToolType[] = [
  'Crypto',
  'Converter',
  'Web',
  'Images',
  'Development',
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
  isCustom: boolean
}
