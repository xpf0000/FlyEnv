import { Base } from './Base'
import type { SoftInstalled } from '@shared/app'
import { versionDirCache } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'

class Manager extends Base {
  Apache: any
  Nginx: any
  Php: any
  Mysql: any
  Redis: any
  Memcached: any
  Mongodb: any
  Mariadb: any
  Postgresql: any
  PureFtpd: any
  Caddy: any
  Composer: any
  Java: any
  Tomcat: any
  GoLang: any
  RabbitMQ: any
  Python: any
  Maven: any
  ERLang: any
  MailPit: any
  constructor() {
    super()
  }

  allInstalledVersions(flag: Array<string>, setup: any) {
    return new ForkPromise(async (resolve) => {
      for (const k in versionDirCache) {
        delete versionDirCache[k]
      }
      const versions: { [k: string]: Array<SoftInstalled> } = {}
      for (const type of flag) {
        if (type === 'apache') {
          if (!this.Apache) {
            const res = await import('./Apache')
            this.Apache = res.default
          }
          versions.apache = this.Apache.allInstalledVersions(setup)
        } else if (type === 'nginx') {
          if (!this.Nginx) {
            const res = await import('./Nginx')
            this.Nginx = res.default
          }
          versions.nginx = this.Nginx.allInstalledVersions(setup)
        } else if (type === 'php') {
          if (!this.Php) {
            const res = await import('./Php')
            this.Php = res.default
          }
          versions.php = this.Php.allInstalledVersions(setup)
        } else if (type === 'mysql') {
          if (!this.Mysql) {
            const res = await import('./Mysql')
            this.Mysql = res.default
          }
          versions.mysql = this.Mysql.allInstalledVersions(setup)
        } else if (type === 'redis') {
          if (!this.Redis) {
            const res = await import('./Redis')
            this.Redis = res.default
          }
          versions.redis = this.Redis.allInstalledVersions(setup)
        } else if (type === 'memcached') {
          if (!this.Memcached) {
            const res = await import('./Memcached')
            this.Memcached = res.default
          }
          versions.memcached = this.Memcached.allInstalledVersions(setup)
        } else if (type === 'mongodb') {
          if (!this.Mongodb) {
            const res = await import('./Mongodb')
            this.Mongodb = res.default
          }
          versions.mongodb = this.Mongodb.allInstalledVersions(setup)
        } else if (type === 'mariadb') {
          if (!this.Mariadb) {
            const res = await import('./Mariadb')
            this.Mariadb = res.default
          }
          versions.mariadb = this.Mariadb.allInstalledVersions(setup)
        } else if (type === 'postgresql') {
          if (!this.Postgresql) {
            const res = await import('./Postgresql')
            this.Postgresql = res.default
          }
          versions.postgresql = this.Postgresql.allInstalledVersions(setup)
        } else if (type === 'caddy') {
          if (!this.Caddy) {
            const res = await import('./Caddy')
            this.Caddy = res.default
          }
          versions.caddy = this.Caddy.allInstalledVersions(setup)
        } else if (type === 'composer') {
          if (!this.Composer) {
            const res = await import('./Composer')
            this.Composer = res.default
          }
          versions.composer = this.Composer.allInstalledVersions(setup)
        } else if (type === 'java') {
          if (!this.Java) {
            const res = await import('./Java')
            this.Java = res.default
          }
          versions.java = this.Java.allInstalledVersions(setup)
        } else if (type === 'tomcat') {
          if (!this.Tomcat) {
            const res = await import('./Tomcat')
            this.Tomcat = res.default
          }
          versions.tomcat = this.Tomcat.allInstalledVersions(setup)
        } else if (type === 'golang') {
          if (!this.GoLang) {
            const res = await import('./GoLang')
            this.GoLang = res.default
          }
          versions.golang = this.GoLang.allInstalledVersions(setup)
        } else if (type === 'rabbitmq') {
          if (!this.RabbitMQ) {
            const res = await import('./RabbitMQ')
            this.RabbitMQ = res.default
          }
          versions.rabbitmq = this.RabbitMQ.allInstalledVersions(setup)
        } else if (type === 'python') {
          if (!this.Python) {
            const res = await import('./Python')
            this.Python = res.default
          }
          versions.python = this.Python.allInstalledVersions(setup)
        } else if (type === 'maven') {
          if (!this.Maven) {
            const res = await import('./Maven')
            this.Maven = res.default
          }
          versions.maven = this.Maven.allInstalledVersions(setup)
        } else if (type === 'erlang') {
          if (!this.ERLang) {
            const res = await import('./ERLang')
            this.ERLang = res.default
          }
          versions.erlang = this.ERLang.allInstalledVersions(setup)
        } else if (type === 'mailpit') {
          if (!this.MailPit) {
            const res = await import('./MailPit')
            this.MailPit = res.default
          }
          versions.mailpit = this.MailPit.allInstalledVersions(setup)
        }
      }
      const keys: string[] = []
      const tasks = []
      for (const k in versions) {
        keys.push(k)
        tasks.push(versions[k])
      }
      const list = await Promise.all(tasks)
      list.forEach((arr, i) => {
        versions[keys[i]] = arr
      })
      resolve(versions)
    })
  }
}

export default new Manager()
