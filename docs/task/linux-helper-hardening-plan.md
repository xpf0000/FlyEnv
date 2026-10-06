# Linux 帮助程序权限优化方案

日期：2026-10-05。

状态：已按用户授权实施，当前分支 `fix/linux-helper-hardening`。以下为批准方案，实际简化取舍与验证记录见第 13 节。未安装线上 helper，未修改真实 hosts 或系统信任库。

依据：[用户安全反馈](linux-issues.md)、根目录 AGENTS.md、模块边界与失败边界技能，以及现有 Windows 权限执行链。

## 1 目标和已确认约束

保留 Linux 常驻 root helper，把桌面用户获得的能力从“执行 root 脚本、覆盖系统文件”收缩为安装时明确批准的有限业务操作。每个请求都由 helper 核验真实调用者、操作类别、资源范围和参数；普通权限能够完成的操作回到普通进程。

用户已确认：

- 盘点目前 Linux 需要权限的操作。
- 关闭任意脚本执行和通用系统文件覆盖，提供明确的业务接口。
- helper 增加权限验证。
- Pure-Ftpd 可以由 helper 以 root 启动，兼容 FlyEnv 普通用户安装的版本；不要求管理员安装 FTP，也不检查程序或动态库完整性。这类被篡改程序的风险由用户明确排除在本轮范围外。
- helper 仅安装时授权，其日常业务请求不再显示认证窗口。
- helper 不采用 UAC 式一次性提权执行，不增加日常 polkit、pkexec 或 sudo 密码弹窗。
- hosts 保留任意域名、任意 IP 地址和界面全文编辑，不增加域名/IP 授权名单。
- XTerm 命令中必要的 sudo 保留，包括应用生成并在 XTerm 展示执行的安装维护命令，不限于用户手工输入的命令；终端中的 sudo 继续遵循操作系统自己的认证和权限规则。

因此，helper 的权限验证是“安装时建立授权策略，日常由 helper 强制执行”，不采用逐次管理员认证。新增 helper 权限范围只能通过重新执行受管理员授权的安装维护流程变更；日常 RPC 超出范围时直接失败，不能自动弹窗扩大权限。XTerm 现有必要 sudo 属于独立的终端执行能力，其系统认证提示不受“helper 日常无认证窗口”约束，不迁入 helper 授权策略。

**安全目标**：关闭通用 root 脚本执行、系统文件覆盖和任意进程终止接口，由 helper 强制执行身份与业务资源约束。Pure-Ftpd 的用户安装程序仍以 root 运行，按用户明确要求不处理程序及依赖被篡改的风险；因此本方案不声称阻断同 UID 经这个 root 程序执行路径取得任意 root 代码执行。

**授权边界**：安装时批准的有限业务能力仍可被该用户的其他代码调用；无日常认证的设计不能同时保证“每次操作必然由用户亲自点击”。例如 `/etc/hosts` 的完整内容修改、已批准证书安装和低端口绑定能力仍属于被委托的权限。hosts 全文写入可以改变系统域名解析；该能力是本次明确保留的长期授权，不能声称能阻止同 UID 代码修改系统解析。不能把 HMAC 或客户端路径检查描述为同用户恶意代码的隔离保证。

## 2 当前 Linux 提权操作盘点

以下区分“当前代码使用 root/helper”与“业务确实需要系统权限”。普通配置、日志、插件和环境变量通常无需 root，当前回退行为不代表必须保留提权。

| 操作 | 当前入口和执行方式 | 权限判断与建议 |
| --- | --- | --- |
| helper 安装和升级 | `src/main/core/AppHelper.ts`、`static/sh/Linux/flyenv-helper-init.sh`；写 `/usr/local/bin`、角色/根目录策略、systemd unit 并启停服务 | 确需管理员权限；保留安装维护授权，保护来源、策略和发布顺序 |
| Nginx、Apache 启动 | 对应 fork 模块调用 `serviceStartExec({root:true})`，最终 `tools.runScript` | 80/443 等低端口可能需要额外权限；不应因此让用户提供的程序和配置以 root 运行 |
| Caddy、FrankenPHP 启动 | 同上，Linux 固定走 root 分支 | 按实际端口决定；普通端口普通启动，低端口只提供绑定能力 |
| Tomcat、Numa 启动 | `Tomcat/index.ts`、`Numa/index.ts`，Linux 固定 `root:true` | 源码不足以证明业务始终需要 root；先移除固定 root，按实际缺失能力判断，不自动恢复 root |
| Pure-Ftpd 启动 | `PureFtpd/index.ts` 使用 `sudo -S`，不经过 helper；终端分支还包含 macOS 特定代码 | FTP 低端口、身份切换和系统认证是不同权限；不能统一替换为低端口 capability，需单独验收兼容性 |
| 自定义服务、语言项目的 sudo 模式 | `customerServiceStartExec`、`ModuleCustomer.ts`、`LanguageProjects/ProjectItem.ts` 的 `isSudo` | 本质是任意用户命令提权；不迁入 helper，Linux 应取消应用后台自动 sudo 模式 |
| 站点 hosts 同步、删除及退出清理 | `Host/index.ts`、`ServerManager.cleanHosts()`，通过通用 root 写入覆盖 `/etc/hosts` | 确需系统文件写权限；改为 helper 解析并更新自己的托管块 |
| 手工 hosts／系统环境文件编辑 | `Tool.systemEnvSave`、main 的通用 `fs_writeFile`／`fs_writeBufferBase64` 回退；环境文件列表含 `/etc/profile`、`/etc/paths` | hosts 全文编辑改走固定目标的专用接口；其他系统文件关闭自动 root 全文编辑，普通读取，禁止通用写入回退 |
| CA 证书加入系统信任 | `Host/SSL.ts` → `host.sslAddTrustedCert`；helper 内调用 sudo cp 和系统 CA 更新工具 | 确需系统权限；仅能安装管理员在 helper 安装时批准并留存的证书 |
| CA 证书查询 | `host.sslFindCertificate` 使用 find、openssl | 优先普通读取和 Go 证书解析；不为查询新增 root 通用文件访问 |
| DNS 缓存刷新 | `host.dnsRefresh` 在 root helper 内再次 sudo，尝试重启 resolved、nscd、dnsmasq | 可能需要系统权限；限制为固定解析器刷新，优先作为 hosts 写入后的附加动作 |
| 进程列表、端口进程查询 | `ProcessListFetch`、`fetchProcessPidByPort` 会优先使用 helper | 优先普通查询；确需 helper 查询时只返回有限元数据，不返回 root 进程的任意敏感内容 |
| 服务停止、PID 工具、清理端口 | `ProcessKillStrict`、`Tool/process.ts` → `tools.kill`、`tools.killPorts` | 同 UID 进程通常普通权限可停止；取消对任意 PID/端口目标的 root 终止能力 |
| PID 目录所有者修复和删除 | `Base.ensureAppPidDirWritable` → `redis.logFileFixed`，随后可回退 `tools.rm` | 旧 root 启动可能留下 root 所有目录；仅保留固定 PID 目录的所有者修复，不递归删除或任意 chown |
| PHP ini 创建、复制及保存 | `Php/index.ts`、`php.iniFileFixed`、`tools.chmod`、通用 root 写入 | FlyEnv 自有 PHP 改用用户配置文件；系统 PHP 配置不提供通用 root 覆盖；取消 777 提权修复 |
| RabbitMQ 管理插件初始化 | `RabbitMQ._initPlugin` → `rabbitmq.initPlugin`；helper 执行调用者指定目录中的 `rabbitmq-plugins` | 另一条执行用户可修改程序的 root 路径；移到普通用户执行，不仅关闭 runScript |
| Shell 集成、PATH、别名 | `Tool/init.ts`、`path.ts`、`alias.ts`；通用 root 读写，集成脚本还会 helper chmod/chown | 改为用户数据目录中的集成脚本和用户 profile；不修改安装目录权限，不使用 root |
| 通用 root 文件操作 | `Fn.ts`、main utils、`AppNodeFn.ts` → read/write/base64/rm/chmod；`ln_s` 已公开但未找到当前业务调用 | Linux 停用这些 RPC；普通权限失败如实返回，不能再自动扩大权限 |
| Git、Homebrew 依赖安装 | `Git/setup.ts`、`VersionManager/brew/setup.ts` 和 Linux brew 安装脚本，在终端使用 sudo/package manager | 保留 XTerm 自动生成的必要 sudo 安装命令和终端交互；不把包管理器或远程安装脚本暴露为 helper RPC |
| pgvector 编译安装 | `PostgreSql/Extension/setup.ts` 的终端实际执行 sudo make/install/rm；fork 的 `installPgvector` 当前只生成脚本，执行代码已注释 | 保留 XTerm 中系统目录安装及需要权限的清理等必要 sudo；不统一删除现有终端命令中的 sudo，也不开放 helper root 构建接口；某条编译命令是否需要 sudo 可单独评估 |
| Ollama 硬件信息 | `Ollama/Linux.ts` 使用 `sudo dmidecode -t memory` | 补充硬件信息不应静默提权；采用普通可读信息，权限不足时省略详细字段 |
| 应用保存和复用 sudo 密码 | `IPCHandler.handlePasswordCheck` 将密码写配置、放入 `global.Server.Password` 并回传 renderer；`execPromiseSudo` 自动送入 stdin，`NodePTY.ts` 也会响应 `Password:` 注入该值 | Linux 停止保存、广播和跨请求自动复用管理员密码，清理旧配置和内存值；保留 XTerm 命令、用户终端输入与 sudo 自身的认证机制 |

盘点说明：

- MySQL/MariaDB 的 `macportsDirFixed`、Mailpit quarantine 清理、MacPorts 和 Windows 系统 PATH 属于其他平台，不纳入 Linux 接口保留名单。
- OpenClaw 的 Linux 服务安装使用 `systemctl --user`；源码中的 `sudo openclaw` 仅在 macOS 分支，不算 Linux root 操作。
- `AppWithRoot` 是历史声明，静态搜索未发现当前引用；不能把该数组当作实际 Linux 提权调用清单。
- 用户使用 XTerm 执行应用生成的安装维护任务，或手工输入 sudo 命令，都属于保留的终端能力。必要 sudo 命令继续由普通用户 PTY 执行，并按 sudo 自身规则认证；应用不以 helper 代执行，也不从持久化配置自动提供管理员密码。
- `Host/SSLTips` 的复制 sudo 命令是手工维护说明，不是 helper RPC；需要调整说明，避免让它成为应用自动失败回退。

## 3 推荐架构

日常调用链为：Vue 页面 → 既有模块操作控制器／生命周期 → main/fork → Linux 业务 RPC → helper 身份与策略验证 → 固定业务实现。

普通文件操作、普通服务、Shell 集成、插件初始化和同 UID 进程停止由普通 main/fork 执行，不因 helper 在线就优先提权。helper 只处理明确保留的能力。

采用“有限业务接口 + root 保护的授权策略 + 执行前降权”的组合。仅增加进程路径/HMAC 校验不能修复同用户攻击；仅在 root 目录内生成脚本也不能消除脚本引用的用户程序、配置和插件的风险。

本轮保留现有单个授权 UID 的 Linux 服务模型，不扩展为新的多用户实例系统。Windows 与 macOS 业务行为独立保持；本方案不宣称修复 macOS 同类风险。

## 4 安装时建立权限范围

安装器从原始桌面账户获得 UID/GID 和真实目录，验证非 root 目标账户，将固定版本的策略写入 `/etc/flyenv-helper/policy.json`。文件及父目录由 root 所有，普通用户不可修改；不信任日常 renderer/fork 传来的新根目录、UID、GID 或权限标志。

策略至少包含：协议版本、授权 UID/GID、经验证的数据根、启用的 action、固定 hosts 文件读写能力、批准的 CA 指纹与证书存档、允许低端口能力的内置服务类别。策略不包含 hosts 域名、后缀或 IP 范围限制。策略按 schema 拒绝未知字段和不支持的版本，缺失或不安全时拒绝特权业务请求。

安装界面在原有管理员安装确认前，说明将长期委托的能力，不增加日常确认：

- 读写固定 `/etc/hosts`：支持任意域名/IP 的站点同步，也支持界面全文编辑。
- 为列明的内置服务提供低端口绑定能力，程序仍以桌面 UID 运行。
- 修复当前 FlyEnv 固定 PID 目录。
- 如用户启用系统证书信任，登记并存档指定 CA 公共证书和指纹。

hosts 的资源边界是固定系统文件 `/etc/hosts`，不限制域名、域名后缀或 IP 地址，不要求新增站点和编辑内容重新安装授权。自动站点同步、退出清理只更新 FlyEnv 托管块；用户手工编辑明确允许覆盖完整 hosts 文本，保留现有编辑能力。两种写入采用不同业务接口，共用同一个文件事务和冲突处理；客户端都不能传入目标路径，不能将这一授权转用于 `/etc/profile` 等其他文件。

CA 在普通用户进程生成后，由安装器读取公共证书快照，展示并登记指纹，root 目录留存该公共证书。无需把 CA 私钥交给 helper。未批准证书、证书重新生成或额外 CA，日常返回范围不足，设置页指向重新安装维护；不能自动发起授权。批准开发 CA 本身是长期信任授权，不应描述为普通低风险操作。

现有签名密钥为兼容现有 RPC 继续保留，只允许目标用户读取，由 root 控制其内容、权限和父目录；移除用户所有者。采用私有组的只读权限或针对 UID 的 ACL，不能把组共享误当成单用户访问；Linux 的密钥创建、校验及修复同步采用这一权限契约，不套用现有 chown 到用户的逻辑。**密钥属于协议认证手段，不决定业务权限范围。**

角色文件和 allowed-roots 的 `/tmp` 用户可写回退不再作为 Linux 授权依据，`.flyenv.dir` 和其他用户配置也不作为 root 策略来源。

## 5 日常权限验证

每个 helper 请求按下面顺序检查，任一步失败都不得自动回退为 sudo、pkexec、安装、重试 root 命令或切换传输方式；这不限制用户独立启动的 XTerm 安装维护任务：

1. **系统连接身份**：从 Unix socket `SO_PEERCRED` 获取真实 UID/GID/PID，UID 必须匹配安装策略。客户端声称的 UID 或“管理员”字段没有授权效力。
2. **请求一致性**：校验 claimed PID/executable 与实际连接进程、签名、时间窗和 nonce。可执行文件名或路径不能作为同 UID 下的可信应用证明，不能替代后续检查。
3. **操作授权**：Linux 分发器采用明确的 action 允许表，验证 action 在安装策略内；旧通用 root 方法即使签名正确也直接拒绝。
4. **资源授权**：根据策略确定系统目标文件、数据根、CA 指纹、允许的服务类型和固定 FTP 服务单元。请求不能自选系统目标路径、目标 UID、任意 PID 或系统服务名。
5. **参数和资源安全**：业务字段使用严格 schema，拒绝未知字段、路径穿越和意图扩大权限的值；控制字符、脚本和 shell 片段不能进入路径、命令及启动选项。hosts 全文是文本数据，允许正常换行和注释，不根据其中的域名、IP 或类似脚本的文字拒绝编辑，也绝不将文本交给 shell 执行；对需要 root 接触的文件使用句柄级安全操作。
6. **执行权限**：root 只能执行 helper 自身实现和受保护的固定系统工具。所有用户可修改的程序、脚本、配置或插件，必须在降为目标 UID 后才加载或执行。

请求总大小沿用 1 MiB 上限，这是传输资源边界，不是 hosts 域名/IP 白名单；不新增 hosts 条数或域名授权限制，超大文件返回明确的大小错误。CA 公共证书存档最多 256 KiB；执行及输出有界。对同 UID 限制在途请求数量和单资源写入并发，避免伪造请求耗尽服务资源。

socket 迁至 root 控制的 `/run/flyenv-helper/helper.sock`，父目录不允许用户替换；socket 仅目标 UID 可连接。创建、权限设定完成后才开始受理业务请求，取消“监听后异步 sleep/chown”的窗口。

这套校验不使用日常 polkit 检查，也不保存管理员密码。来自同 UID 的有效请求即使通过身份检查，仍只能使用上述有限能力。

## 6 保留的业务接口

接口名为建议，实施时同步 Go、TypeScript 和 `helper-contract.json`。业务数据结构放在对应模块；通用 IPC/权限层只负责传输、错误和操作生命周期。

| 建议接口 | 输入 | helper 固定行为与权限范围 |
| --- | --- | --- |
| `helper.version`、`helper.health` | 无业务路径 | 返回版本及策略是否可用；不暴露密钥或任意文件内容 |
| `host.readHosts` | 无路径 | 读取固定 `/etc/hosts` 并返回完整文本和内容摘要，供手工编辑；不提供任意 root 文件读取 |
| `host.replaceHostsContent` | 完整文本、读取时的内容摘要 | 将用户编辑文本写入固定 `/etc/hosts`，不限制域名/IP，不限制到托管块；目标文件内容已变化时返回冲突，不自动覆盖 |
| `host.syncManagedEntries` | 结构化域名和 IP 列表、旧托管块摘要 | 在固定 `/etc/hosts` 内协调 FlyEnv 托管块；域名/IP 不加授权范围限制，保留块外内容；冲突返回明确结果 |
| `host.clearManagedEntries` | 旧托管块摘要 | 只删除完整 FlyEnv 托管块；不接收 hosts 全文或目标路径，用于退出清理 |
| `host.installApprovedCA` | 安装时登记的指纹 | 从 root 保护的证书存档读取固定公共证书，安装到 helper 派生的 `flyenv-<fingerprint>.crt`，更新对应发行版信任库；不读客户端提供的证书文件 |
| `tools.repairManagedPidDirectory` | 无路径、owner、mode 或递归参数 | 只恢复策略数据根下固定 `pid` 目录给目标账户使用；不处理其他目录，不递归 chown，不回退 rm |
| `service.launchLowPort` | 内置 Web 服务类型、程序及固定服务参数 | 在读取用户配置、打开日志和执行程序前降低 UID/GID；仅提供 `CAP_NET_BIND_SERVICE`，不接受脚本、shell 字符串或任意 capability |
| `ftp.start` | 所选版本的 pure-ftpd 程序路径 | 支持普通用户安装的 ELF 程序；校验固定配置与账户，生成受保护的前台配置/PureDB，以 root 启动固定 systemd 单元并返回真实 PID |
| `ftp.stop` | 无参数 | 只停止安装 UID 对应的固定 FTP 单元及其整个控制组，不接受 PID、unit 名或任意信号 |
| `ftp.refreshUsers` | 无参数 | 读取固定用户账户文件，将身份绑定安装 UID/GID，原子更新运行中的 PureDB；没有运行实例时不需要发布 |

DNS 刷新作为 hosts 全文保存、自动同步或清理成功后的内部附加动作，优先固定系统解析器的缓存清理方式。识别发行版/解析器由 helper 负责，不能接收任意 unit 名；不为了刷新失败尝试重启多个无关系统服务。独立刷新工具如需保留，只开放安装策略批准的同一固定刷新动作。

Linux 明确关闭：`tools.runScript`、`writeFileByRoot`、`writeBufferBase64ByRoot`、`readFileByRoot`、`rm`、`chmod`、`ln_s`、任意 PID 的 root `kill`/`killPorts`、通用 `redis.logFileFixed`、root `php.iniFileFixed`、root `rabbitmq.initPlugin` 和可导入任意 CA 的旧接口。普通权限实现可以保留原功能名，但不得再把错误回退为这些 Linux RPC。

手工全文编辑 `/etc/hosts` 通过 `host.readHosts`/`host.replaceHostsContent` 保留。main 的通用文件 IPC 识别这一固定业务目标后转入专用接口，不把它重新开放为通用 root 路径参数。系统环境文件编辑器对 `/etc/profile`、`/etc/paths` 等其他系统文件改为只读说明；用户自己的 profile、项目配置和文件仍按普通文件权限读写。

## 7 服务启动的关键处理

Web 服务在执行用户程序前降权；Pure-Ftpd 按用户明确授权保留 root 身份切换能力，使用独立固定接口。程序及依赖完整性不属于本轮检查范围。

- 普通端口的 Web 服务沿用普通用户启动。已知监听端口低于系统 `ip_unprivileged_port_start` 时，启动前直接选择 helper；不能确定端口时，仅由本次新产生的绑定权限错误触发单次回退。
- 需要低端口的内置服务，通过受保护的 helper 启动适配器创建子进程，在读取用户工作目录、日志、配置和程序前清理 root 附加组、降低真实/有效/保存 UID/GID，并限定 capability。
- 子进程只保留 `CAP_NET_BIND_SERVICE`，不授予 `CAP_SETUID`、`CAP_DAC_OVERRIDE`、`CAP_SYS_ADMIN` 或 `CAP_KILL`；不在用户可修改的程序文件上持久执行 setcap。
- 清理继承的特权文件描述符和环境；用户日志文件在降权后打开；helper 自身不能 source 用户 profile、加载用户插件或按用户 PATH 查找 root 工具。
- 设置禁止通过后续 setuid/文件 capability 扩大权限的约束，并实测 capability 的传递与脚本/解释器行为；不能仅因调用了 setuid 就声称已完整降权。
- Nginx/Apache 等适配器调整用户运行时不适用的配置指令和目录；Tomcat 使用普通 JVM 前台启动；各模块仍复用既有启停生命周期。
- Numa 在普通 UID 下验收实际需求；缺少低端口绑定以外的能力时返回明确失败，不默认授予更多能力。
- Pure-Ftpd 不采用普通启动后回退，也不使用 node-pty：直接由固定 helper FTP 接口以 root 启动，不弹认证窗口。虚拟账户 UID/GID 来自安装策略，用户配置不能选择其他系统身份、配置包含、外部认证或任意日志目标。
- 自定义模块和语言项目不能通过该接口获得后台任意 root 执行，Linux 的已有 `isSudo` 配置保留记录，普通后台分支不再自动提权；已有明确在 XTerm 展示运行的必要 sudo 分支保留终端执行与认证，给出对应迁移说明。

`CAP_NET_BIND_SERVICE` 提供的是低端口绑定能力，不能精确限定为只有 80/443，也可能传给程序子进程。安装说明必须准确说明委托范围；如后续需要严格限定端口，应另行设计端口代理/预绑定方案，不能声称本方案已做到。该能力定义见 [Linux capabilities 手册](https://man7.org/linux/man-pages/man7/capabilities.7.html)。

## 8 文件和进程的执行边界

root 业务写入不得使用“先字符串路径校验，再按该路径重新打开”的方式。固定 root 父目录用 dirfd 锚定，结合 `openat2` 或逐级 `openat`、no-follow 及 fd 检查，覆盖符号链接、路径替换、普通文件硬链接和类型异常。用户数据根存在合法系统别名时，在安装维护阶段核实真实根并记录；日常不能因别名自行扩大范围。

hosts 更新在受保护的同目录临时文件中写入，保留权限、所有者、ACL 与 xattr/SELinux 标签，原子发布前核对旧内容/托管块变化；检测到并发外部修改时报告冲突，不覆盖未读取的新内容。外部程序不遵守同一文件锁时，最后检查与发布仍可能竞争；实现与验收必须记录这个限制，不能声称原子 rename 本身解决了外部并发更新。容器 bind-mounted hosts、只读文件系统等不支持安全发布时如实失败，不退化为无保护截断写入。

CA 更新先确定发行版对应信任工具和存档证书，再复制并更新。复制成功但信任更新失败要返回“证书已放置，信任库更新失败”，不能伪装完成，也不尝试另一套发行版再次安装。系统工具使用受保护的绝对路径，不依赖用户 PATH；helper 已为 root，不再嵌套 sudo。

PID 目录只对准确的固定目录句柄修复；未知子项、权限异常或无法证明范围时报告失败，不递归 chmod/chown/rm，也不删除已有 PID 记录来伪装恢复成功。

Web 服务沿用同 UID 的普通停止链，不新增 root PID 信号或进程注册框架。FTP 通过固定 systemd 单元停止整个控制组并确认 MainPID 清零；单元名按安装 UID 派生，不接受调用者 PID。旧 FTP PID 先由既有进程快照筛选归属；与 FTP 无关的复用 PID 不阻断其他有效目标。

## 9 所有权与失败处理契约

本轮无新增业务模块，无新增 Pinia，无将模块状态放进 `config.setup` 的例外授权。root 安装策略是系统授权资产，不是 renderer 可写的模块配置。新增 renderer 操作状态采用模块内 singleton + `reactiveBind`；需要持久化的普通模块状态使用 `StorageGetAsync`/`StorageSetAsync`。

| 操作 | 所有者和生命周期 | 中间事件和终态 | 重复调用和服务交互 | 必须覆盖的生命周期检查 |
| --- | --- | --- | --- | --- |
| helper 安装维护 | main 安装协调器拥有实际安装；设置模块 singleton 拥有 UI 进度，页面退出后仍继续 | 准备/授权/发布/健康为中间事件；健康通过为成功，取消/失败/未知为终态 | 安装 single-flight；新请求不能并行修改同一策略；退出回收监听，未知结果先查真实状态 | 重入、关闭页面、取消、发布部分失败、迟到结果 |
| hosts 编辑、同步和清理 | Host 模块操作 singleton 拥有读取摘要、不可变提交快照、IPC、通知与结果；编辑器草稿属于挂载页面；退出清理由 main drain 后发专用接口；helper 拥有固定文件事务 | 写入前校验/等待/提交为中间状态；提交或明确错误为主终态，DNS 独立结果 | 全文编辑与托管块操作共用同资源写入队列；不同快照不共享错误结果；清理等待已受理写入收尾 | 页面重进、全文编辑与同步竞争、退出竞争、外部写冲突、DNS 失败但 hosts 成功 |
| CA 安装 | Host SSL 操作 singleton + fork SSL manager；helper 拥有系统信任变更 | 放置/更新为中间事件；完整信任更新成功或部分完成/失败终态 | 相同指纹合并在途请求；不同证书独立；CA 生成不等于系统已信任 | 重入、指纹变化、复制后更新失败、页面销毁 |
| 服务启停 | `ModuleInstalledItem.start/stop/restart` 与 fork 对应模块拥有生命周期、PID/port 和 companion；helper 拥有受限启动和固定 FTP unit 执行，实际 PID 仍由 fork 生命周期登记 | capability 启动不等于服务健康；最终由模块确认服务状态 | start re-entry guard；模块通过 startExtParam/stopExtParam 提供模块参数；父/伴随进程仍由模块协调 | 普通端口、能力启动、立即退出、PID 重用、伴随失败、停止失败保留状态 |
| PID 目录恢复 | fork Base 已有启动请求拥有恢复步骤，helper 执行固定目录修复 | 修复是启动的必要依赖，失败阻断该服务启动 | 同固定目录恢复合并；不能影响其他独立服务已完成结果 | 异常目录、并发替换、恢复失败、无删除回退 |

失败策略：

- 身份、策略或资源校验失败是必要前置失败，不发生业务副作用；不会尝试更宽松旧接口。
- hosts 文件写入失败必须向依赖操作传播；DNS 刷新属于附加动作，失败只报告自身，不撤销已完成写入或重放。
- CA 安装分步骤保留已完成事实；未知结果保持未知，同一写请求不自动重放。
- 多服务、多个候选是独立单项：逐项记录完成、跳过、失败、未知，收集全部结果。一个不能验证的目标不授权执行，也不阻断其他有效服务。
- 服务停止失败保留真实 PID/运行状态，不因 Promise 返回或日志失败而清空状态。
- `Tool` 等当前吞错返回 true/空内容的调用者，在迁移涉及的路径统一返回真实拒绝和失败；页面不得把新拒绝显示为成功。

## 10 需要调整的文件和实施顺序

先完成安全接口与调用者迁移，再整体验证发布；不能先发“禁用 runScript”却保留其他 root 执行入口，也不能临时增加 `startService(command)` 绕过限制。

1. **Linux 策略与分发入口**
   - 在 `src/helper-go/utils` 增加 Linux 专用授权策略、peer/resource 验证和受保护路径工具；`main.go` 的 Linux 分发在现有通用方法前执行明确允许表。
   - 拆分 `src/helper-go/module` 内 Linux hosts、批准 CA、PID 修复与降权启动实现，避免继续往巨大的通用 tool.go 堆叠权限策略。
   - 更新 `contract/helper-contract.json` 与 `src/fork/Helper.ts` 的平台契约；策略文件、来源和 schema 拒绝路径有独立验证。
2. **安装和健康检查**
   - 修改 `static/sh/Linux/flyenv-helper-init.sh`、`src/main/core/AppHelper.ts`、`src/shared/AppHelperCheck.ts`，保护安装源/元数据、写新策略、迁移 socket 和 key；新增策略健康信息。
   - 来源由受管理员认可的包安装/受保护发布流程确定；普通用户目录里的主备 hash 相等不能证明产物可信。禁止日常 RPC 自我更新或写 root 安装目录。
   - 安装 staging 与 root 保护的发布区明确隔离；备份/清理失败不否定已健康的新 helper，停止旧 helper 或主发布失败必须保留真实失败结果。
3. **业务调用迁移**
   - 修改 `Host/index.ts`、hosts 编辑入口、`Host/SSL.ts`、`ServerManager.ts` 的 hosts/CA/退出处理；手工 hosts 读写转入固定文件专用接口，新操作状态放在相应模块控制器。
   - 修改 `Fn.ts`、main utils、`AppNodeFn.ts` 和 `Tool`，删除 Linux 通用 root 回退，更新手工系统文件编辑与错误回传。
   - 修改 `ServiceStart.ts` 及 Nginx、Apache、Caddy、FrankenPHP、Tomcat、Numa 的 Linux 分支，使用普通启动或受限 capability；Pure-Ftpd 复用共享生命周期，使用固定 root FTP 接口。
   - 修改 `Process.ts`、`Tool/process.ts`、Base PID 恢复、PHP ini 和 RabbitMQ 插件调用，优先普通权限，仅使用批准的具体 helper 操作。
   - 修改 Shell 集成和后台项目 sudo 入口；保留 Git/Homebrew/pgvector 等 XTerm 任务中的必要 sudo 和原有任务启动能力，不要求用户手工重写命令；Ollama 删除后台自动 sudo 查询。某条终端 sudo 是否冗余独立评估，不与 helper 收紧混为全局替换。
4. **清理密码旁路和迁移说明**
   - Linux 的 `IPCHandler.handlePasswordCheck`、`ServerManager`、相关 renderer 密码逻辑、`execPromiseSudo` 和 `NodePTY.ts` 停止持久化/回传/跨请求自动复用管理员密码；保留 XTerm 的键盘输入、必要 sudo 命令及 sudo 原生认证。
   - 清理旧持久化密码及当前内存值，避免启动配置恢复又将它带回；不改变 Windows/macOS 无关业务或数据库账号密码。
   - 更新 Linux 设置和 i18n：hosts 全文保存冲突、其他系统文件只读、权限范围不足、未批准 CA、自定义 sudo 不再后台执行、FTP 配置不支持项、旧 root FTP 维护提示和账户已保存但运行实例刷新失败的部分完成说明。
5. **升级与发布**
   - 安装维护先停止旧易受影响的 helper，安全发布新程序和策略，再验证健康。不能执行用户目录中的服务脚本作为迁移手段。
   - 旧 root 服务按安装维护阶段能够验证的目标处理；无法证明或停止的目标逐项报告，不能向新 helper 添加“迁移用任意 root kill”。
   - 不迁移用户可写 allow-roots 作为可信授权；管理员安装流程重新确认目录、固定 hosts 文件修改能力和 CA 范围，不要求登记用户域名/IP。
   - Go/TypeScript HelperVersion 同步递增为 39；沿用共用版本契约则需同步各平台对应产物和主备来源，不能只改常量。发布前拒绝旧 Linux helper，不保留宽松协议回退。

## 11 验收范围

以下是 Linux VM 发布验收要求；开发环境已经执行的检查与仍需发行版实测的部分见第 13 节。安全边界测试直接调用 helper，不能只测试 TypeScript 包装器。

- 原报告场景：拥有目标 UID、有效密钥和正确签名的请求仍不能通过 start 脚本、RabbitMQ 插件、通用写文件或 root 启动取得任意 root 执行。
- 同 UID 有效签名调用被关闭方法直接失败；其他 UID、伪造 PID、重放 nonce、未知方法/字段、超大请求均拒绝；不出现认证弹窗或自动安装。
- 修改用户配置、`.flyenv.dir`、角色文件、allowed-roots、策略字段或用户可写的同名可执行文件，不能改变 helper 的授权范围和 root 工具来源。
- `/etc/profile`、系统服务/unit、helper binary/key/policy 及未批准证书不能经日常 RPC 被覆盖；硬链接、符号链接、并发目录替换和路径穿越均不能扩大写入范围。
- hosts 任意域名/IP 均能自动同步和手工保存；手工编辑支持完整文件、注释及托管块外内容；自动同步/清理只处理托管块并保留其他内容；无变化不写；全文编辑与自动同步共用冲突处理；DNS 失败保留写入成功。
- 直接调用 hosts 全文接口不能指定其他目标文件；符号链接、硬链接、并发路径替换不能将写入转移到 `/etc/profile` 或 helper 安装资产；hosts 文本中的 shell 字符串只作为文件内容保存，不执行。
- CA 只能使用安装时存档的固定证书；客户端替换 CA 文件、相同 CN 不同指纹、未批准指纹、系统更新失败都得到准确结果。
- 服务真实 UID/GID、附加组、capability、继承 FD 与执行环境符合约束；普通端口不进入 helper；Web 用户程序、配置、模块和脚本执行时没有 root 身份；FTP 例外按本节定义的固定业务配置及用户确认范围执行。
- Nginx/Apache/Caddy/FrankenPHP 80/443、普通端口、Tomcat/JVM、Numa 的实际启动停止通过验收；Pure-Ftpd 普通用户安装版本直接由 helper 以 root 启动，21 及普通端口、账户更新和完整停止均通过验收。
- 普通服务停止不提权；helper 的 FTP stop 仅处理固定 unit；PID 重用、实例丢失、非法目标与批量有效目标并存时，结果逐项准确。
- 旧 root PID 目录可定点修复，未知目录不会递归 chown/rm；PHP 和 RabbitMQ 普通执行正常；任意系统配置编辑失败不会显示成功。
- Linux 配置、renderer 和全局 Server 不再持久持有或回传管理员密码；项目 sudo 不再自动后台执行；XTerm 中必要的 sudo 安装、写系统目录及清理命令继续可用，用户可以正常响应 sudo 认证，不依赖保存的密码或 helper 任意命令接口。
- 页面销毁/重进、重复请求、退出清理、安装中断、未知结果和迟到响应遵守第 9 节契约；已完成动作不会被错误通知或清理失败重放。
- Ubuntu 与至少一种 Fedora/RHEL 系发行版验证安装、CA 和 DNS 差异；非标准数据路径、系统路径别名、只读/bind-mounted hosts、缺少必要工具或内核能力时准确拒绝。
- Windows/macOS 条件编译和既有 helper 合约不被 Linux 策略误伤；实际 Linux helper 二进制通过黑盒验证后，再请报告者复测。

## 12 审阅重点

本方案已固定“helper 仅安装授权，日常 RPC 无认证窗口”，并保留 hosts 任意域名/IP 与全文编辑，以及 XTerm 命令中的必要 sudo。需要审阅的是其他功能迁移边界：安装时固定 CA、取消后台任意 sudo、除 hosts 外的系统文件全文编辑改只读、Pure-Ftpd 固定 root 运行机制及明确排除的程序完整性风险，以及低端口 capability 的实际能力范围。

上述限制不能通过增加默认全权限 action、用户可写策略、可信客户端布尔标志或隐藏的旧接口回退规避；否则用户反馈的信任边界问题会以另一种形式保留。

## 13 实施记录

为保持简单，Linux 专用代码按分发、策略、hosts、服务降权、FTP 等专用文件放在 Go helper 主包，复用已有 RPC 身份/HMAC 校验和业务生命周期，没有新增通用权限框架。

- 策略仅保存版本、UID/GID、数据根、CA 指纹；业务允许表及固定资源由版本化代码明确规定，不提供可配置 action 注册器。新增能力必须随管理员安装的新版本发布。
- socket 改用 root 保护目录中的 `/run/flyenv-helper/helper.sock`；密钥改用 `/etc/flyenv-helper/client.key`，root 所有并通过 POSIX ACL 只允许目标 UID 读取。
- 保留的业务为 hosts 快照、全文保存、托管块同步/清理、批准 CA 安装、固定 DNS 刷新、固定 PID 目录修复、低端口 Web 服务启动和 FTP 固定启停/账户刷新。所有旧通用 root 方法在 Linux 分发入口拒绝。
- 四种 Web 服务在明确低端口时直接使用 helper，普通端口普通启动，端口未知时保留本次新产生的绑定权限错误回退；helper 仅接受固定前台启动参数，在读取用户配置、打开日志和执行用户程序前降为安装 UID/GID，只携带 `CAP_NET_BIND_SERVICE` 并设置 `no_new_privs`。
- Web 服务停止直接使用同 UID 信号，不增加 helper 实例注册或任意 root kill 接口。FTP 固定 unit stop 由 helper 执行并核验整个控制组退出；未纳入 unit 的旧 root 服务需要管理员独立停止，不猜测或代为终止其他 root 进程。
- hosts 原子替换并检查内容摘要，固定目标且不允许符号链接、硬链接，保留所有者、权限、ACL 和扩展属性（含已有 SELinux 标签）；完整编辑与退出清理按待完成保存排队，保存等待期间的新输入不会被重读覆盖。只读或 bind-mounted hosts 无法原子替换时明确报错。
- CA 只安装受保护存档；复制完成而系统信任更新失败时返回该失败，重试继续更新信任库，成功后才缓存结果。
- 旧 root 日志由拥有其父目录写权限的普通用户备份并重新创建，固定 PID 目录可定点修复；不递归 chown 或 root 删除。PHP-FPM 使用 FlyEnv 用户目录中的 ini，外部终端 PHP CLI 默认配置不由此修改。
- Linux Pure-Ftpd 通过 helper 固定业务接口后台以 root 启动，支持普通用户安装的版本，不使用终端或日常认证；程序及动态库完整性按用户明确要求不处理。Linux 自定义 sudo 服务/项目的交互式启动进入 XTerm，非交互后台启动明确拒绝；保留终端必要 sudo 和用户交互，清除应用保存的 sudo 密码及自动注入。系统环境文件界面只读；个人 profile 保持可编辑，无权限的日志清理返回失败。
- helper 版本同步为 39；安装预检在停止旧 helper 前完成，已有服务停止失败或仍有主进程时终止安装，不继续发布程序/unit。健康检查与业务连接共用新的 Linux socket 路径，拒绝旧 socket/协议回退。生产安装源须由 root 保护；开发来源只能用于明确的管理员开发安装。

开发验证采用 Windows 主机与 WSL Ubuntu 的隔离临时文件：Go 单元测试、有效签名 RPC 拒绝旧 root 接口、密钥 ACL、真实服务 UID/GID/附加组/capability、hosts 全文/冲突/原子发布、CA 更新失败重试；Node 启动测试验证普通启动、仅新绑定错误触发 helper 和退出时保存排队。测试不会写真实 `/etc/hosts` 或系统证书目录。

发布仍需在 Ubuntu 与 Fedora/RHEL VM 实测 deb/rpm 安装、80/443 的四种真实服务、旧版本迁移、系统 CA 工具与终端交互。跨平台编译和静态检查不能替代这些发行版验收。

### 原 v38 阶段验证和独立审查结果

- WSL Ubuntu：Go 主包、module、utils 测试通过；以 root 在隔离临时目录运行的 14 项 Linux 边界测试通过（内部客户端入口另跳过 1 项）。使用本次真实构建的 Linux helper 验证服务降权。
- `scripts/linux-service-start-test.ts` 通过；`scripts/linux-helper-migration-test.ts` 的 transport、installer、draft、background、readonly、log、tool 七组通过。Windows 主机下 installer 用例依赖 WSL Ubuntu-24.04；Linux 下使用本机 Bash。各组通过 `node node_modules/tsx/dist/cli.mjs scripts/linux-helper-migration-test.ts <组名>` 执行。
- helper 合约与版本同步、Windows helper 健康/安装、普通停止回退、RabbitMQ 诊断、FrankenPHP ini、安装后 hosts 同步和 fork 错误传输等 10 个已有检查通过。
- `go vet ./...`、修改文件 ESLint/Prettier、Linux 安装脚本 Bash 语法、main/fork esbuild、6 个修改 Vue 组件编译通过。
- helper 实际重建 Linux amd64/arm64、macOS amd64/arm64、Windows amd64 的 v38 产物，位于被忽略的 `src/helper-go/dist`。Windows 发布流程仍从签名后的同一文件复制备份；本轮未签名或打包发布。
- 全仓 TypeScript：与 HEAD 逐项对照，原有 38 个错误，本次仍为 38 个，无新增错误。两项旧 hosts 源码断言脚本在 HEAD 已失效，本轮没有为匹配实现而重写其断言；新增行为用例覆盖本次迁移。
- 独立只读审查发现 2 项 Critical、5 项 Important，已在一次修复过程中补失败用例并修正：旧 socket 健康检查、旧服务停止失败、hosts 属性丢失、保存覆盖新草稿、日志清理假成功、系统环境文件未只读、后台 sudo 打开交互终端。修复后重跑上述完整范围。
- 1 项 Minor 暂缓：安装界面的能力说明尚未展开低端口 capability 可传递给服务子进程；第 7 节已说明此授权边界。发行版验收时可一并完善提示。

实施保留在 `fix/linux-helper-hardening` 分支，未提交、未推送；用户原有 `linux-issues.md` 暂存和工作区修改保持原状。

### 后续调整：启动前判断端口与 Linux FTP

用户要求 FTP 使用与 Web 服务相同的 helper 启停入口，并要求明确低端口时直接使用 helper；随后明确 FTP 可以使用 root，不要求非 root 构建。取消拟议的 node-pty 方案，不新增终端服务控制器。启动入口继续使用 ModuleInstalledItem.start/stop/restart，fork 模块持有实际 PID；renderer 只绑定现有服务状态。

- 已知端口低于当前网络命名空间的 `ip_unprivileged_port_start` 时直接调用低端口接口；普通端口普通启动；未能确定的配置保留新鲜绑定权限错误后的单次回退。配置探测失败只影响路由判断，不重放已经成功的启动。
- Nginx 使用原生配置展开，Apache 使用最终 Listen 配置，Caddy/FrankenPHP 使用原生配置转换并计入自动 HTTPS 的 HTTP 监听；FTP 校验 Bind 和被动端口范围，但始终使用固定 root 接口。系统阈值无法读取时按默认 1024 判断。
- FTP 使用固定 root 业务接口，且不受端口是否低于阈值影响。支持 FlyEnv 普通用户安装的 pure-ftpd/pure-pw，检查路径、名称和 ELF 输入格式，拒绝 shell 脚本。此格式检查不是程序完整性验证，不以 root 所有或管理员安装为前提，也不检查动态库。helper 校验固定 FTP 配置中的业务字段，在 root 保护目录生成前台配置与 PureDB；虚拟账户映射安装时授权的 UID/GID，不接受任意系统身份。拒绝 Include、外部认证、任意日志目标等未授权项。
- root FTP 由固定的 systemd 服务单元持有（单元名由安装 UID 确定），固定参数启动并返回实际 MainPID；固定 stop 接口停止整个服务控制组并核验退出，不接受任意 PID、unit 或命令。依赖已用于安装 helper 的 systemd，不新增 root 终端或通用进程管理框架。日常启停不询问密码；FTP 软件安装流程继续使用普通用户权限，不增加安装授权或受保护副本。单元的 `PartOf=flyenv-helper.service` 让显式 helper 维护停止/重启同时停止 FTP，不能描述为 helper 意外崩溃时也会自动清理。
- 所有进度和成功/失败终态仍属于共享服务生命周期；重复启动与停止沿用已有 single-flight，页面切换不改变 fork 中运行的服务。无新增 Pinia、共享持久化配置或 FTP 公共字段，不需要模块约束例外。
- 必要失败：FTP 程序路径或格式不正确、配置不受支持、实际启动失败、服务未退出；保留失败信息和仍运行的 PID。附加动作：端口探测及 PID/日志尾部维护，不能覆盖已成功的主结果。
- 验证：已知低端口不先执行服务、普通端口不调用低端口 helper、系统阈值与未知端口回退、Caddy 自动 HTTPS；FTP 固定配置/用户安装程序/虚拟账户映射/固定 unit 启停及拒绝越权字段；已有启动、停止及 helper 合约回归。实际 FTP 登录、上传、root 主进程/会话 UID 和控制组退出在 Linux 隔离环境验证，发行版安装继续列入 VM 验收。

### 本轮 FTP 与端口调整验证

- WSL 隔离环境使用普通 UID 90001 拥有的真实 Pure-Ftpd/pure-pw：root 主进程启动，21 和普通端口、登录上传文件 UID、实时新增/删除账户、重复启动拒绝、保持连接时整个控制组退出、幂等停止均通过。测试不安装生产 helper，不修改真实 hosts/CA。
- Go 配置/账户/ELF 输入格式测试通过；脚本与 FIFO 拒绝，用户拥有的可执行文件允许。
- Web 已知低端口不先执行普通启动、普通端口及系统阈值 0、未知端口单次回退、单行 Nginx 与 Caddy 自动 HTTPS/管理监听测试通过。
- 独立只读审查的旧 PID 误判与单行 Nginx 监听问题已修正。程序/动态库完整性问题按用户明确要求不处理，不声称修复了这个风险。
- v39 五个平台 helper 重建、main/fork 编译、FTP Vue 编译、helper 合约与版本同步通过；Linux Go 主包/module/utils 测试与 vet、19 项隔离 Linux 边界用例（内部客户端跳过）、7 组迁移测试、修改文件 lint/格式和安装脚本 Bash 语法通过。
- 全仓 TypeScript 与 HEAD 对照仍为 38/38，无新增错误。另运行 Windows helper 健康、安装脚本/IPC、RabbitMQ 诊断、FrankenPHP ini、安装后 hosts 重试及 fork 错误传输检查通过。
- 额外旧检查 `windows-helper-fallback-plan-test.ts` 与 `service-process-exit-safety-test.ts` 失败，按 HEAD 源码构建的基线也在相同断言失败；`stop-process-list-cache-test.ts` 的旧 `StopProcessListSearch` 源码断言失败，断言涉及的 PHP Windows 文件与测试均未修改。没有为匹配实现而重写这些旧检查。
- root RPC 测试使用普通账户编译到隔离路径的测试程序运行，避免 Go root 临时构建目录 0700 导致降权测试客户端不能执行；新 v39 真实 helper 用于验证 Web 服务降权。发行版安装与迁移仍需 VM 验收。

### Helper 链路 review 修复计划

沿用用户已批准的 review 建议，以当前分支完成小范围修复，不新增授权框架或操作控制器。

- RPC：Linux 固定业务分发与其他平台共用响应编码、写入及连接关闭；补真实签名连接的 EOF 回归，覆盖成功、业务拒绝和健康检查半关闭。
- 安装：准备临时程序后，先停止并确认旧 helper 已退出，再安装策略/密钥和发布程序。停止失败是必要失败，不得改动旧凭据；安装中的其他失败明确报告并由用户重试维护，不新增自动授权或事务框架。
- hosts：实际合并与 changed 判定归 helper，fork 只提交 entries/digest 并返回结果。读取快照是必要前置，冲突/写入失败如实传播，DNS 刷新仍是附加动作。完整编辑、IPC 分层及退出排队沿用原有 owner 和生命周期。
- 内部执行：固定系统工具与 pure-pw 共用超时、环境、输出上限和执行结果处理，各业务调用者保留各自校验，工具不暴露为 RPC。删除同一入口的重复目录/服务白名单校验。
- 维护提示：仅在 helper 缺失、不可达或版本不匹配时发送现有 needInstall 提示；提示仅打开手动维护入口，不安装、不提权、不重放业务。权限/业务拒绝保持原错误。
- 状态及生命周期：沿用 AppHelper 安装 single-flight、fork Helper 连接状态、Host 保存队列和共享服务启停；不增加 Pinia、共享持久化或 renderer 操作状态，无模块约束例外。
- 验证：先复现 EOF、失败安装不应改密钥、hosts changed 与维护提示，再执行 Go 主包/module/utils、迁移和跨平台 helper 回归；同步发布版本并构建 Linux/macOS/Windows helper。保持 linux-issues.md 用户修改原状。

### Helper 链路 review 修复结果

- 已统一 Go 响应编码、写入和关闭：Linux 保持固定 dispatcher，Windows/macOS 保持原业务 switch，全部使用原有单请求响应后 return。真实签名连接验证成功、业务拒绝和健康检查半关闭，避免仅解码 JSON 的用例掩盖 EOF 缺失。
- 安装先确认旧 helper 停止，再写策略和密钥；完整脚本在停止失败时保留旧密钥，成功停止后才更换。未增加自动回滚、重试提权或通用安装事务。
- Linux hosts 合并/无变化判定统一归 helper；无变化不替换 inode，重复清理返回 false，正文及尾部保留，旧 digest 仍拒绝。完整编辑和不同进程的 facade 保留。
- linux_tool.go 统一固定工具的环境、工作目录、输出上限和错误处理；系统工具和 pure-pw 校验仍由各入口负责，原 CA 20 秒/FTP 30 秒超时保留。删除重复目录和服务白名单校验。
- helper 不可达、版本过旧或缺失/损坏密钥时发送已有手动维护提示，继续返回原失败，不重放业务。独立复核发现 Linux key 为 null 时曾被误归为签名错误，已补连接前 key 分类，并用真实 checker 覆盖；真正签名拒绝及业务拒绝不提示安装。
- 发布版本同步为 v40；Linux amd64/arm64、macOS amd64/arm64、Windows amd64 五个平台产物重建成功，未签名、未打包发布。
- 新回归分别先复现失败后通过：真实 RPC EOF、helper hosts changed、安装失败旧密钥保留、维护通知，以及真实 Linux checker 在缺失/31 字节密钥时不连接。
- WSL 普通账户 Go 全包测试/vet 通过；隔离 root 测试 20 项通过，另跳过仅供子进程使用的客户端及普通账户 EOF 入口（后者已在普通账户运行通过）。真实 Pure-Ftpd root/21/普通端口/登录上传/账户热更新/控制组停止、CA 重试、签名 RPC、服务降权与 hosts ACL/xattr 回归均通过。未安装生产 helper 或改真实 hosts/CA。
- 七组迁移、Linux 启动/提示行为、helper 合约/版本同步通过；Windows 健康、安装脚本、安装 IPC、安装后 hosts 回归与 Go module/utils 测试通过。Windows Go 测试明确设置 GOOS=windows，避免继承交叉编译配置。
- main/fork 使用对应平台、入口、打包及分包参数编译通过；修改 TS 文件 lint/格式、Bash 语法与 diff 检查通过。全仓 TypeScript 与 HEAD 对照仍为 38/38，无新增错误。
- 独立只读复核确认修复后的公共响应未改变 Windows/macOS 业务行为，无剩余重要问题。三端真实安装和发行版包升级仍按原 VM 验收范围验证。本轮未提交、未推送，linux-issues.md 用户修改保持原状。
