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

export type AppModuleItem = {
  typeFlag: AllAppModule
  label?: string | LabelFn
  icon?: any
  aside?: any
  asideIndex?: number
  index?: any
  setup?: any
  isService?: boolean
  isTray?: boolean
}
