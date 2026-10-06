import {
  performanceDiagnosticNow,
  performanceDiagnosticElapsed
} from '@shared/PerformanceDiagnostics'
// dispatcher 只需发送 IPC 结果，不应为此提前加载 Fn 的安装、版本、解压等工具。
import { ProcessSendError, ProcessSendLog, ProcessSendSuccess } from './ProcessSend'
import { isWindows } from '@shared/utils'
import PluginLoader from './PluginLoader'
import { withServiceStopContext, type ServiceStopContext } from '@shared/ServiceStopContext'
import { logServiceStopBoundary, withServiceStopDiagnostics } from '@shared/ServiceStopDiagnostics'
import { logWindowsPath } from '@shared/WindowsPathDiagnostics'

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
  Brew: any
  Version: any
  Tool: any
  MacPorts: any
  Caddy: any
  Composer: any
  Java: any
  Tomcat: any
  App: any
  GoLang: any
  RabbitMQ: any
  Python: any
  Maven: any
  MailPit: any
  Erlang: any
  Ruby: any
  Elasticsearch: any
  Ollama: any
  Ai: any
  Minio: any
  Rust: any
  MeiliSearch: any
  ZincSearch: any
  ModuleCustomer: any
  FTPSrv: any
  ETCD: any
  Deno: any
  Bun: any
  Perl: any
  DNS: any
  Code: any
  Consul: any
  Gradle: any
  Typesense: any
  Project: any
  Podman: any
  Image: any
  Zig: any
  Qdrant: any
  CloudflareTunnel: any
  Cloudflared: any
  OpenClaw: any
  Hermes: any
  N8N: any
  RustFS: any
  MkCert: any
  Flutter: any
  Sdkman: any
  LanguageProject: any
  CliProxyAPI: any
  Numa: any
  Rnacos: any
  Kimi: any
  ClaudeCode: any
  Codex: any
  OpenCode: any
  Antigravity: any
  CopilotCli: any
  FrankenPHP: any
  RoadRunner: any
  SwooleCli: any
  Git: any
  Cron: any
  DotNet: any
  ClickHouse: any
  Neo4j: any
  Temporal: any
  TemporalCli: any

  modules: Set<string> = new Set()
  private readonly pluginLoader = new PluginLoader()

  constructor() {}

  // 通用 worker 初始化只清理插件缓存；模块必须在 exec 收到对应命令后按需加载。
  // Cron 任务由系统调度，元数据查询由自身请求负责；这里提前导入会让每个服务
  // worker 重复加载其依赖，并推迟随后服务命令的处理。
  init() {
    this.pluginLoader.clear()
  }

  async exec(commands: Array<any>, stopOptions?: ServiceStopContext) {
    const ipcCommandKey = commands.shift()
    const then = (res: any) => {
      ProcessSendSuccess(ipcCommandKey, res)
      const memoryUsage = process.memoryUsage()
      console.log({
        modules: Array.from(this.modules),
        rss: `${Math.round((memoryUsage.rss / 1024 / 1024) * 100) / 100} MB`, // 常驻内存
        heapTotal: `${Math.round((memoryUsage.heapTotal / 1024 / 1024) * 100) / 100} MB`, // 堆内存总量
        heapUsed: `${Math.round((memoryUsage.heapUsed / 1024 / 1024) * 100) / 100} MB`, // 已用堆内存
        external: `${Math.round((memoryUsage.external / 1024 / 1024) * 100) / 100} MB`, // 外部内存
        arrayBuffers: `${Math.round((memoryUsage.arrayBuffers / 1024 / 1024) * 100) / 100} MB` // ArrayBuffer内存
      })
    }
    const error = (e: Error) => {
      ProcessSendError(ipcCommandKey, e)
      const memoryUsage = process.memoryUsage()
      console.log({
        modules: Array.from(this.modules),
        rss: `${Math.round((memoryUsage.rss / 1024 / 1024) * 100) / 100} MB`, // 常驻内存
        heapTotal: `${Math.round((memoryUsage.heapTotal / 1024 / 1024) * 100) / 100} MB`, // 堆内存总量
        heapUsed: `${Math.round((memoryUsage.heapUsed / 1024 / 1024) * 100) / 100} MB`, // 已用堆内存
        external: `${Math.round((memoryUsage.external / 1024 / 1024) * 100) / 100} MB`, // 外部内存
        arrayBuffers: `${Math.round((memoryUsage.arrayBuffers / 1024 / 1024) * 100) / 100} MB` // ArrayBuffer内存
      })
    }
    const onData = (log: string) => {
      ProcessSendLog(ipcCommandKey, log)
    }

    const module: string = commands.shift()
    const fn: string = commands.shift()
    const resolveStarted = performanceDiagnosticNow()
    // 所有内建/插件分支集中记录解析阶段，避免只给 PHP 加日志；缓存命中也记真实耗时。
    // requestKey 使用原 IPC key，不额外生成批次 ID，也不展开可能含密码的 commands。
    const trace = (stage: string, data: Record<string, unknown> = {}) => {
      // 相同 dispatcher 解析/初始化只执行一次；PATH 范围复用它，不建立另一个分派体系。
      const pathDetails = { ...data }
      delete pathDetails.error // 不复制可能含脚本/环境值的自由错误文本；失败阶段本身已标明结果。
      logWindowsPath(stage.replace('fork.stop-', 'fork.operation-'), pathDetails)
      if (fn === 'stopService') {
        logServiceStopBoundary(stage, {
          requestKey: ipcCommandKey,
          module,
          workerPid: process.pid,
          ...data
        })
      }
    }
    trace('fork.module-resolve-begin')

    this.modules.add(module)

    const doRun = (target: any, acceptsStopOptions = true) => {
      trace('fork.module-resolve-completed', {
        durationMs: performanceDiagnosticElapsed(resolveStarted),
        plugin: !acceptsStopOptions
      })
      const initStarted = performanceDiagnosticNow()
      trace('fork.module-init-begin')
      target?.init?.()
      // init 仍按原实现同步调用；returned 不表示模块自发后台任务或 Promise 已完成。
      trace('fork.module-init-returned', {
        durationMs: performanceDiagnosticElapsed(initStarted)
      })
      if (module === 'temporal') {
        target?.setForkTrace?.(ipcCommandKey)
      }
      // 内建 stopService 的可选第二参数统一在此插入，原有分组/目录/语言/身份参数
      // 顺延且内容不变。单独停止也插入 undefined，避免原第二业务参数被当成列表。
      // 插件保留外部旧签名，仅在本次调用范围绑定随请求发送的表，不破坏自定义参数。
      // 重新构建的插件与宿主通过 ServiceStopContext 的固定 Symbol 共用范围容器；
      // 旧插件包继续执行原实现，不能保证复用新首表，但不会因此发生业务参数错位。
      const invoke = () =>
        target.exec(
          fn,
          ...(fn === 'stopService' && acceptsStopOptions
            ? [commands[0], stopOptions, ...commands.slice(1)]
            : commands)
        )
      // 从 dispatcher 到公共停止日志沿用同一个 requestKey；仅抽取公开实例标识。
      // 公共 Base 将复用此诊断范围，进度/成功/失败仍由原 ForkPromise 回调结算。
      const item = commands[0]
      const invokeWithTrace = () => {
        trace('fork.stop-invoke')
        return fn === 'stopService'
          ? withServiceStopDiagnostics(
              {
                requestKey: ipcCommandKey,
                module,
                version: item?.version,
                bin: item?.bin,
                rootPid: typeof item === 'string' ? item : item?.pid
              },
              invoke
            )
          : invoke()
      }
      const operation = acceptsStopOptions
        ? invokeWithTrace()
        : withServiceStopContext(stopOptions, invokeWithTrace)
      operation
        ?.on(onData)
        ?.then(async (res: any) => {
          // 只有启动成功终态才能建立退出停止契约，code=200 的进度不进入这里。
          // 模块最了解真实启动参数：PostgreSQL DATA_DIR、Neo4j 实例目录、项目
          // PID 签名不能由 main 根据当前设置重建，否则用户切换版本/目录后会停错。
          // 模块已返回 Stop-Args 时原样保留；Base 派生模块默认保存版本+实际 PID。
          const pid = res?.['APP-Service-Start-PID']
          // 一次性命令以 -1 表示没有驻留服务；不能把这个 truthy 字符串包装成
          // 一个可停止实例。main 也独立验证登记 PID，两个边界职责不能相互替代。
          const hasServicePid =
            /^\d+$/.test(`${pid ?? ''}`) && Number.isSafeInteger(Number(pid)) && Number(pid) > 0
          if (fn === 'startService' && hasServicePid && !res?.['APP-Service-Stop-Args']) {
            const item = res?.['APP-Service-Start-Item'] ?? commands[0]
            const stopArgs = (await target.serviceStopArgs?.(
              `${pid}`,
              item,
              ...commands.slice(1)
            )) ?? [{ ...item, pid: `${pid}` }]
            res = { ...res, 'APP-Service-Stop-Args': stopArgs }
          }
          // 单独打开 Web 面板也要登记退出清理，但不能把面板 PID 视作数据库 PID。
          // 模块给出 companionOnly 等专用停止参数；main 仅保存通用 companion
          // 标记，状态展示过滤它、退出/stop_all 仍遍历它。不能只遍历显示运行态。
          const companionArgs = hasServicePid && target.companionStopArgs?.(fn, `${pid}`, commands)
          if (companionArgs) {
            res = {
              ...res,
              'APP-Service-Stop-Args': companionArgs,
              'APP-Service-Stop-Companion': true
            }
          }
          trace('fork.stop-completed')
          then(res)
        })
        ?.catch((failure: Error) => {
          trace('fork.stop-failed', { error: String(failure) })
          error(failure)
        })
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
        if (isWindows()) {
          const res = await import('./module/Php.win')
          this.Php = res.default
        } else {
          const res = await import('./module/Php')
          this.Php = res.default
        }
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
    } else if (module === 'clickhouse') {
      if (!this.ClickHouse) {
        const res = await import('./module/ClickHouse')
        this.ClickHouse = res.default
      }
      doRun(this.ClickHouse)
    } else if (module === 'neo4j') {
      if (!this.Neo4j) {
        const res = await import('./module/Neo4j')
        this.Neo4j = res.default
      }
      doRun(this.Neo4j)
    } else if (module === 'pure-ftpd') {
      if (!this.PureFtpd) {
        const res = await import('./module/PureFtpd')
        this.PureFtpd = res.default
      }
      doRun(this.PureFtpd)
    } else if (module === 'node') {
      if (!this.Node) {
        if (isWindows()) {
          const res = await import('./module/Node.win')
          this.Node = res.default
        } else {
          const res = await import('./module/Node')
          this.Node = res.default
        }
      }
      doRun(this.Node)
    } else if (module === 'brew') {
      if (!this.Brew) {
        const res = await import('./module/Brew')
        this.Brew = res.default
      }
      doRun(this.Brew)
    } else if (module === 'version') {
      if (!this.Version) {
        const res = await import('./module/Version')
        this.Version = res.default
      }
      doRun(this.Version)
    } else if (module === 'tools') {
      if (!this.Tool) {
        if (isWindows()) {
          const res = await import('./module/Tool.win')
          this.Tool = res.default
        } else {
          const res = await import('./module/Tool')
          this.Tool = res.default
        }
      }
      doRun(this.Tool)
    } else if (module === 'macports') {
      if (!this.MacPorts) {
        const res = await import('./module/MacPorts')
        this.MacPorts = res.default
      }
      doRun(this.MacPorts)
    } else if (module === 'sdkman') {
      if (!this.Sdkman) {
        const res = await import('./module/Sdkman')
        this.Sdkman = res.default
      }
      doRun(this.Sdkman)
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
    } else if (module === 'mailpit') {
      if (!this.MailPit) {
        const res = await import('./module/MailPit')
        this.MailPit = res.default
      }
      doRun(this.MailPit)
    } else if (module === 'erlang') {
      if (!this.Erlang) {
        const res = await import('./module/Erlang')
        this.Erlang = res.default
      }
      doRun(this.Erlang)
    } else if (module === 'ruby') {
      if (!this.Ruby) {
        const res = await import('./module/Ruby')
        this.Ruby = res.default
      }
      doRun(this.Ruby)
    } else if (module === 'elasticsearch') {
      if (!this.Elasticsearch) {
        const res = await import('./module/Elasticsearch')
        this.Elasticsearch = res.default
      }
      doRun(this.Elasticsearch)
    } else if (module === 'ollama') {
      if (!this.Ollama) {
        const res = await import('./module/Ollama')
        this.Ollama = res.default
      }
      doRun(this.Ollama)
    } else if (module === 'ai') {
      if (!this.Ai) {
        const res = await import('./module/Ai')
        this.Ai = res.default
      }
      doRun(this.Ai)
    } else if (module === 'minio') {
      if (!this.Minio) {
        const res = await import('./module/Minio')
        this.Minio = res.default
      }
      doRun(this.Minio)
    } else if (module === 'rust') {
      if (!this.Rust) {
        const res = await import('./module/Rust')
        this.Rust = res.default
      }
      doRun(this.Rust)
    } else if (module === 'meilisearch') {
      if (!this.MeiliSearch) {
        const res = await import('./module/MeiliSearch')
        this.MeiliSearch = res.default
      }
      doRun(this.MeiliSearch)
    } else if (module === 'zincsearch') {
      if (!this.ZincSearch) {
        const res = await import('./module/ZincSearch')
        this.ZincSearch = res.default
      }
      doRun(this.ZincSearch)
    } else if (module === 'module-customer') {
      if (!this.ModuleCustomer) {
        const res = await import('./module/ModuleCustomer')
        this.ModuleCustomer = res.default
      }
      doRun(this.ModuleCustomer)
    } else if (module === 'ftp-srv') {
      if (!this.FTPSrv) {
        const res = await import('./module/FTPSrv')
        this.FTPSrv = res.default
      }
      doRun(this.FTPSrv)
    } else if (module === 'etcd') {
      if (!this.ETCD) {
        const res = await import('./module/ETCD')
        this.ETCD = res.default
      }
      doRun(this.ETCD)
    } else if (module === 'deno') {
      if (!this.Deno) {
        const res = await import('./module/Deno')
        this.Deno = res.default
      }
      doRun(this.Deno)
    } else if (module === 'bun') {
      if (!this.Bun) {
        const res = await import('./module/Bun')
        this.Bun = res.default
      }
      doRun(this.Bun)
    } else if (module === 'perl') {
      if (!this.Perl) {
        const res = await import('./module/Perl')
        this.Perl = res.default
      }
      doRun(this.Perl)
    } else if (module === 'dns') {
      if (!this.DNS) {
        const res = await import('./module/DNS')
        this.DNS = res.default
      }
      doRun(this.DNS)
    } else if (module === 'code') {
      console.log('codeRun 00: ', Math.round(new Date().getTime() / 1000))
      if (!this.Code) {
        const res = await import('./module/Code')
        this.Code = res.default
      }
      console.log('codeRun 11: ', Math.round(new Date().getTime() / 1000))
      doRun(this.Code)
    } else if (module === 'consul') {
      if (!this.Consul) {
        const res = await import('./module/Consul')
        this.Consul = res.default
      }
      doRun(this.Consul)
    } else if (module === 'temporal') {
      if (!this.Temporal) {
        const res = await import('./module/Temporal')
        this.Temporal = res.default
      }
      doRun(this.Temporal)
    } else if (module === 'temporal-cli') {
      if (!this.TemporalCli) {
        const res = await import('./module/TemporalCli')
        this.TemporalCli = res.default
      }
      doRun(this.TemporalCli)
    } else if (module === 'gradle') {
      if (!this.Gradle) {
        const res = await import('./module/Gradle')
        this.Gradle = res.default
      }
      doRun(this.Gradle)
    } else if (module === 'typesense') {
      if (!this.Typesense) {
        const res = await import('./module/Typesense')
        this.Typesense = res.default
      }
      doRun(this.Typesense)
    } else if (module === 'project') {
      if (!this.Project) {
        const res = await import('./module/Project')
        this.Project = res.default
      }
      doRun(this.Project)
    } else if (module === 'podman') {
      if (!this.Podman) {
        const res = await import('./module/Podman')
        this.Podman = res.default
      }
      doRun(this.Podman)
    } else if (module === 'image') {
      if (!this.Image) {
        const res = await import('./module/Image')
        this.Image = res.default
      }
      doRun(this.Image)
    } else if (module === 'zig') {
      if (!this.Zig) {
        const res = await import('./module/Zig')
        this.Zig = res.default
      }
      doRun(this.Zig)
    } else if (module === 'qdrant') {
      if (!this.Qdrant) {
        const res = await import('./module/Qdrant')
        this.Qdrant = res.default
      }
      doRun(this.Qdrant)
    } else if (module === 'cloudflare-tunnel') {
      if (!this.CloudflareTunnel) {
        const res = await import('./module/CloudflareTunnel')
        this.CloudflareTunnel = res.default
      }
      doRun(this.CloudflareTunnel)
    } else if (module === 'cloudflared') {
      if (!this.Cloudflared) {
        const res = await import('./module/Cloudflared')
        this.Cloudflared = res.default
      }
      doRun(this.Cloudflared)
    } else if (module === 'openclaw') {
      if (!this.OpenClaw) {
        const res = await import('./module/OpenClaw')
        this.OpenClaw = res.default
      }
      doRun(this.OpenClaw)
    } else if (module === 'hermes') {
      if (!this.Hermes) {
        const res = await import('./module/Hermes')
        this.Hermes = res.default
      }
      doRun(this.Hermes)
    } else if (module === 'n8n') {
      if (!this.N8N) {
        const res = await import('./module/N8N')
        this.N8N = res.default
      }
      doRun(this.N8N)
    } else if (module === 'rustfs') {
      if (!this.RustFS) {
        const res = await import('./module/RustFS')
        this.RustFS = res.default
      }
      doRun(this.RustFS)
    } else if (module === 'mkcert') {
      if (!this.MkCert) {
        const res = await import('./module/MkCert')
        this.MkCert = res.default
      }
      doRun(this.MkCert)
    } else if (module === 'flutter') {
      if (!this.Flutter) {
        const res = await import('./module/Flutter')
        this.Flutter = res.default
      }
      doRun(this.Flutter)
    } else if (module === 'language-project') {
      if (!this.LanguageProject) {
        const res = await import('./module/LanguageProject')
        this.LanguageProject = res.default
      }
      doRun(this.LanguageProject)
    } else if (module === 'cliproxyapi') {
      if (!this.CliProxyAPI) {
        const res = await import('./module/CliProxyAPI')
        this.CliProxyAPI = res.default
      }
      doRun(this.CliProxyAPI)
    } else if (module === 'numa') {
      if (!this.Numa) {
        const res = await import('./module/Numa')
        this.Numa = res.default
      }
      doRun(this.Numa)
    } else if (module === 'rnacos') {
      if (!this.Rnacos) {
        const res = await import('./module/Rnacos')
        this.Rnacos = res.default
      }
      doRun(this.Rnacos)
    } else if (module === 'frankenphp') {
      if (!this.FrankenPHP) {
        const res = await import('./module/FrankenPHP')
        this.FrankenPHP = res.default
      }
      doRun(this.FrankenPHP)
    } else if (module === 'roadrunner') {
      if (!this.RoadRunner) {
        const res = await import('./module/RoadRunner')
        this.RoadRunner = res.default
      }
      doRun(this.RoadRunner)
    } else if (module === 'swoole-cli') {
      if (!this.SwooleCli) {
        const res = await import('./module/SwooleCli')
        this.SwooleCli = res.default
      }
      doRun(this.SwooleCli)
    } else if (module === 'git') {
      if (!this.Git) {
        const res = await import('./module/Git')
        this.Git = res.default
      }
      doRun(this.Git)
    } else if (module === 'cron') {
      // 仅 Cron 请求加载本模块；doRun 沿用其他模块相同的 init/exec 派发顺序。
      // 后台元数据同步由单例防重，不在通用 worker 初始化或退出时另行触发。
      if (!this.Cron) {
        const res = await import('./module/Cron')
        this.Cron = res.default
      }
      doRun(this.Cron)
    } else if (module === 'dotnet') {
      if (!this.DotNet) {
        const res = await import('./module/DotNet')
        this.DotNet = res.default
      }
      doRun(this.DotNet)
    } else if (module === 'kimi') {
      if (!this.Kimi) {
        const res = await import('./module/Kimi')
        this.Kimi = res.default
      }
      doRun(this.Kimi)
    } else if (module === 'claudeCode') {
      if (!this.ClaudeCode) {
        const res = await import('./module/ClaudeCode')
        this.ClaudeCode = res.default
      }
      doRun(this.ClaudeCode)
    } else if (module === 'codex') {
      if (!this.Codex) {
        const res = await import('./module/Codex')
        this.Codex = res.default
      }
      doRun(this.Codex)
    } else if (module === 'openCode') {
      if (!this.OpenCode) {
        const res = await import('./module/OpenCode')
        this.OpenCode = res.default
      }
      doRun(this.OpenCode)
    } else if (module === 'antigravity') {
      if (!this.Antigravity) {
        const res = await import('./module/Antigravity')
        this.Antigravity = res.default
      }
      doRun(this.Antigravity)
    } else if (module === 'copilotCli') {
      if (!this.CopilotCli) {
        const res = await import('./module/CopilotCli')
        this.CopilotCli = res.default
      }
      doRun(this.CopilotCli)
    } else {
      const target = await this.pluginLoader.load(module)
      if (target) {
        doRun(target, false)
      } else {
        trace('fork.module-resolve-failed', { reason: 'module-not-found' })
        ProcessSendError(ipcCommandKey, 'No Found Module')
      }
    }
  }

  async destroy() {}
}
export default BaseManager
