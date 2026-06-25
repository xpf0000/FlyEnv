import type { ForkManager } from './ForkManager'
import type MCPConfigManager from './MCPConfigManager'
import ServiceProcessManager from './ServiceProcess'

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

/** 对一段文本做密钥行掩码（仅在 maskSecrets 开启时调用） */
export function maskSecrets(text: string): string {
  if (!text) return text
  return text
    .split('\n')
    .map((line) => {
      // password= / pwd: / token= / secret= / api_key= 之类
      if (/(pass(word)?|pwd|secret|token|api[_-]?key|auth)\s*[:=]/i.test(line)) {
        return line.replace(/([:=]\s*).+$/, '$1******')
      }
      return line
    })
    .join('\n')
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

  constructor(forkManager: ForkManager, mcpConfig: MCPConfigManager) {
    this.forkManager = forkManager
    this.mcpConfig = mcpConfig
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
    const data = await callFork(this.forkManager, flag, 'startService', v)
    // 把 PID 登记进主进程唯一状态源（与 IPCHandler.handleForkCallback 同口径），
    // 否则 MCP 启动的服务既不被 UI 感知，也不会在退出时被统一清理。
    const pid = data?.['APP-Service-Start-PID']
    if (pid) {
      ServiceProcessManager.addPid(flag, `${pid}`, v)
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

  /** read_log：读取服务日志尾部（仅 maskSecrets 开启时掩码） */
  async readLog(flag: string, lines = 200): Promise<string> {
    // 复用各模块的日志能力；不同模块日志获取方式不同，这里统一走一个约定方法名。
    // 若模块未实现 getLogs，则 callFork 抛错，由上层转成 isError。
    const data = await callFork(this.forkManager, flag, 'getLogs', lines)
    const text = typeof data === 'string' ? data : JSON.stringify(data)
    return this.mask ? maskSecrets(text) : text
  }

  // ===== MCP 响应包装 =====

  wrap = textResult
}

export { textResult }
