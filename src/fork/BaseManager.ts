import { ProcessSendError, ProcessSendLog, ProcessSendSuccess } from './Fn'

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
  Version: any
  Project: any
  Tool: any
  MacPorts: any
  Caddy: any
  Composer: any
  Java: any
  Tomcat: any
  App: any
  DNS: any
  GoLang: any
  RabbitMQ: any
  Python: any
  Maven: any
  Service: any
  ERLang: any
  constructor() {}

  init() {}

  async exec(commands: Array<any>) {
    const ipcCommandKey = commands.shift()
    const then = (res: any) => {
      ProcessSendSuccess(ipcCommandKey, res)
    }
    const error = (e: Error) => {
      ProcessSendError(ipcCommandKey, e.toString())
    }
    const onData = (log: string) => {
      ProcessSendLog(ipcCommandKey, log)
    }

    const module: string = commands.shift()
    const fn: string = commands.shift()

    const doRun = (module: any) => {
      module.init && module.init()
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
        const res = await import('./module/Php')
        this.Php = res.default
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
        const res = await import('./module/Node')
        this.Node = res.default
      }
      doRun(this.Node)
    } else if (module === 'version') {
      if (!this.Version) {
        const res = await import('./module/Version')
        this.Version = res.default
      }
      doRun(this.Version)
    } else if (module === 'project') {
      if (!this.Project) {
        const res = await import('./module/Project')
        this.Project = res.default
      }
      doRun(this.Project)
    } else if (module === 'tools') {
      if (!this.Tool) {
        const res = await import('./module/Tool')
        this.Tool = res.default
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
    } else if (module === 'dns') {
      if (!this.DNS) {
        const res = await import('./module/DNS')
        this.DNS = res.default
      }
      doRun(this.DNS)
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
    } else if (module === 'erlang') {
      if (!this.ERLang) {
        const res = await import('./module/ERLang')
        this.ERLang = res.default
      }
      doRun(this.ERLang)
    }
  }

  async destory() {}
}
export default BaseManager
