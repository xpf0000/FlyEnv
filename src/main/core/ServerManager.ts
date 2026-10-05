import { isMacOS, isLinux, isWindows } from '@shared/utils'
import { HostsFileLinux, HostsFileMacOS } from '@shared/PlatFormConst'
import { parseProxyConfigCommand } from '@shared/installProxyEnv'
import { writeFileByRoot, readFileFixed } from '../utils'
import ServiceProcessManager from './ServiceProcess'
import ConfigManager from './ConfigManager'
import { DetermineRunPath } from '../utils/RunPath'
import { SetupGlobalPaths } from '../utils/ServerPath'
import { resolveWindowsElevationMethod } from '@shared/WindowsHelperState'
import { launchWindowsDnsRefresh } from '@shared/WindowsDnsRefresh'
import { logServiceStopBoundary, timeServiceStopBoundary } from '@shared/ServiceStopDiagnostics'

export default class ServerManager {
  private configManager: ConfigManager

  constructor(configManager: ConfigManager) {
    this.configManager = configManager
    global.Server.Password = this.configManager.getConfig('password')
  }

  /**
   * 初始化服务器目录
   */
  initServerDir(): Promise<boolean> {
    const runpath = DetermineRunPath()
    return SetupGlobalPaths(runpath)
  }

  /**
   * 设置代理
   */
  setProxy(): Record<string, string> | undefined {
    const proxy = this.configManager.getConfig('setup.proxy')
    if (proxy.on && proxy.proxy) {
      const proxyDict = parseProxyConfigCommand(proxy.proxy)
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
    // 这里只停服务。Application 先关闭入口并 drain 已受理站点/服务请求，再将
    // stopServer 与 cleanHosts 并行；旧请求不会在 hosts 清理后写回托管域名。
    await this.stopServices()
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
   * 清理 Hosts 文件。调用者负责退出交互上下文及权限协调器的生命周期；
   * 直接读取系统文件，不依赖 host.json 是否存在，也不根据当前站点列表重建。
   * 退出时先等待已有 hosts 请求收尾，随后可与服务停止并行；文件操作由 main
   * 完成，无需等服务进程退出。权限和 EnvSync 资源仍由 Application 在整组后释放。
   */
  async cleanHosts() {
    let file = ''
    if (isMacOS()) {
      file = HostsFileMacOS
    } else if (isWindows()) {
      // 使用 main 初始化的实际路径，退出清理与站点写入必须指向同一系统文件。
      file = global.Server.WindowsHostsFile ?? ''
    } else if (isLinux()) {
      file = HostsFileLinux
    }

    if (!file) {
      logServiceStopBoundary('quit.hosts-skipped', { reason: 'no-hosts-path' })
      return
    }

    try {
      // 不记录 hosts 内容；各阶段沿用 Application 的 quitId/stopId，后续 action 可直接关联。
      const hosts = await timeServiceStopBoundary('quit.hosts-read', { file }, () =>
        readFileFixed(file)
      )
      // 删除全部完整的 FlyEnv 托管块，保留块外内容；没有变化时不能写入或请求 UAC。
      // 没有完整标记对时不截断文件；块的范围仍沿用既有 FlyEnv 标记协议。
      const cleaned = hosts.replace(/(#X-HOSTS-BEGIN#)([\s\S]*?)(#X-HOSTS-END#)/g, '')
      if (cleaned === hosts) {
        logServiceStopBoundary('quit.hosts-skipped', { file, reason: 'no-managed-block-change' })
        return
      }
      await timeServiceStopBoundary(
        'quit.hosts-write',
        { file, operation: 'tools.writeFileByRoot' },
        () => writeFileByRoot(file, cleaned)
      )
      // 文件写入成功后启动刷新即可；不等待结果，不为 DNS 创建提权 broker。
      // 刷新失败由共享执行器记录并返回 false，不否定已完成的文件清理。
      // launch.completed 只代表尝试已返回；真实启动结果看 dns.refresh-spawned/failed。
      if (isWindows()) {
        await timeServiceStopBoundary(
          'quit.dns-refresh-launch',
          { operation: 'ipconfig.flushdns', waitingForExit: false, bestEffort: true },
          () => launchWindowsDnsRefresh()
        )
      }
    } catch (error) {
      // Windows 取消、拒绝/未知结果及 I/O 失败都需要由 Application 记录。
      // 非 Windows 保留原有尽力清理策略，本轮不改变其授权和退出行为。
      if (isWindows()) throw error
    }
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
    global.Server.ForceStart = this.configManager.getConfig('setup.forceStart')
    global.Server.Licenses = this.configManager.getConfig('setup.license')
    global.Server.UserUUID = this.configManager.getConfig('setup.user_uuid')
    global.Server.WindowsElevationMethod = resolveWindowsElevationMethod(
      this.configManager.getConfig('setup.windowsElevationMethod')
    )
    // 默认方法与用户确认标记分开广播；其他模块不可把旧默认值当成授权。
    global.Server.WindowsElevationChoiceVersion = this.configManager.getConfig(
      'setup.windowsElevationChoiceVersion'
    )
  }
}
