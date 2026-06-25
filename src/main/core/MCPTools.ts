import type { ForkManager } from './ForkManager'
import type MCPConfigManager from './MCPConfigManager'
import ServiceProcessManager from './ServiceProcess'

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
 *   3. 出站字段白名单/脱敏：绝不把 rootPassword、bin 绝对路径等敏感信息发给 AI
 *
 * 注意：这里不直接 import 渲染层类型（@/...），只用 main 进程可达的依赖。
 */

/** 调用 fork 的统一封装：返回 { code, data } 里的 data，失败抛错 */
function callFork(forkManager: ForkManager, module: string, fn: string, ...args: any[]): Promise<any> {
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

export class MCPTools {
  forkManager: ForkManager
  mcpConfig: MCPConfigManager
  /** 主配置（user.json），用于写 server[flag].current；可选注入 */
  appConfig?: { getConfig: (k?: any, d?: any) => any; setConfig: (k: string, ...a: any) => any }

  constructor(
    forkManager: ForkManager,
    mcpConfig: MCPConfigManager,
    appConfig?: { getConfig: (k?: any, d?: any) => any; setConfig: (k: string, ...a: any) => any }
  ) {
    this.forkManager = forkManager
    this.mcpConfig = mcpConfig
    this.appConfig = appConfig
  }

  /** 是否对出站内容做掩码（默认 false，本地开发工具不屏蔽 bin/path/凭据） */
  private get mask(): boolean {
    return !!this.mcpConfig.getConfig('maskSecrets')
  }

  /** 读取某个模块的全部已安装版本（原始，含 bin，仅供内部匹配用，不直接出站） */
  private async rawServiceVersions(flag: string): Promise<any[]> {
    const data = await callFork(this.forkManager, 'version', 'allInstalledVersions', [flag], {})
    const arr = data?.[flag] ?? []
    return Array.isArray(arr) ? arr : []
  }

  /** 读取某个模块的全部已安装版本 */
  async listServiceVersions(flag: string): Promise<any[]> {
    const arr = await this.rawServiceVersions(flag)
    return arr.map((v) => serializeVersion(v, !!v.run, this.mask))
  }

  /** list_services：返回一组模块及其安装/运行状态摘要 */
  async listServices(flags: string[]): Promise<any> {
    const status = ServiceProcessManager.getStatus(flags)
    const mask = this.mask
    const out: Record<string, any> = {}
    for (const flag of flags) {
      try {
        const raw = await this.rawServiceVersions(flag)
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

  /** start_service / stop_service / restart_service 的底层：需要一个 version 对象 */
  private async pickVersion(flag: string, version?: string): Promise<any> {
    const data = await callFork(this.forkManager, 'version', 'allInstalledVersions', [flag], {})
    const arr: any[] = data?.[flag] ?? []
    if (!Array.isArray(arr) || arr.length === 0) {
      throw new Error(`No installed version for ${flag}`)
    }
    if (version) {
      const find = arr.find((v) => v?.version === version && v?.enable)
      if (!find) throw new Error(`Version ${version} of ${flag} not found or not enabled`)
      return find
    }
    const enabled = arr.find((v) => v?.enable)
    if (!enabled) throw new Error(`No enabled version for ${flag}`)
    return enabled
  }

  async startService(flag: string, version?: string): Promise<any> {
    const v = await this.pickVersion(flag, version)
    // 单实例服务（nginx/mysql/redis... isOnlyRunOne）：启动某版本即「切到该版本」——
    // 与 FlyEnv UI 的 onItemStart 行为对齐，先停掉其它正在运行的版本。
    // 多实例运行时（php/node/python... 语言类）：多版本可并存，不停其它。
    if (SINGLE_INSTANCE_SERVICES.has(flag)) {
      const running = ServiceProcessManager.statusOf(flag).instances
      if (running.some((ins) => ins.bin !== v.bin)) {
        const raw = await this.rawServiceVersions(flag)
        for (const ins of running) {
          if (ins.bin === v.bin) continue
          const full = raw.find((r: any) => r.bin === ins.bin) ?? { ...ins, typeFlag: flag }
          try {
            await callFork(this.forkManager, flag, 'stopService', full)
            ServiceProcessManager.delByBin(flag, [ins.bin])
          } catch (e) {
            console.log(`startService stop other ${flag} ${ins.version} error:`, e)
          }
        }
      }
    }
    const data = await callFork(this.forkManager, flag, 'startService', v)
    // 把 PID 登记进主进程唯一状态源（与 IPCHandler.handleForkCallback 同口径），
    // 否则 MCP 启动的服务既不被 UI 感知，也不会在退出时被统一清理。
    const pid = data?.['APP-Service-Start-PID']
    if (pid) {
      ServiceProcessManager.addPid(flag, `${pid}`, v)
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

  async stopService(flag: string, version?: string): Promise<any> {
    const v = await this.pickVersion(flag, version)
    const data = await callFork(this.forkManager, flag, 'stopService', v)
    // 停服登记清理：按 bin 精确删除——只删被停的那个版本，绝不波及同模块其它版本。
    // （fork 的 stopService 已按版本精确停进程；这里只同步主进程状态登记）
    if (v?.bin) {
      ServiceProcessManager.delByBin(flag, [v.bin])
    }
    return data
  }

  /** 停掉某模块当前登记的所有运行实例 */
  async stopAllService(flag: string): Promise<any> {
    const running = ServiceProcessManager.statusOf(flag).instances
    if (running.length === 0) {
      // 没有登记在案的实例，尝试用任一已装版本触发一次 stop（兜底）
      const v = await this.pickVersion(flag).catch(() => null)
      if (v) await callFork(this.forkManager, flag, 'stopService', v)
      ServiceProcessManager.delAll(flag)
      return { stopped: [] }
    }
    const raw = await this.rawServiceVersions(flag)
    const stopped: string[] = []
    for (const ins of running) {
      // 用完整版本对象（含 bin/path）停，匹配不到则用最小对象兜底
      const full = raw.find((r: any) => r.bin === ins.bin) ?? { ...ins, typeFlag: flag }
      try {
        await callFork(this.forkManager, flag, 'stopService', full)
        stopped.push(ins.version ?? ins.bin)
      } catch (e) {
        // 单个失败不阻断其它
        console.log(`stopAllService ${flag} ${ins.version} error:`, e)
      }
    }
    ServiceProcessManager.delAll(flag)
    return { stopped }
  }

  async restartService(flag: string, version?: string): Promise<any> {
    await this.stopService(flag, version)
    return this.startService(flag, version)
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
      return raw.find((r: any) => r.bin === bin) ?? { version: st.instances[0].version, typeFlag: flag }
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
    const v = await this.resolveVersionObj(flag, version)
    const list = await callFork(this.forkManager, flag, 'listLogFiles', v)
    return Array.isArray(list) ? list : []
  }

  /**
   * list_config_files：返回某服务的配置文件清单（name + path + exists）。
   * 同上，只给路径，AI 代理自行读取。
   */
  async listConfigFiles(flag: string, version?: string): Promise<any[]> {
    const v = await this.resolveVersionObj(flag, version)
    const list = await callFork(this.forkManager, flag, 'listConfigFiles', v)
    return Array.isArray(list) ? list : []
  }

  // ===== MCP 响应包装 =====

  wrap = textResult
}

export { textResult }
