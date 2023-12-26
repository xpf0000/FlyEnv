import { I18nT } from './lang'
import { execSync } from 'child_process'
import { ProcessSendError, ProcessSendLog, ProcessSendSuccess } from './Fn'
import type { ForkPromise } from '@shared/ForkPromise'
import Apache from './module/Apache'
import Nginx from './module/Nginx'
import Php from './module/Php'
import Host from './module/Host'

class BaseManager {
  constructor() {}

  init() {
    Apache.init()
    Nginx.init()
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
    const module: string = commands.shift()
    const fn: string = commands.shift()
    console.log('BaseManager: ', module, fn)
    const then = (res: any) => {
      ProcessSendSuccess(ipcCommandKey, res)
    }
    const error = (e: Error) => {
      ProcessSendError(ipcCommandKey, e.toString())
    }
    const onData = (log: string) => {
      ProcessSendLog(ipcCommandKey, log)
    }
    let func: ForkPromise<any> | undefined
    if (module === 'apache') {
      func = Apache.exec(fn, ...commands)
    } else if (module === 'nginx') {
      func = Nginx.exec(fn, ...commands)
    } else if (module === 'php') {
      func = Php.exec(fn, ...commands)
    } else if (module === 'host') {
      func = Host.exec(fn, ...commands)
    }
    func?.on(onData).then(then).catch(error)
  }

  async destory() {}
}
export default BaseManager
