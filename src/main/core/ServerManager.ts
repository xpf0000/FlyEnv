import { isMacOS, isLinux, isWindows } from '@shared/utils'
import { HostsFileLinux, HostsFileMacOS, HostsFileWindows } from '@shared/PlatFormConst'
import { writeFileByRoot, readFileFixed } from '../utils'
import ServiceProcessManager from './ServiceProcess'
import ConfigManager from './ConfigManager'
import CustomerLang from './CustomerLang'
import { DetermineRunPath } from '../utils/RunPath'
import { SetupGlobalPaths } from '../utils/ServerPath'

export default class ServerManager {
  private configManager: ConfigManager

  constructor(configManager: ConfigManager) {
    this.configManager = configManager
    global.Server.Password = this.configManager.getConfig('password')
  }

  /**
   * 初始化服务器目录
   */
  initServerDir() {
    const runpath = DetermineRunPath()
    SetupGlobalPaths(runpath)
  }

  /**
   * 设置代理
   */
  setProxy(): Record<string, string> | undefined {
    const proxy = this.configManager.getConfig('setup.proxy')
    if (proxy.on && proxy.proxy) {
      const proxyDict: Record<string, string> = {}
      proxy.proxy
        .split(' ')
        .filter((s: string) => s.indexOf('=') > 0)
        .forEach((s: string) => {
          const dict = s.split('=')
          proxyDict[dict[0]] = dict[1]
        })
      global.Server.Proxy = proxyDict
      return proxyDict
    } else {
      delete global.Server.Proxy
      return undefined
    }
  }

  /**
   * 获取代理配置
   */
  getProxy(): Record<string, string> | undefined {
    return global.Server.Proxy
  }

  /**
   * 停止服务器
   */
  async stopServer() {
    await this.stopServices()
    await this.cleanHosts()
  }

  /**
   * 停止服务
   */
  private async stopServices() {
    try {
      await ServiceProcessManager.stop()
    } catch (e) {
      console.log('stopServerByPid e: ', e)
    }
  }

  /**
   * 清理 Hosts 文件
   */
  private async cleanHosts() {
    let file = ''
    if (isMacOS()) {
      file = HostsFileMacOS
    } else if (isWindows()) {
      file = HostsFileWindows
    } else if (isLinux()) {
      file = HostsFileLinux
    }

    if (!file) return

    try {
      let hosts = await readFileFixed(file)
      const x = hosts.match(/(#X-HOSTS-BEGIN#)([\s\S]*?)(#X-HOSTS-END#)/g)
      if (x && x.length > 0) {
        hosts = hosts.replace(x[0], '')
        await writeFileByRoot(file, hosts)
      }
    } catch {}
  }

  /**
   * 获取全局服务器配置
   */
  getGlobalServer(): typeof global.Server {
    return JSON.parse(JSON.stringify(global.Server))
  }

  /**
   * 更新全局配置
   */
  updateGlobalConfig() {
    global.Server.Lang = this.configManager.getConfig('setup.lang') ?? 'en'
    global.Server.ForceStart = this.configManager.getConfig('setup.forceStart')
    global.Server.Licenses = this.configManager.getConfig('setup.license')
    global.Server.UserUUID = this.configManager.getConfig('setup.user_uuid')
    CustomerLang.initLangCustomer()
  }
}
