import { Base } from '../Base'
import {
  getAllFileAsync,
  systemProxyGet,
  writeFileByRoot,
  readFileByRoot,
  existsSync
} from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { TaskQueue, TaskQueueProgress } from '@shared/TaskQueue'
import { join } from 'path'
import { I18nT } from '@lang/index'
import { BomCleanTask } from '../../util/BomCleanTask'
import RequestTimer from '@shared/requestTimer'
import { killPorts, killPids, getPortPids, getPidsByKey } from './process'
import { fetchEnvPath, fetchPATH, handleUpdatePath, updatePATH, removePATH } from './path'
import { setAlias, cleanAlias } from './alias'
import { runInTerminal, openPathByApp } from './terminal'
import { initAllowDir, initFlyEnvSH } from './init'
import type { SoftInstalled } from '@shared/app'

class Manager extends Base {
  jiebaLoad = false
  jiebaLoadFail = false
  constructor() {
    super()
  }

  getAllFile(fp: string, fullpath = true) {
    return new ForkPromise((resolve, reject) => {
      getAllFileAsync(fp, fullpath).then(resolve).catch(reject)
    })
  }

  cleanBom(files: Array<string>) {
    return new ForkPromise((resolve, reject, on) => {
      const taskQueue = new TaskQueue()
      taskQueue
        .progress((progress: TaskQueueProgress) => {
          on(progress)
        })
        .end(() => {
          resolve(true)
        })
        .initQueue(
          files.map((p) => {
            return new BomCleanTask(p)
          })
        )
        .run()
    })
  }

  systemEnvFiles() {
    return new ForkPromise(async (resolve, reject) => {
      const envFiles = [
        join(global.Server.UserHome!, '.config/fish/config.fish'),
        join(global.Server.UserHome!, '.bashrc'),
        join(global.Server.UserHome!, '.profile'),
        join(global.Server.UserHome!, '.bash_login'),
        join(global.Server.UserHome!, '.zprofile'),
        join(global.Server.UserHome!, '.zshrc'),
        join(global.Server.UserHome!, '.bash_profile'),
        '/etc/paths',
        '/etc/profile'
      ]
      try {
        const files = envFiles.filter((e) => existsSync(e))
        resolve(files)
      } catch (e) {
        reject(e)
      }
    })
  }

  systemEnvSave(file: string, content: string) {
    return new ForkPromise(async (resolve, reject) => {
      if (!existsSync(file)) {
        reject(new Error(I18nT('php.phpiniNotFound')))
        return
      }
      try {
        await writeFileByRoot(file, content)
        resolve(true)
      } catch (e) {
        reject(e)
      }
    })
  }

  systemProxy() {
    return new ForkPromise((resolve) => {
      systemProxyGet()
        .then((proxy) => {
          resolve(proxy)
        })
        .catch(() => {
          resolve(false)
        })
    })
  }

  readFileByRoot(file: string) {
    return new ForkPromise(async (resolve) => {
      let content = ''
      try {
        content = await readFileByRoot(file)
      } catch {}
      resolve(content)
    })
  }

  writeFileByRoot(file: string, content: string) {
    return new ForkPromise(async (resolve) => {
      try {
        await writeFileByRoot(file, content)
      } catch {}
      resolve(true)
    })
  }

  fetchEnvPath = fetchEnvPath
  fetchPATH = fetchPATH
  handleUpdatePath = handleUpdatePath
  updatePATH = updatePATH
  removePATH = removePATH

  setAlias = setAlias
  cleanAlias = cleanAlias

  killPorts = killPorts
  killPids = killPids
  getPortPids = getPortPids
  getPidsByKey = getPidsByKey

  requestTimeFetch(url: string) {
    return new ForkPromise(async (resolve, reject) => {
      const timer = new RequestTimer({
        timeout: 10000,
        retries: 2,
        followRedirects: true,
        maxRedirects: 10,
        keepAlive: true,
        strictSSL: false // Set to false to ignore SSL errors
      })
      try {
        const results = await timer.measure(url)
        const res = RequestTimer.formatResults(results)
        resolve(res)
      } catch (error) {
        reject(error)
      }
    })
  }

  runInTerminal = runInTerminal

  openPathByApp = openPathByApp

  initAllowDir = initAllowDir
  initFlyEnvSH = initFlyEnvSH

  getConfigFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    // Tool 是通用工具模块，不管理具体服务，没有固定的配置文件
    return []
  }

  getLogFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    // Tool 是通用工具模块，不产生专属的日志文件
    return []
  }
}

export default new Manager()
