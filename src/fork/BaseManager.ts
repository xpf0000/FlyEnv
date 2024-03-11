import { I18nT } from './lang'
import { execSync } from 'child_process'
import { ProcessSendError, ProcessSendLog, ProcessSendSuccess } from './Fn'
import type { ForkPromise } from '@shared/ForkPromise'
import Apache from './module/Apache'
import Nginx from './module/Nginx'
import Php from './module/Php'
import Host from './module/Host'
import Mysql from './module/Mysql'
import Redis from './module/Redis'
import Memcached from './module/Memcached'
import Mongodb from './module/Mongodb'
import Mariadb from './module/Mariadb'
import Postgresql from './module/Postgresql'
import PureFtpd from './module/PureFtpd'
import Node from './module/Node'
import Brew from './module/Brew'
import Version from './module/Version'
import Project from './module/Project'
import Tool from './module/Tool'
import MacPorts from './module/MacPorts'
import Caddy from './module/Caddy'

class BaseManager {
  constructor() {}

  init() {
    Apache.init()
    Nginx.init()
    Mysql.init()
    Redis.init()
    Memcached.init()
    Mongodb.init()
    Mariadb.init()
    PureFtpd.init()
    Caddy.init()
  }

  exec(commands: Array<any>) {
    const ipcCommandKey = commands.shift()
    try {
      execSync(`echo '${global.Server.Password}' | sudo -S -k -l`)
    } catch (e) {
      ProcessSendError(ipcCommandKey, I18nT('fork.needPassWord'))
      ProcessSendError('application:need-password', false)
      return
    }
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
    let func: ForkPromise<any> | undefined
    if (module === 'apache') {
      func = Apache.exec(fn, ...commands)
    } else if (module === 'nginx') {
      func = Nginx.exec(fn, ...commands)
    } else if (module === 'php') {
      func = Php.exec(fn, ...commands)
    } else if (module === 'host') {
      func = Host.exec(fn, ...commands)
    } else if (module === 'mysql') {
      func = Mysql.exec(fn, ...commands)
    } else if (module === 'redis') {
      func = Redis.exec(fn, ...commands)
    } else if (module === 'memcached') {
      func = Memcached.exec(fn, ...commands)
    } else if (module === 'mongodb') {
      func = Mongodb.exec(fn, ...commands)
    } else if (module === 'mariadb') {
      func = Mariadb.exec(fn, ...commands)
    } else if (module === 'postgresql') {
      func = Postgresql.exec(fn, ...commands)
    } else if (module === 'pure-ftpd') {
      func = PureFtpd.exec(fn, ...commands)
    } else if (module === 'node') {
      func = Node.exec(fn, ...commands)
    } else if (module === 'brew') {
      func = Brew.exec(fn, ...commands)
    } else if (module === 'version') {
      func = Version.exec(fn, ...commands)
    } else if (module === 'project') {
      func = Project.exec(fn, ...commands)
    } else if (module === 'tools') {
      func = Tool.exec(fn, ...commands)
    } else if (module === 'macports') {
      func = MacPorts.exec(fn, ...commands)
    } else if (module === 'caddy') {
      func = Caddy.exec(fn, ...commands)
    }
    func?.on(onData).then(then).catch(error)
  }

  async destory() {}
}
export default BaseManager
