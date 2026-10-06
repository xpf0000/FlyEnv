import type { ForkManager } from './ForkManager'
import type MCPConfigManager from './MCPConfigManager'
import type { GetManagedFileMapInput } from '@shared/mcpContext'
import MCPContextResolver from './MCPContextResolver'
import ServiceProcessManager from './ServiceProcess'
import ServiceVersionManager from './ServiceVersionManager'
import { captureServiceLifecycleValidity } from './ServiceLifecycle'
import {
  isMcpDatabaseFlag,
  isMcpInstallableFlag,
  isMcpLifecycleFlag,
  isMcpQueryableFlag
} from './mcpToolMetadata'

/**
 * 单实例服务（isOnlyRunOne）：同一时刻只跑一个版本，启动某版本即「切到该版本」。
 * 对应 FlyEnv 渲染层 onItemStart 行为。语言运行时（php/node/python...）是多实例，不在此列。
 */
const SINGLE_INSTANCE_SERVICES = new Set<string>([
  'nginx',
  'apache',
  'caddy',
  'mysql',
  'mariadb',
  'postgresql',
  'clickhouse',
  'redis',
  'memcached',
  'mongodb'
])

/**
 * MCPTools —— MCP 协议层与 FlyEnv 能力层之间的映射。
 *
 * 它做三件事：
 *   1. 把 MCP 的 tools/call、resources/read 翻译成 ForkManager.send(module, fn, ...args)
 *   2. 把 fork 返回结果翻译回 MCP 响应（文本/JSON）
 *   3. 出站字段白名单/脱敏：FlyEnv 是本地开发工具，bin/path/凭据默认返回给 AI 代理用于执行命令；
 *      仅在用户开启 maskSecrets 时才会对 rootPassword、SSL 私钥等做脱敏。
 *
 * 注意：这里不直接 import 渲染层类型（@/...），只用 main 进程可达的依赖。
 */

/** 调用 fork 的统一封装：返回 { code, data } 里的 data，失败抛错 */
function callFork(
  forkManager: ForkManager,
  module: string,
  fn: string,
  ...args: any[]
): Promise<any> {
  const isCurrentRequest = captureServiceLifecycleValidity()
  return new Promise((resolve, reject) => {
    let settled = false
    forkManager
      .send(module, fn, ...args)
      .on(() => {
        // 进度日志（code 200），MCP 场景下忽略
      })
      .then((res: any) => {
        if (settled) return
        settled = true
        if (!isCurrentRequest()) {
          reject(new Error('Service lifecycle request expired; ignoring late fork result'))
          return
        }
        if (res?.code === 0) {
          resolve(res?.data)
        } else {
          reject(new Error(typeof res?.msg === 'string' ? res.msg : 'fork call failed'))
        }
      })
      .catch((e: any) => {
        if (settled) return
        settled = true
        reject(e instanceof Error ? e : new Error(`${e}`))
      })
  })
}

/**
 * 版本对象序列化。FlyEnv 是本地开发工具，bin/path/version 是 AI 代理执行任务
 * （如「用 PHP 7.3 跑某文件」「用 mysql.exe 连本地库」）的必需材料，默认全部返回。
 * 仅在用户显式开启 maskSecrets 时，才剔除 rootPassword 等凭据字段。
 */
function serializeVersion(v: any, run: boolean, mask: boolean) {
  if (!v || typeof v !== 'object') return v
  const out: Record<string, any> = {
    typeFlag: v.typeFlag,
    version: v.version,
    bin: v.bin,
    path: v.path,
    enable: v.enable,
    run,
    num: v.num,
    note: v.note,
    error: v.error || undefined
  }
  // PHP 等的附属可执行路径，代理执行命令时可能需要
  if (v.phpBin) out.phpBin = v.phpBin
  if (v.phpConfig) out.phpConfig = v.phpConfig
  if (!mask && v.rootPassword !== undefined) {
    out.rootPassword = v.rootPassword
  }
  return out
}

/**
 * 站点对象序列化。本地开发工具，默认暴露 AI 代理所需的完整信息（根目录、端口、
 * SSL 证书路径、env 文件路径等）。maskSecrets 开启时仅去掉 SSL 私钥路径。
 */
function serializeSite(h: any, mask: boolean) {
  if (!h || typeof h !== 'object') return h
  const out: Record<string, any> = {
    id: h.id,
    name: h.name,
    alias: h.alias,
    type: h.type,
    phpVersion: h.phpVersion,
    useSSL: h.useSSL,
    autoSSL: h.autoSSL,
    url: h.url,
    root: h.root,
    projectName: h.projectName,
    projectPort: h.projectPort,
    startCommand: h.startCommand,
    port: h.port,
    envFile: h.envFile
  }
  if (!mask) {
    out.ssl = h.ssl
  } else if (h.ssl) {
    out.ssl = { cert: h.ssl.cert, key: '******' }
  }
  return out
}

export interface MCPToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

function textResult(data: any, isError = false): MCPToolResult {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
  return { content: [{ type: 'text', text }], isError }
}

/** 新建站点时的默认 AppHost 骨架 */
function defaultHost(): Record<string, any> {
  return {
    id: new Date().getTime(),
    type: 'php',
    name: '',
    alias: '',
    useSSL: true,
    autoSSL: true,
    ssl: {
      cert: '',
      key: ''
    },
    port: {
      nginx: 80,
      nginx_ssl: 443,
      apache: 80,
      apache_ssl: 443,
      caddy: 80,
      caddy_ssl: 443,
      frankenphp: 80,
      frankenphp_ssl: 443,
      tomcat: 80,
      tomcat_ssl: 443
    },
    nginx: {
      rewrite: ''
    },
    url: '',
    root: '',
    mark: '',
    bookmark: '',
    phpVersion: undefined,
    phpVersionFull: '',
    reverseProxy: [],
    envFile: '',
    projectName: '',
    projectPort: 0,
    startCommand: ''
  }
}

function normalizeSiteName(name: string): string {
  try {
    return new URL(name.includes('http') ? name : `https://${name}`).hostname
  } catch {
    throw new Error(`Invalid site name: ${name}`)
  }
}

/** 用输入构建一个可写入 host.json 的 AppHost */
function buildHostFromInput(input: Record<string, any>): Record<string, any> {
  const host = defaultHost()
  if (!input?.name || !input?.root) {
    throw new Error('create_site requires "name" and "root"')
  }
  host.name = input.name
  host.root = input.root
  host.url = input.url ?? `http://${input.name}`
  if (input.alias !== undefined) host.alias = input.alias
  if (input.phpVersion !== undefined) host.phpVersion = input.phpVersion
  if (input.useSSL !== undefined) host.useSSL = !!input.useSSL
  if (input.autoSSL !== undefined) host.autoSSL = !!input.autoSSL
  if (input.ssl) host.ssl = { ...host.ssl, ...input.ssl }
  if (input.port) host.port = { ...host.port, ...input.port }
  if (input.nginx) host.nginx = { ...host.nginx, ...input.nginx }
  if (input.reverseProxy) host.reverseProxy = input.reverseProxy
  return host
}

/** 合并用户提供的 patch 到现有站点 */
function mergeHostPatch(
  site: Record<string, any>,
  patch: Record<string, any>
): Record<string, any> {
  const updated = { ...site }
  const nextPatch = { ...patch }
  if (typeof nextPatch.name === 'string') {
    nextPatch.name = normalizeSiteName(nextPatch.name)
  }
  const allowed = [
    'name',
    'alias',
    'root',
    'phpVersion',
    'phpVersionFull',
    'useSSL',
    'autoSSL',
    'ssl',
    'port',
    'nginx',
    'url',
    'mark',
    'bookmark',
    'reverseProxy',
    'envFile',
    'projectName',
    'projectPort',
    'startCommand'
  ]
  for (const key of allowed) {
    if (nextPatch[key] !== undefined) {
      if (key === 'ssl' || key === 'port' || key === 'nginx') {
        updated[key] = { ...updated[key], ...nextPatch[key] }
      } else {
        updated[key] = nextPatch[key]
      }
    }
  }
  return updated
}

export class MCPTools {
  forkManager: ForkManager
  mcpConfig: MCPConfigManager
  contextResolver: MCPContextResolver
  /** 主配置（user.json），用于写 server[flag].current；可选注入 */
  appConfig?: { getConfig: (k?: any, d?: any) => any; setConfig: (k: string, ...a: any) => any }

  constructor(
    forkManager: ForkManager,
    mcpConfig: MCPConfigManager,
    appConfig?: { getConfig: (k?: any, d?: any) => any; setConfig: (k: string, ...a: any) => any }
  ) {
    this.forkManager = forkManager
    this.mcpConfig = mcpConfig
    this.contextResolver = new MCPContextResolver(forkManager, mcpConfig)
    this.appConfig = appConfig
    ServiceVersionManager.setForkManager(forkManager)
  }

  /** 是否对出站内容做掩码（默认 false，本地开发工具不屏蔽 bin/path/凭据） */
  private get mask(): boolean {
    return !!this.mcpConfig.getConfig('maskSecrets')
  }

  private assertLifecycleFlag(flag: string, action: 'start' | 'stop' | 'restart') {
    if (isMcpLifecycleFlag(flag)) {
      return
    }
    throw new Error(
      `${flag} is not a lifecycle-managed FlyEnv service and cannot be ${action}ed via MCP. ` +
        'Use list_online_versions plus install_service for installable runtimes/toolchains such as bun, ' +
        'and manage project execution outside these service lifecycle tools.'
    )
  }

  private assertInstallableFlag(flag: string) {
    if (isMcpInstallableFlag(flag)) {
      return
    }
    throw new Error(
      `${flag} does not support version download/install via FlyEnv MCP. ` +
        'Use an installable module flag from list_online_versions instead.'
    )
  }

  private assertQueryableFlag(flag: string) {
    if (isMcpQueryableFlag(flag)) {
      return
    }
    throw new Error(
      `${flag} is not a version-managed FlyEnv module for this MCP tool. ` +
        'Use supported module flags such as bun, node, php, nginx, mysql, python, golang, redis, or pure-ftpd.'
    )
  }

  private assertDatabaseFlag(flag: string) {
    if (isMcpDatabaseFlag(flag)) {
      return
    }
    throw new Error(
      `${flag} is not a database/cache module for this MCP tool. ` +
        'Use one of: mysql, mariadb, postgresql, clickhouse, redis, mongodb, memcached.'
    )
  }

  /** 读取某个模块的全部已安装版本（原始，含 bin，仅供内部匹配用，不直接出站） */
  private async rawServiceVersions(flag: string): Promise<any[]> {
    return ServiceVersionManager.getVersions(flag)
  }

  /** 批量读取多个模块的已安装版本，优先读主进程缓存 */
  private async rawServiceVersionsBatch(
    flags: string[],
    options?: { refreshMissing?: boolean }
  ): Promise<Record<string, any[]>> {
    if (flags.length === 0) {
      return {}
    }
    if (options?.refreshMissing === false) {
      return ServiceVersionManager.getCachedVersionsBatch(flags)
    }
    return ServiceVersionManager.getVersionsBatch(flags)
  }

  /** 读取某个模块的全部已安装版本 */
  async listServiceVersions(flag: string): Promise<any[]> {
    const arr = await this.rawServiceVersions(flag)
    return arr.map((v) => serializeVersion(v, !!v.run, this.mask))
  }

  /** 当前缓存里已有的 flag 列表 */
  getCachedFlags(): string[] {
    return ServiceVersionManager.getCacheKeys()
  }

  /** list_services：返回一组模块及其安装/运行状态摘要 */
  async listServices(flags?: string[]): Promise<any> {
    const requested = Array.isArray(flags) && flags.length > 0
    const targetFlags = requested
      ? flags
      : this.getCachedFlags().filter((flag) => isMcpQueryableFlag(flag))
    if (requested) {
      targetFlags.forEach((flag) => this.assertQueryableFlag(flag))
    }
    const status = ServiceProcessManager.getStatus(targetFlags)
    const mask = this.mask
    const out: Record<string, any> = {}
    const rawMap = await this.rawServiceVersionsBatch(targetFlags, {
      refreshMissing: requested
    })
    for (const flag of targetFlags) {
      try {
        const raw = rawMap[flag] ?? []
        const st = status[flag]
        const runningBins = new Set((st?.instances ?? []).map((i) => i.bin))
        out[flag] = {
          running: st?.running ?? false,
          runningVersions: (st?.instances ?? []).map((i) => i.version).filter(Boolean),
          versions: raw.map((v: any) => serializeVersion(v, runningBins.has(v.bin), mask))
        }
      } catch (e) {
        out[flag] = { error: `${e instanceof Error ? e.message : e}` }
      }
    }
    return out
  }

  /** service_status：单个模块状态。运行态以主进程 ServiceProcessManager 为准 */
  async serviceStatus(flag: string): Promise<any> {
    this.assertQueryableFlag(flag)
    const raw = await this.rawServiceVersions(flag)
    const st = ServiceProcessManager.statusOf(flag)
    const runningBins = new Set(st.instances.map((i) => i.bin))
    const mask = this.mask
    return {
      flag,
      installed: raw.length,
      running: st.running,
      runningVersions: st.instances.map((i) => i.version).filter(Boolean),
      versions: raw.map((v: any) => serializeVersion(v, runningBins.has(v.bin), mask))
    }
  }

  /** list_sites：本地站点列表 */
  async listSites(): Promise<any[]> {
    const data = await callFork(this.forkManager, 'host', 'hostList')
    const list = data?.host ?? data ?? []
    const mask = this.mask
    return Array.isArray(list) ? list.map((h) => serializeSite(h, mask)) : []
  }

  /** 根据站点名查找原始站点对象（内部用，不序列化） */
  private async findSiteByName(name: string): Promise<any | undefined> {
    const data = await callFork(this.forkManager, 'host', 'hostList')
    const list = data?.host ?? data ?? []
    if (!Array.isArray(list)) return undefined
    return list.find((h: any) => h?.name === name)
  }

  private hostWriteConfig() {
    return {
      write: this.appConfig?.getConfig('setup.hosts.write', true) ?? true,
      ipv6: this.appConfig?.getConfig('setup.hosts.ipv6', true) ?? true
    }
  }

  private async reloadWebServer(hosts?: Array<Record<string, any>>) {
    let useSeted = false

    for (const flag of ['apache', 'nginx', 'caddy', 'tomcat']) {
      const running = ServiceProcessManager.statusOf(flag).instances[0]
      if (!running?.version) {
        continue
      }
      await this.restartService(flag, running.version).catch((e) => {
        console.log(`reloadWebServer restart ${flag} error:`, e)
      })
      useSeted = true
    }

    if (useSeted || !hosts || hosts.length > 1) {
      return
    }

    if (hosts.length === 1) {
      for (const flag of ['caddy', 'nginx', 'apache']) {
        const installed = await this.rawServiceVersions(flag).catch(() => [])
        if (installed.length > 0) {
          await this.startService(flag).catch((e) => {
            console.log(`reloadWebServer start ${flag} error:`, e)
          })
          break
        }
      }

      const host = hosts[0]
      if (host?.phpVersion) {
        const phpVersions = await this.rawServiceVersions('php').catch(() => [])
        const php = phpVersions.find((p: any) => p.num === host.phpVersion)
        if (php?.version) {
          await this.startService('php', php.version).catch((e) => {
            console.log(`reloadWebServer start php ${php.version} error:`, e)
          })
        }
      }
    }
  }

  private async finalizeHostMutation(hosts: Array<Record<string, any>>, isAdd = false) {
    await this.reloadWebServer(isAdd ? hosts : undefined)

    const { write, ipv6 } = this.hostWriteConfig()
    await callFork(this.forkManager, 'host', 'writeHosts', write, ipv6)

    ServiceVersionManager.notifyRenderer({
      type: 'host-list-changed',
      hosts
    })
  }

  /** create_site：新增本地站点 */
  async createSite(input: Record<string, any>): Promise<any> {
    const host = buildHostFromInput(input)
    const data = await callFork(this.forkManager, 'host', 'handleHost', host, 'add')
    const list = data?.host ?? []
    if (Array.isArray(list)) {
      await this.finalizeHostMutation(list, true)
    }
    return data
  }

  /** update_site：按站点名更新字段 */
  async updateSite(siteName: string, patch: Record<string, any>): Promise<any> {
    const site = await this.findSiteByName(siteName)
    if (!site) {
      throw new Error(`Site ${siteName} not found`)
    }
    const updated = mergeHostPatch(site, patch)
    const data = await callFork(this.forkManager, 'host', 'handleHost', updated, 'edit', site)
    const list = data?.host ?? []
    if (Array.isArray(list)) {
      await this.finalizeHostMutation(list, false)
    }
    return data
  }

  /** start_service / stop_service / restart_service 的底层：需要一个 version 对象 */
  private async pickVersion(flag: string, version?: string): Promise<any> {
    const arr: any[] = await this.rawServiceVersions(flag)
    if (!Array.isArray(arr) || arr.length === 0) {
      throw new Error(
        `No installed version for ${flag}. Use list_online_versions and install_service before start_service.`
      )
    }
    if (version) {
      const find = arr.find((v) => v?.version === version && v?.enable)
      if (!find) {
        throw new Error(
          `Version ${version} of ${flag} is not installed or not enabled. ` +
            'Use list_online_versions to inspect available versions and install_service to install one first.'
        )
      }
      return find
    }
    const enabled = arr.find((v) => v?.enable)
    if (!enabled) {
      throw new Error(
        `No enabled installed version for ${flag}. Install or enable a version before using start_service.`
      )
    }
    return enabled
  }

  startService(flag: string, version?: string): Promise<any> {
    return ServiceProcessManager.runLifecycle(
      flag,
      'start',
      (selected) => this.startServiceImpl(flag, version, selected),
      async () => {
        // 选版本也进入受理许可和 drain；PHP 按与 UI 相同的安装对象确定实例队列。
        this.assertLifecycleFlag(flag, 'start')
        return this.pickVersion(flag, version)
      }
    )
  }

  private async startServiceImpl(flag: string, version?: string, selected?: any): Promise<any> {
    this.assertLifecycleFlag(flag, 'start')
    const v = selected ?? (await this.pickVersion(flag, version))
    // 单实例服务（nginx/mysql/redis... isOnlyRunOne）：启动某版本即「切到该版本」——
    // 与 FlyEnv UI 的 onItemStart 行为对齐，先停掉其它正在运行的版本。
    // 多实例运行时（php/node/python... 语言类）：多版本可并存，不停其它。
    if (SINGLE_INSTANCE_SERVICES.has(flag)) {
      const running = ServiceProcessManager.statusOf(flag).instances.filter((instance) => {
        const registered = ServiceProcessManager.stopSnapshotFor(flag, instance)
        // 独立实例用自己的展示键登记、保存实际程序的停止参数；它们不属于普通安装版本
        // 的“切换当前版本”集合（例如同版本数据库分组）。stop_all/退出仍遍历全部登记。
        return !registered || registered.args[0]?.bin === instance.bin
      })
      if (running.some((ins) => ins.bin !== v.bin)) {
        const raw = await this.rawServiceVersions(flag)
        for (const ins of running) {
          if (ins.bin === v.bin) continue
          const full = raw.find((r: any) => r.bin === ins.bin) ?? { ...ins, typeFlag: flag }
          const snapshot = ServiceProcessManager.stopSnapshotFor(flag, ins)
          try {
            const data = await callFork(
              this.forkManager,
              flag,
              'stopService',
              ...(snapshot?.args ?? [full])
            )
            if (snapshot)
              ServiceProcessManager.finishStopSnapshot(
                flag,
                snapshot,
                (data?.['APP-Service-Stop-PID'] ?? []).map(String)
              )
          } catch (error) {
            // 任一旧版本停止失败都意味着切换未完成：保留它的登记并中止，不能在旧进程
            // 仍可能运行时继续启动新版本，也不能把失败误当成成功注销。
            throw new Error(
              `Cannot switch ${flag} to ${v.version ?? v.bin}: failed to stop ${ins.version ?? ins.bin}: ${String(error)}`
            )
          }
        }
      }
    }
    const registrationSnapshot = ServiceProcessManager.registrationSnapshot(flag)
    const data = await callFork(this.forkManager, flag, 'startService', v)
    // 把 PID 登记进主进程唯一状态源（与 IPCHandler.handleForkCallback 同口径），
    // 否则 MCP 启动的服务既不被 UI 感知，也不会在退出时被统一清理。
    const stoppedPids: string[] = data?.['APP-Service-Stop-PID'] ?? []
    if (stoppedPids.length > 0) {
      ServiceProcessManager.finishStoppedRegistrations(
        flag,
        registrationSnapshot,
        stoppedPids.map(String)
      )
    }
    const staleBins: string[] = data?.['APP-Service-Stale-Bins'] ?? []
    if (staleBins.length > 0) {
      ServiceProcessManager.finishStaleBins(flag, staleBins, registrationSnapshot)
    }
    const pid = data?.['APP-Service-Start-PID']
    if (pid) {
      const item = data?.['APP-Service-Start-Item'] ?? v
      // MCP 启动与 UI 使用相同运行登记，退出复用模块给出的同实例停止参数。
      ServiceProcessManager.addPid(
        flag,
        `${pid}`,
        item,
        data?.['APP-Service-Stop-Args'],
        data?.['APP-Service-Stop-Companion'] === true
      )
    }
    // 单实例服务：持久化 current（与渲染层 onItemStart→saveConfig 同口径，剔除 note）
    if (SINGLE_INSTANCE_SERVICES.has(flag) && this.appConfig) {
      try {
        const current: any = { ...v }
        delete current.note
        this.appConfig.setConfig(`server.${flag}.current`, current)
      } catch (e) {
        console.log(`startService persist current ${flag} error:`, e)
      }
    }
    return data
  }

  stopService(flag: string, version?: string): Promise<any> {
    return ServiceProcessManager.runLifecycle(
      flag,
      'stop',
      (selected) => this.stopServiceImpl(flag, version, selected),
      async () => {
        this.assertLifecycleFlag(flag, 'stop')
        return this.pickVersion(flag, version)
      }
    )
  }

  private async stopServiceImpl(flag: string, version?: string, selected?: any): Promise<any> {
    this.assertLifecycleFlag(flag, 'stop')
    const v = selected ?? (await this.pickVersion(flag, version))
    const snapshot = ServiceProcessManager.stopSnapshotFor(flag, v)
    const registrations = ServiceProcessManager.registrationSnapshot(flag)
    // 已登记实例使用启动时保存的同实例 stop 参数；未登记旧调用才回退到调用方版本对象。
    const data = await callFork(this.forkManager, flag, 'stopService', ...(snapshot?.args ?? [v]))
    if (snapshot)
      ServiceProcessManager.finishStopSnapshot(
        flag,
        snapshot,
        (data?.['APP-Service-Stop-PID'] ?? []).map(String)
      )
    else
      ServiceProcessManager.finishStoppedRegistrations(
        flag,
        registrations,
        (data?.['APP-Service-Stop-PID'] ?? []).map(String)
      )
    return data
  }

  /** 停掉某模块当前登记的所有运行实例 */
  stopAllService(flag: string): Promise<any> {
    return ServiceProcessManager.runLifecycle(flag, 'stop', () => this.stopAllServiceImpl(flag))
  }

  private async stopAllServiceImpl(flag: string): Promise<any> {
    this.assertLifecycleFlag(flag, 'stop')
    // 与退出编排使用同一份运行登记，包含单独打开的面板；展示状态会过滤 companion，
    // 不能用 statusOf.instances 作为 stop_all 的完整清理清单。
    const running = [...(ServiceProcessManager.servicePID[flag] ?? [])]
    if (running.length === 0) {
      // 没有登记在案的实例，尝试用任一已装版本触发一次 stop（兜底）
      const v = await this.pickVersion(flag).catch(() => null)
      if (v) {
        await callFork(this.forkManager, flag, 'stopService', v)
      }
      return { stopped: [] }
    }
    // 模块屏障已等待旧请求；内部直接使用公共并行编排，不能再次调用 runLifecycle
    // 排在自己的屏障之后。与退出共用参数/代次冻结、失败隔离和终态注销。
    const results = await ServiceProcessManager.stopRegisteredInstances([flag])
    return {
      stopped: results.filter(({ status }) => status === 'stopped').map(({ label }) => label),
      failed: results.filter(({ status }) => status === 'failed').map(({ label }) => label)
    }
  }

  restartService(flag: string, version?: string): Promise<any> {
    return ServiceProcessManager.runLifecycle(
      flag,
      'start',
      async (selected) => {
        // 重启持有同一实例队列直到 stop/start 均完成，不在两步之间让后续请求插入。
        this.assertLifecycleFlag(flag, 'restart')
        await this.stopServiceImpl(flag, version, selected)
        return this.startServiceImpl(flag, version, selected)
      },
      async () => {
        this.assertLifecycleFlag(flag, 'restart')
        return this.pickVersion(flag, version)
      }
    )
  }

  /** 解析一个版本对象供按版本的路径计算（缺省取运行中/第一个已装版本） */
  private async resolveVersionObj(flag: string, version?: string): Promise<any | undefined> {
    if (version) {
      const raw = await this.rawServiceVersions(flag)
      return raw.find((r: any) => r.version === version) ?? { version, typeFlag: flag }
    }
    const st = ServiceProcessManager.statusOf(flag)
    if (st.instances[0]?.version) {
      const raw = await this.rawServiceVersions(flag)
      const bin = st.instances[0].bin
      return (
        raw.find((r: any) => r.bin === bin) ?? { version: st.instances[0].version, typeFlag: flag }
      )
    }
    const raw = await this.rawServiceVersions(flag)
    return raw.find((r: any) => r.enable) ?? raw[0]
  }

  /**
   * list_log_files：返回某服务的日志文件清单（name + path + exists）。
   * 不返回内容——FlyEnv 是本地工具，AI 代理拿到 path 自行读文件（日志可能很大）。
   * 各模块在 fork 侧 getLogFiles 覆写自己的路径，新模块自带，单点维护。
   */
  async listLogFiles(flag: string, version?: string): Promise<any[]> {
    this.assertQueryableFlag(flag)
    const v = await this.resolveVersionObj(flag, version)
    const list = await callFork(this.forkManager, flag, 'listLogFiles', v)
    return Array.isArray(list) ? list : []
  }

  /**
   * list_config_files：返回某服务的配置文件清单（name + path + exists）。
   * 同上，只给路径，AI 代理自行读取。
   */
  async listConfigFiles(flag: string, version?: string): Promise<any[]> {
    this.assertQueryableFlag(flag)
    const v = await this.resolveVersionObj(flag, version)
    const list = await callFork(this.forkManager, flag, 'listConfigFiles', v)
    return Array.isArray(list) ? list : []
  }

  /** delete_site：删除本地站点 */
  async deleteSite(siteName: string): Promise<any> {
    const site = await this.findSiteByName(siteName)
    if (!site) {
      throw new Error(`Site ${siteName} not found`)
    }
    const data = await callFork(this.forkManager, 'host', 'handleHost', site, 'del')
    const list = data?.host ?? []
    if (Array.isArray(list)) {
      await this.finalizeHostMutation(list, false)
    }
    return data
  }

  /**
   * list_online_versions：查询某个模块的线上可用版本列表。
   * 供 AI 在安装前选择版本，也支持普通的信息查询。
   */
  async listOnlineVersions(flag: string): Promise<any[]> {
    this.assertInstallableFlag(flag)
    const data = await callFork(this.forkManager, flag, 'fetchAllOnlineVersion')
    const list: any[] = Array.isArray(data) ? data : []
    return list.map((v: any) => ({
      version: v?.version,
      mVersion: v?.mVersion,
      url: v?.url,
      bin: v?.bin,
      installed: v?.installed,
      downloaded: v?.downloaded
    }))
  }

  /** install_service：下载并安装某个服务的指定版本 */
  async installService(flag: string, version: string): Promise<any> {
    this.assertInstallableFlag(flag)
    const data = await callFork(this.forkManager, flag, 'fetchAllOnlineVersion')
    const list: any[] = Array.isArray(data) ? data : []
    if (list.length === 0) {
      throw new Error(`No online version available for ${flag}`)
    }
    const row = list.find((v: any) => v?.version === version)
    if (!row) {
      throw new Error(`Version ${version} of ${flag} not found in online list`)
    }
    const result = await callFork(this.forkManager, flag, 'installSoft', row)
    const refreshed = await ServiceVersionManager.refresh([flag])
    // 安装成功后通知前端刷新该 flag 的已安装版本
    // 直接携带刷新后的数据，避免前端再次触发 fetchInstalled。
    const versions = refreshed[flag] ?? []
    ServiceVersionManager.notifyRenderer({ type: 'service-installed-need-update', flag, versions })
    return { installed: version, result, versions }
  }

  async getDatabaseConnectionInfo(flag: string, version?: string) {
    this.assertDatabaseFlag(flag)
    return this.contextResolver.getDatabaseConnectionInfo(flag, version)
  }

  async resolveSiteRuntime(siteName: string) {
    return this.contextResolver.resolveSiteRuntime(siteName)
  }

  async getServiceExecInfo(flag: string, version?: string) {
    this.assertQueryableFlag(flag)
    return this.contextResolver.getServiceExecInfo(flag, version)
  }

  async resolveSiteUrls(siteName: string) {
    return this.contextResolver.resolveSiteUrls(siteName)
  }

  async getManagedFileMap(input: GetManagedFileMapInput) {
    if (input.scope === 'service') {
      this.assertQueryableFlag(`${input.flag ?? ''}`)
    }
    return this.contextResolver.getManagedFileMap(input)
  }

  // ===== MCP 响应包装 =====

  wrap = textResult
}

export { textResult }
