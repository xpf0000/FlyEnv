import { ProcessSendError, ProcessSendLog, ProcessSendSuccess } from './Fn'
import { isWindows } from '@shared/utils'

class BaseManager {
  Apache: any
  Nginx: any
  Php: any
  Host: any
  Mysql: any
  Redis: any
  Memcached: any
  Mongodb: any
  Mariadb: any
  Postgresql: any
  PureFtpd: any
  Node: any
  Brew: any
  Version: any
  Tool: any
  MacPorts: any
  Caddy: any
  Composer: any
  Java: any
  Tomcat: any
  App: any
  GoLang: any
  RabbitMQ: any
  Python: any
  Maven: any
  Service: any
  MailPit: any
  Erlang: any
  Ruby: any
  Elasticsearch: any
  Ollama: any
  Ai: any
  Minio: any
  Rust: any
  MeiliSearch: any
  ModuleCustomer: any
  FTPSrv: any
  ETCD: any
  Deno: any
  Bun: any
  Perl: any
  DNS: any
  Code: any
  Consul: any
  Gradle: any
  Typesense: any
  Project: any
  Podman: any

  modules: Set<string> = new Set()

  constructor() {}

  init() {}

  async exec(commands: Array<any>) {
    const ipcCommandKey = commands.shift()
    const then = (res: any) => {
      ProcessSendSuccess(ipcCommandKey, res)
      const memoryUsage = process.memoryUsage()
      console.log({
        modules: Array.from(this.modules),
        rss: `${Math.round((memoryUsage.rss / 1024 / 1024) * 100) / 100} MB`, // 常驻内存
        heapTotal: `${Math.round((memoryUsage.heapTotal / 1024 / 1024) * 100) / 100} MB`, // 堆内存总量
        heapUsed: `${Math.round((memoryUsage.heapUsed / 1024 / 1024) * 100) / 100} MB`, // 已用堆内存
        external: `${Math.round((memoryUsage.external / 1024 / 1024) * 100) / 100} MB`, // 外部内存
        arrayBuffers: `${Math.round((memoryUsage.arrayBuffers / 1024 / 1024) * 100) / 100} MB` // ArrayBuffer内存
      })
    }
    const error = (e: Error) => {
      ProcessSendError(ipcCommandKey, e.toString())
      const memoryUsage = process.memoryUsage()
      console.log({
        modules: Array.from(this.modules),
        rss: `${Math.round((memoryUsage.rss / 1024 / 1024) * 100) / 100} MB`, // 常驻内存
        heapTotal: `${Math.round((memoryUsage.heapTotal / 1024 / 1024) * 100) / 100} MB`, // 堆内存总量
        heapUsed: `${Math.round((memoryUsage.heapUsed / 1024 / 1024) * 100) / 100} MB`, // 已用堆内存
        external: `${Math.round((memoryUsage.external / 1024 / 1024) * 100) / 100} MB`, // 外部内存
        arrayBuffers: `${Math.round((memoryUsage.arrayBuffers / 1024 / 1024) * 100) / 100} MB` // ArrayBuffer内存
      })
    }
    const onData = (log: string) => {
      ProcessSendLog(ipcCommandKey, log)
    }

    const module: string = commands.shift()
    const fn: string = commands.shift()

    this.modules.add(module)

    const doRun = (module: any) => {
      module?.init?.()
      module
        .exec(fn, ...commands)
        ?.on(onData)
        ?.then(then)
        ?.catch(error)
    }

    if (module === 'apache') {
      if (!this.Apache) {
        const res = await import('./module/Apache')
        this.Apache = res.default
      }
      doRun(this.Apache)
    } else if (module === 'nginx') {
      if (!this.Nginx) {
        const res = await import('./module/Nginx')
        this.Nginx = res.default
      }
      doRun(this.Nginx)
    } else if (module === 'php') {
      if (!this.Php) {
        if (isWindows()) {
          const res = await import('./module/Php.win')
          this.Php = res.default
        } else {
          const res = await import('./module/Php')
          this.Php = res.default
        }
      }
      doRun(this.Php)
    } else if (module === 'host') {
      if (!this.Host) {
        const res = await import('./module/Host')
        this.Host = res.default
      }
      doRun(this.Host)
    } else if (module === 'mysql') {
      if (!this.Mysql) {
        const res = await import('./module/Mysql')
        this.Mysql = res.default
      }
      doRun(this.Mysql)
    } else if (module === 'redis') {
      if (!this.Redis) {
        const res = await import('./module/Redis')
        this.Redis = res.default
      }
      doRun(this.Redis)
    } else if (module === 'memcached') {
      if (!this.Memcached) {
        const res = await import('./module/Memcached')
        this.Memcached = res.default
      }
      doRun(this.Memcached)
    } else if (module === 'mongodb') {
      if (!this.Mongodb) {
        const res = await import('./module/Mongodb')
        this.Mongodb = res.default
      }
      doRun(this.Mongodb)
    } else if (module === 'mariadb') {
      if (!this.Mariadb) {
        const res = await import('./module/Mariadb')
        this.Mariadb = res.default
      }
      doRun(this.Mariadb)
    } else if (module === 'postgresql') {
      if (!this.Postgresql) {
        const res = await import('./module/Postgresql')
        this.Postgresql = res.default
      }
      doRun(this.Postgresql)
    } else if (module === 'pure-ftpd') {
      if (!this.PureFtpd) {
        const res = await import('./module/PureFtpd')
        this.PureFtpd = res.default
      }
      doRun(this.PureFtpd)
    } else if (module === 'node') {
      if (!this.Node) {
        if (isWindows()) {
          const res = await import('./module/Node.win')
          this.Node = res.default
        } else {
          const res = await import('./module/Node')
          this.Node = res.default
        }
      }
      doRun(this.Node)
    } else if (module === 'brew') {
      if (!this.Brew) {
        const res = await import('./module/Brew')
        this.Brew = res.default
      }
      doRun(this.Brew)
    } else if (module === 'version') {
      if (!this.Version) {
        const res = await import('./module/Version')
        this.Version = res.default
      }
      doRun(this.Version)
    } else if (module === 'tools') {
      if (!this.Tool) {
        if (isWindows()) {
          const res = await import('./module/Tool.win')
          this.Tool = res.default
        } else {
          const res = await import('./module/Tool')
          this.Tool = res.default
        }
      }
      doRun(this.Tool)
    } else if (module === 'macports') {
      if (!this.MacPorts) {
        const res = await import('./module/MacPorts')
        this.MacPorts = res.default
      }
      doRun(this.MacPorts)
    } else if (module === 'caddy') {
      if (!this.Caddy) {
        const res = await import('./module/Caddy')
        this.Caddy = res.default
      }
      doRun(this.Caddy)
    } else if (module === 'composer') {
      if (!this.Composer) {
        const res = await import('./module/Composer')
        this.Composer = res.default
      }
      doRun(this.Composer)
    } else if (module === 'java') {
      if (!this.Java) {
        const res = await import('./module/Java')
        this.Java = res.default
      }
      doRun(this.Java)
    } else if (module === 'tomcat') {
      if (!this.Tomcat) {
        const res = await import('./module/Tomcat')
        this.Tomcat = res.default
      }
      doRun(this.Tomcat)
    } else if (module === 'app') {
      if (!this.App) {
        const res = await import('./module/App')
        this.App = res.default
      }
      doRun(this.App)
    } else if (module === 'golang') {
      if (!this.GoLang) {
        const res = await import('./module/GoLang')
        this.GoLang = res.default
      }
      doRun(this.GoLang)
    } else if (module === 'rabbitmq') {
      if (!this.RabbitMQ) {
        const res = await import('./module/RabbitMQ')
        this.RabbitMQ = res.default
      }
      doRun(this.RabbitMQ)
    } else if (module === 'python') {
      if (!this.Python) {
        const res = await import('./module/Python')
        this.Python = res.default
      }
      doRun(this.Python)
    } else if (module === 'maven') {
      if (!this.Maven) {
        const res = await import('./module/Maven')
        this.Maven = res.default
      }
      doRun(this.Maven)
    } else if (module === 'service') {
      if (!this.Service) {
        const res = await import('./module/Service')
        this.Service = res.default
      }
      doRun(this.Service)
    } else if (module === 'mailpit') {
      if (!this.MailPit) {
        const res = await import('./module/MailPit')
        this.MailPit = res.default
      }
      doRun(this.MailPit)
    } else if (module === 'erlang') {
      if (!this.Erlang) {
        const res = await import('./module/Erlang')
        this.Erlang = res.default
      }
      doRun(this.Erlang)
    } else if (module === 'ruby') {
      if (!this.Ruby) {
        const res = await import('./module/Ruby')
        this.Ruby = res.default
      }
      doRun(this.Ruby)
    } else if (module === 'elasticsearch') {
      if (!this.Elasticsearch) {
        const res = await import('./module/Elasticsearch')
        this.Elasticsearch = res.default
      }
      doRun(this.Elasticsearch)
    } else if (module === 'ollama') {
      if (!this.Ollama) {
        const res = await import('./module/Ollama')
        this.Ollama = res.default
      }
      doRun(this.Ollama)
    } else if (module === 'ai') {
      if (!this.Ai) {
        const res = await import('./module/Ai')
        this.Ai = res.default
      }
      doRun(this.Ai)
    } else if (module === 'minio') {
      if (!this.Minio) {
        const res = await import('./module/Minio')
        this.Minio = res.default
      }
      doRun(this.Minio)
    } else if (module === 'rust') {
      if (!this.Rust) {
        const res = await import('./module/Rust')
        this.Rust = res.default
      }
      doRun(this.Rust)
    } else if (module === 'meilisearch') {
      if (!this.MeiliSearch) {
        const res = await import('./module/MeiliSearch')
        this.MeiliSearch = res.default
      }
      doRun(this.MeiliSearch)
    } else if (module === 'module-customer') {
      if (!this.ModuleCustomer) {
        const res = await import('./module/ModuleCustomer')
        this.ModuleCustomer = res.default
      }
      doRun(this.ModuleCustomer)
    } else if (module === 'ftp-srv') {
      if (!this.FTPSrv) {
        const res = await import('./module/FTPSrv')
        this.FTPSrv = res.default
      }
      doRun(this.FTPSrv)
    } else if (module === 'etcd') {
      if (!this.ETCD) {
        const res = await import('./module/ETCD')
        this.ETCD = res.default
      }
      doRun(this.ETCD)
    } else if (module === 'deno') {
      if (!this.Deno) {
        const res = await import('./module/Deno')
        this.Deno = res.default
      }
      doRun(this.Deno)
    } else if (module === 'bun') {
      if (!this.Bun) {
        const res = await import('./module/Bun')
        this.Bun = res.default
      }
      doRun(this.Bun)
    } else if (module === 'perl') {
      if (!this.Perl) {
        const res = await import('./module/Perl')
        this.Perl = res.default
      }
      doRun(this.Perl)
    } else if (module === 'dns') {
      if (!this.DNS) {
        const res = await import('./module/DNS')
        this.DNS = res.default
      }
      doRun(this.DNS)
    } else if (module === 'code') {
      console.log('codeRun 00: ', Math.round(new Date().getTime() / 1000))
      if (!this.Code) {
        const res = await import('./module/Code')
        this.Code = res.default
      }
      console.log('codeRun 11: ', Math.round(new Date().getTime() / 1000))
      doRun(this.Code)
    } else if (module === 'consul') {
      if (!this.Consul) {
        const res = await import('./module/Consul')
        this.Consul = res.default
      }
      doRun(this.Consul)
    } else if (module === 'gradle') {
      if (!this.Gradle) {
        const res = await import('./module/Gradle')
        this.Gradle = res.default
      }
      doRun(this.Gradle)
    } else if (module === 'typesense') {
      if (!this.Typesense) {
        const res = await import('./module/Typesense')
        this.Typesense = res.default
      }
      doRun(this.Typesense)
    } else if (module === 'project') {
      if (!this.Project) {
        const res = await import('./module/Project')
        this.Project = res.default
      }
      doRun(this.Project)
    } else if (module === 'podman') {
      if (!this.Podman) {
        const res = await import('./module/Podman')
        this.Podman = res.default
      }
      doRun(this.Podman)
    } else {
      ProcessSendError(ipcCommandKey, 'No Found Module')
    }
  }

  async destroy() {}
}
export default BaseManager
