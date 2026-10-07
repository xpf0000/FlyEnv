# macOS 帮助程序权限收敛方案

日期：2026-10-06。

状态：用户于 2026-10-06 批准按方案实施，要求简单明了、相同逻辑集中维护。实施位于 `fix/macos-helper-hardening`；验收结果记录在文末，不能将设计验收项视为已完成。

依据：[Linux 实施记录](linux-helper-hardening-plan.md)、当前 Go Helper 与 main/fork/renderer 调用链、模块边界与失败边界规则。盘点以当前源码为准：共享 Helper 版本已为 41，Linux 文档中的历史版本和阶段性描述不代表当前所有平台的行为。

## 1 目标与方案选择

目标是把 macOS 常驻 root Helper 收敛为有限业务接口，关闭通用 root 脚本、文件操作和进程终止能力；同步清理应用后台 sudo 与自动文件提权回退，保留正常开发功能及必要的显式终端维护。

用户已批准沿用 Linux 已实施的产品边界：安装维护时授权，日常有限业务 RPC 不再询问管理员密码；hosts 保留任意域名/IP 和全文编辑；XTerm/系统终端中的必要 sudo 保留，由系统认证，应用不保存或自动注入密码。macOS 授权来自用户对本方案的明确批准，包含第 6 节推荐的 FTP 兼容选项。

| 方案 | 代价与边界 | 建议 |
| --- | --- | --- |
| 保留 Go Helper、LaunchDaemon 与 Unix socket，增加 macOS 固定业务分发和安装策略 | 可复用当前传输与生命周期；安装源、系统文件事务和 macOS ACL 必须单独处理 | 推荐，作为本轮范围 |
| 同时迁移 SMAppService/XPC | 可使用系统服务管理与身份机制，但涉及原生桥接、签名、安装体验及系统版本兼容；同样必须收敛业务接口 | 后续独立评估，不能替代本轮接口限制 |
| 取消常驻 Helper，每次业务都交互提权 | 改动日常体验、后台启停及退出清理，不符合与 Linux 日常有限授权一致的方向 | 不推荐 |

Apple 将 `SMAppService` 的这套服务管理方式用于 macOS 13 及以上；本轮不以此擅自提高 FlyEnv 的最低系统版本，也不引入新的跨平台权限框架。[Apple 文档](https://developer.apple.com/documentation/servicemanagement/smappservice)

## 2 macOS 当前操作盘点

下表区分“当前代码会提权”与“业务确实需要系统权限”。保留功能名不等于保留 root 执行。

| 操作 | 当前入口、实际执行和资源 | 建议处置 |
| --- | --- | --- |
| Helper 安装/更新 | `main/core/AppHelper.ts:270`、`static/sh/macOS/flyenv-helper-init.sh`；临时复制脚本/plist/程序后 sudo 执行，写 `/Library/LaunchDaemons/com.flyenv.helper.plist` 与 `/Library/Application Support/FlyEnv/Helper/flyenv-helper`，使用 launchctl 启停 | 确需管理员授权；保护安装来源、发布资产与停止顺序，见第 4 节 |
| 自动站点 hosts 同步、删除、退出清理 | `fork/module/Host/index.ts:430`、`main/core/ServerManager.ts:79`；通用 root 读写 `/etc/hosts` | 改固定 hosts 快照、托管块同步/清理；客户端不传目标路径 |
| Hosts 全文编辑 | `main/core/AppNodeFn.ts` 通用文件 IPC；普通写失败后可进入 `tools.writeFileByRoot` | 保留全文编辑，固定 hosts facade 走专用接口与摘要冲突检查 |
| 系统环境文件编辑 | `fork/module/Tool/index.ts:55` 的 `/etc/paths`、`/etc/profile`；`systemEnvSave` 通用 root 回退 | 系统文件改只读或显式终端维护；个人 profile 仍普通编辑 |
| CA 加入系统信任 | `fork/module/Host/SSL.ts` → `host.sslAddTrustedCert`；root 执行 `security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain`，证书路径来自用户目录 | 保留系统信任能力，只安装维护时批准并存档的公共 CA；日常请求仅带指纹 |
| CA 查询与生成 | `host.sslFindCertificate` 在 root 上下文查询默认 keychain；证书生成本身在普通 fork | 查询改普通用户读取明确的系统 keychain 与指纹/信任状态；不能只按 CN 判断已信任，不为查询新增 root 文件访问 |
| DNS 刷新 | `host.dnsRefresh` → `dscacheutil -flushcache`、`killall -HUP mDNSResponder` | 保留固定系统解析器刷新；hosts 成功后的附加动作，不开放任意进程信号 |
| Nginx/Apache/Caddy/FrankenPHP | 当前模块均调用 `serviceStartSpawn`，`lowPortService` 仅在 Linux 为 true；macOS 直接普通用户启动 | 维持普通启动，不能把“Web 服务”统一列为 root；低端口与地址差异见第 5 节 |
| Tomcat/Numa/Redis 等 | Tomcat/Numa 的 Unix 分支为普通 spawn；Redis 调用 `serviceStartExec` 未传 root；其他服务需沿既有普通生命周期 | 保持普通 UID；`serviceStartExec` 的 root 参数/分支不能再供 macOS 使用 |
| Pure-Ftpd 启动与账户更新 | `fork/module/PureFtpd/index.ts:57`；macOS 通过 `execPromiseSudo` 启动用户安装的程序，另有系统 Terminal 分支；账户生成当前普通执行 | 身份切换/FTP 认证可能确需 root；提供固定 FTP 生命周期接口或显式终端方案，风险选项见第 6 节 |
| 自定义服务/语言项目 sudo 模式 | `customerServiceStartExec` → `execPromiseSudo`；renderer 可询问并缓存密码；交互终端分支另行存在 | 后台任意 sudo 关闭；保留显式终端执行，非交互启动准确拒绝 |
| 进程列表、端口查询、停止及清理端口 | `shared/Process.ts` 可能优先 Helper；`Tool/process.ts` 的 macOS `killPorts` 直接 Helper；Go Unix kill 只校验信号/PID 格式，不限制到安装 UID | 普通 ps/lsof、同 UID 信号；关闭 root 任意 PID/端口终止，其他用户进程显示权限不足 |
| 固定 PID 目录修复 | `fork/module/Base/index.ts:340` → `redis.logFileFixed(path, uid:gid)`；失败还会 root rm 整个 PID 目录 | 只保留策略数据根下固定 pid 目录的句柄修复，不接受 path/owner，不递归 chown/rm |
| PHP ini 创建、编辑及扩展清理 | `fork/module/Php/index.ts:108` → `php.iniFileFixed`、Helper chmod 777、通用 root 读写和删除 | PHP-FPM 使用用户目录中的 ini；普通扩展目录照常处理，系统安装目录维护交给终端；不默默修改系统 PHP CLI 配置 |
| RabbitMQ 管理插件初始化 | `fork/module/RabbitMQ/index.ts:177` → `rabbitmq.initPlugin`；Helper 执行调用方目录下的 `rabbitmq-plugins` | 改普通用户执行；需要包管理器权限时显示明确维护入口，不 root 加载用户程序 |
| MySQL/MariaDB MacPorts 资源修复 | 两个 fork 模块的 `macportsDirFixed`；root mkdir/cp 到版本目录的 share/语言目录 | 直接读取已有 `/opt/local/share/...`，或普通复制到 FlyEnv 用户数据目录；不用 root 改包目录，覆盖旧 MySQL 初始化分支 |
| MacPorts 换源与配置编辑 | `fork/module/MacPorts/index.ts` 的 `changSrc` root 写 `/opt/local/etc/macports/sources.conf`、`macports.conf`；还公开这两个配置文件给编辑器 | 换源改显式终端维护，保留预览和正常输入；系统配置编辑不再通用 root 覆盖。若必须维持无日常认证的一键换源，另设计两文件、字段限定接口，不能保留全文写入 |
| Shell 集成、PATH、别名 | `Tool/init.ts:37` 在 `/Applications/FlyEnv.app/Contents/Resources/helper/flyenv.sh` 写脚本并 root chmod/chown；个人 profile 也使用通用 root 回退 | 脚本放普通用户数据根 `shell/flyenv.sh`；清理旧 source 行，用户 profile/PATH/别名普通写入；不使应用包可写 |
| 下载程序 quarantine 清理 | `Fn.binXattrFix` 普通 `xattr` 失败后 → `mailpit.binFixed`；不只 Mailpit 使用此封装 | 普通权限处理用户拥有的下载程序；失败准确提示，不 root 递归清理任意路径，不作为关闭系统安全机制的后门 |
| 登录项移除 | `main/core/AppNodeFn.ts:407` 已调用 Electron `setLoginItemSettings`，又调用 root `tools.removeLoginItemMac` 的 osascript | 保留用户会话中的系统/Electron 登录项 API，移除 root AppleScript 回退；不能用 root 替代用户会话或系统自动化授权 |
| 通用文件 IPC 与清理 | `fork/Fn.ts:283`、`main/utils/index.ts`、`AppNodeFn.ts`；普通失败后 root read/write/base64/rm，站点配置、CA 缓存、PATH shim 等复用它们 | 普通权限失败如实传播，禁止自动扩大权限；仅固定 hosts 业务显式分流 |
| 管理员密码保存及自动注入 | `IPCHandler.handlePasswordCheck` 写 config/Server、回传 renderer；`child-process.execPromiseSudo` 与 `NodePTY` 读取 Server.Password | macOS 同步停止保存、广播及跨请求复用，清理旧值；终端保留 sudo 本身的认证 |
| 包管理与系统扩展的终端维护 | MacPorts 软件/PHP 扩展/Git/Node fnm/nvm 的 XTerm `sudo port`；pgvector 的 `sudo make/install/rm`；OpenClaw 的 macOS `sudo ... gateway install`；Homebrew 安装脚本有 sudo 步骤 | 属于显式终端能力，保留必要命令与系统认证；不迁入常驻 Helper，不注入保存密码；编译步骤是否必须 sudo 可单独优化 |

补充边界：`tools.ln_s`、`tools.runScript` 仍在 macOS 分发器开放，静态搜索未找到当前业务直接调用 `ln_s`，也未找到当前内置模块传 `root:true` 调用 `serviceStartExec`。它们是可调用的危险接口，不能因“暂未使用”而继续开放。旧版本 root 服务、系统安装软件与当前普通服务也不能混为同一生命周期。

## 3 现有授权层需要同步收敛

当前已经有 Unix peer UID 校验、HMAC、时间窗/nonce 和部分路径允许范围，并不是完全无校验；但这些检查不能把 root 脚本或用户可修改程序变成有限权限。

- macOS 仍与 Windows 共用业务 switch，只有 Linux 进入固定 dispatcher。增加 `dispatchDarwin`，明确允许列表；旧通用 RPC 即使签名正确也拒绝，不能只靠 TypeScript 隐藏入口。
- `peer_darwin.go` 已用 `LOCAL_PEERCRED` 取得 UID/GID，但返回 `PID:-1`，没有获得真实程序路径。补 `LOCAL_PEERPID` 及必要的连接身份绑定；不能把目前仅客户端声明的 PID/executable 描述为已获系统验证。Apple XNU 定义了这些 socket 选项。[XNU un.h](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/un.h)
- 旧 `/tmp/flyenv.role` 可回退使用，`readRoleFile` 不校验 root 所有权；业务路径允许表还覆盖 MacPorts、PHP、应用包等较广目录。新的 macOS 授权来源只使用安装时 root 保护的策略，不使用 `/tmp` role、`.flyenv.dir` 或 renderer 配置扩大范围。
- socket 当前在 `/tmp/flyenv-helper.sock`，监听后才异步 sleep/chown/chmod；密钥在 `/usr/local/share/FlyEnv/flyenv-helper.key`，随后 chown 给用户。改为受保护目录和同步初始化，取消用户对密钥内容的修改权。
- 为 macOS 增加有限在途连接、请求期限、nonce 上限与输出上限；沿用现有 1 MiB 请求上限，不借此增加 hosts 域名/IP 授权名单。

HMAC 是协议认证，不是同 UID 恶意代码的隔离。无日常认证的安装授权允许该账户持续使用 hosts/已批准 CA 等能力；应用路径、PID 和签名校验不能替代业务资源限制。

## 4 安装、策略与通信

建议布局：继续使用现有 Helper 安装目录与 LaunchDaemon label；新增 root 保护的 `policy.json`、`client.key` 和 `approved-ca.crt`。socket 改到 `/private/var/run/flyenv-helper/helper.sock`，父目录 root 所有且不可由用户替换。

- 策略沿用 Linux 实施后的简单结构：版本、安装 UID/GID、核实后的数据根、批准 CA 指纹；固定 action 和系统资源写在版本化代码中，不增加 action 注册器。当前仍为一个安装账户，不暗中扩成多用户全局授权。
- policy、plist、程序、证书存档及 FlyEnv 自身管理目录由 root 保护；client.key root 所有，用 macOS ACL 仅赋安装 UID 读取权，检查文件 ACL 与自身目录，不递归检查用户配置的系统祖先目录。不能仅检查 POSIX mode 或赋整个 wheel/共享组读取。
- socket 可以赋安装 UID 连接权限，但其 root 父目录不能可写；先完成 socket 权限，再受理业务。失败直接停止，不回退旧 `/tmp` socket 或旧协议。
- 安装先预检来源、参数与现有资源，确认旧 Helper 已停止后，才更新策略/密钥、程序和 plist；停止失败保留旧资产。发布失败报告真实阶段，不凭脚本启动成功就宣称安装完成，成功条件包括新版本与策略健康检查。
- 当前临时脚本/plist/binary 均由桌面用户持有，不能作为 root 信任锚。发布安装必须由固定安装入口将输入快照复制到 root 私有 staging，再验证发布签名与资源完整性，并从保护后的快照发布；bootstrap 不能是任意用户脚本，签名要求不能由 RPC/安装参数自报。脚本不允许执行前再次从原可写路径加载，避免“校验路径后重新打开”的竞态。开发未签名安装单独标记为管理员主动开发维护，不进入生产自动降级。本地 `electron-builder.mac.local.ts` 的未签名 production 包不能安装帮助程序；它不会因为签名失败自动转为开发安装。
- 此阶段继续现有系统安装授权方式；安装源的真实签名/授权链须在发行产物中验收，不能仅凭开发树中的 chmod 或静态检查声称安全。若现有安装入口无法满足可信 bootstrap 与快照边界，则阻断发布并选用系统服务管理/签名安装包路径，不能带着用户可替换的 root 脚本上线。
- 生成 CA 与授权 CA 是两个步骤。安装时不存在 CA，可不批准证书而先安装 hosts 能力；首次生成或重新生成 CA 后，通过明确维护入口批准公共证书指纹，不能在添加站点失败时悄悄扩大权限。私钥留在普通用户目录。

## 5 普通服务与 macOS 低端口

本轮不为 macOS 新建“root Web 启动”接口，不复制 Linux `CAP_NET_BIND_SERVICE`。当前六类 Web/JVM 服务已经普通启动，应维护这个事实，而不是为了迁移通用 RPC 再引入 root。

Apple 当前公开 XNU 的 IPv4/IPv6 代码对显式非通配地址绑定低端口有权限检查；不能声称“macOS 的 80/443 全都需要 root”，也不能声称“任何地址都不需要 root”。这是依据源码的推断，具体受支持系统版本、沙箱和实际服务仍需验证。[IPv4 绑定检查](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/netinet/in_pcb.c)、[IPv6 绑定检查](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/netinet6/in6_pcb.c)

实施验收覆盖 `0.0.0.0`、`127.0.0.1`、`::`、`::1` 与实际配置的 80/443/普通端口。现有配置可普通启动就保持；权限不足时显示准确原因，不能默默改监听地址扩大暴露范围、关闭 IPv6、改端口或 root 重跑。

如必须额外支持目前普通权限无法使用的特定地址/低端口，应另选固定端口代理或服务支持的预绑定 socket。launchd 可向支持其协议的服务提供 socket，但不能假定 Nginx、JVM、Caddy 等现有程序都能直接接收。[Apple launchd 指南](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html) 本轮不增加 PF 规则、通用 TCP 代理或这类适配层。

## 6 Pure-Ftpd 专项

FTP 的 root 需求来自身份切换和认证，不仅是 21 端口。不能简单按普通 Web 服务降权，也不能沿用任意 sudo 命令启动。

建议固定 `ftp.start/stop/refreshUsers`，由 helper 持有安装 UID 派生的固定 launchd job；plist 和运行配置由 root 保护，前台运行，禁止用户选择 label、UID/GID、命令、shell、外部认证、任意日志目标或配置 include。虚拟账户映射到安装 UID/GID。启停沿用既有模块生命周期、真实 PID 和账户状态；stop 必须核实受管理 job 与相关进程退出，不能只删除 PID 文件或假定 launchd 等同于 Linux cgroup。

原方案列出两个产品取舍；用户已批准第 1 项：

1. **兼容 Linux 的 FTP 范围**：允许普通用户安装的 Pure-Ftpd 程序，以固定 FTP 配置 root 运行；验证 Mach-O 输入类型、路径与参数，普通账户能完成的 pure-pw 数据生成保持普通权限。但程序、加载器/动态库、插件仍可能被用户修改，仍存在借 root FTP 取得任意 root 执行的风险。格式/名称校验不能消除它；Linux 的风险例外尚未自动延伸到 macOS。
2. **更严格的 root 边界**：root FTP 只运行安装维护时批准、复制到受保护位置的程序及受控依赖，版本更换需要管理员维护；若不愿承担这部分程序/依赖管理，则 FTP 的 root 启动继续由用户显式终端完成，不纳入日常 Helper。

当前实施保留普通安装体验、采用已获批准的第 1 项；因此不能声称关闭了所有用户程序的 root 执行能力。FTP 动态库、账户更新及整个实例停止需真机专项验收。

## 7 保留与关闭的 RPC

| 建议保留接口 | 输入与固定行为 |
| --- | --- |
| `helper.version/health` | 无业务路径；返回版本和受保护策略是否可用 |
| `host.readHosts` | 无路径；读取固定 hosts 内容及摘要 |
| `host.replaceHostsContent` | 全文与旧摘要；允许任意域名/IP/注释，冲突时拒绝覆盖 |
| `host.syncManagedEntries/clearManagedEntries` | 结构化 entries/旧托管块摘要；只协调 FlyEnv 块，目标固定 |
| `host.installApprovedCA` | 安装批准的指纹；从受保护公共证书存档写固定系统 keychain 并核实信任结果 |
| `host.dnsRefresh` | 无可选命令/进程参数；只执行固定解析器刷新，优先作为 hosts 内部附加动作 |
| `tools.repairManagedPidDirectory` | 无 path/owner/mode；只修复策略数据根的固定 pid 目录 |
| `ftp.start/stop/refreshUsers` | 按第 6 节审阅决定启用；仅管理安装 UID 对应的固定 FTP 实例 |

macOS 明确关闭 `tools.runScript`、通用 read/write/base64、rm/chmod/ln_s、任意 PID kill/killPorts、通用 redis.logFileFixed、php.iniFileFixed、rabbitmq.initPlugin、mysql/mariadb.macportsDirFixed、mailpit.binFixed、root removeLoginItemMac、可导入任意用户 CA 的旧接口。普通用户实现继续保留必要功能。

Windows 专有接口不得被 macOS 新 dispatcher 误放行；Linux dispatcher 及已实施业务边界保持独立。`ProcessSend.ts` 不承担权限分类或 UI 文案转换；需要安装/修复沿既有 Helper 通知，真实安装失败、写入失败与业务权限拒绝保留真实原因，debug 完整记录且不泄露密钥/密码。

## 8 文件事务、迁移与结果语义

- macOS `/etc` 是系统别名，固定 hosts 操作锚定实际 `/private/etc`，验证系统别名后处理；不能一概拒绝合法系统别名，也不能因此放行任意中间 symlink。目标及临时文件以安全句柄处理，拒绝异常文件类型、硬链接与用户替换路径。
- hosts 全文编辑与托管块同步在各进程内共用资源队列；main/fork 之间由 helper 的互斥与原始摘要检查协调，冲突如实失败，不自动重放。更新；无变化不写，同目录安全临时文件原子发布，保留所有者、mode、macOS ACL、扩展属性及适用 flags。不能直接照搬 Linux 的 openat2/SELinux 实现；不支持安全属性保留或发布时准确失败。
- 原子 rename 不等于与所有外部编辑器实现事务：外部程序不遵守锁时仍存在最后核验后的竞争，必须记录并验收这个限制。
- 旧 root 日志优先由拥有父目录的普通用户备份重建；固定 PID 目录只定点修复。未知 root 文件不通过递归 chown、chmod 777 或 root rm 接管；启动失败保留已有数据。
- 旧版本 root 服务不在新 FTP 管理范围内时，提供显式管理员迁移/停止说明；新 Helper 不接受任意 PID“兼容清理”。旧密码在配置、内存和 renderer 同步清除，不再自动响应 PTY 的 `Password:`。
- Host 的 macOS 路径目前还会吞部分 hosts/CA 失败，迁移时必须一起修正：实际 hosts 未写入不能报成功；证书已生成但未信任必须区分结果；DNS 失败只记录/通知刷新失败，不否定 hosts 写入或自动重放。

## 9 操作归属与生命周期契约

无新业务模块、Pinia 或 `config.setup` 持久化例外。受保护 policy 属于系统授权资产；新增普通模块状态用模块内 singleton/reactiveBind，必要持久化用 StorageGetAsync/StorageSetAsync。

| 操作 | 所有者、生命周期与事件 | 重入、服务交互与验证 |
| --- | --- | --- |
| Helper 安装维护 | main AppHelper 持有实际安装 single-flight；现有 HelperStore/终端安装 singleton 持有进度与清理；准备/授权/发布/健康是中间事件，取消/失败/未知/健康成功为终态 | 页面卸载不终止已授权安装；拒绝图形/终端并行修改资产；覆盖取消、停止旧程序失败、发布部分失败、迟到结果 |
| hosts 编辑/同步/退出清理 | Host 现有保存 owner 持有不可变文本/摘要与 IPC；草稿属于页面；helper 持有固定文件事务；main 退出先 drain 再清理 | 全文与托管块在进程内共享队列，跨进程靠 helper 摘要检查；真实写失败阻断依赖，DNS 附加失败不回滚；覆盖页面重进、重复提交、并发编辑、退出竞争 |
| CA 安装 | Host SSL 模块持有在途指纹、提示和结果；helper 执行固定系统信任修改 | 相同指纹合并在途请求；生成、登记、加入 keychain、信任成功分别判断；覆盖指纹变更、失败重试、部分完成、页面退出 |
| 服务/FTP | renderer 复用 ModuleInstalledItem.start/stop/restart 与 startExtParam/stopExtParam；fork 模块是进程/PID/companion 真相；受限 FTP helper 只管理固定 job | 不增加另一套服务控制器；并发启停沿现有 guard；覆盖启动即退出、重入、旧 PID 复用、伴随服务、会话未退出与停止失败保留状态 |
| PID 修复/普通清理 | fork Base 或实际模块持有必要修复；日志等附加动作只影响自己 | 必要修复失败阻断本次启动；独立候选逐项结算，一个无效候选不取消其余有效目标，不返回整批虚假成功 |
| 系统维护终端 | 原模块 singleton 持有命令快照、PTY、进度、结果与 cleanup；页面只绑定显示 | sudo 系统认证，不自动注入密码；必要 IPC/PTY 失败结束请求，页面卸载后仍处理终态，禁止后台退回 Helper 任意执行 |

## 10 实施分组与验收

下列实施分组已获用户批准；具体编码任务见 [实施计划](macos-helper-hardening-implementation.md)，完成与验收状态见第 13 节。

1. **macOS 固定分发、策略与可信安装**：Go 新增 macOS 专用策略/dispatcher/安装逻辑，调整 `peer_darwin.go`、`AppHelperCheck.ts`、`AppHelper.ts`、macOS 安装脚本与 plist；旧 RPC 拒绝、真实 UID/PID、只读密钥、受保护 socket、安装停止顺序和来源校验形成同一发布单元。
2. **hosts/CA/DNS/PID 业务**：新增 macOS 业务文件及模块 facade；改 `Host/index.ts`、`Host/SSL.ts`、`ServerManager.ts`、`Base/index.ts` 和固定 hosts 文件 IPC；共同文件事务与失败语义一次落实。
3. **撤回日常通用提权**：改 `Fn.ts`、main utils/AppNodeFn、Process/Tool、PHP、RabbitMQ、MySQL/MariaDB、MacPorts、Shell 集成及 quarantine/登录项回退；系统文件编辑显示正确迁移说明，普通功能保持可用。
4. **终端和密码迁移**：ConfigManager/IPCHandler/NodePTY/child-process 与自定义服务、语言项目同步去掉 macOS 密码保存及后台 sudo；保留已声明的终端维护能力与真实退出码。
5. **FTP 与发行验证**：按第 6 节确定的选项实现，测试真实 FTP 登录/上传/账户更新、root 主进程与文件 UID、停止全部相关进程；更新 helper-contract、共享版本，重建 darwin arm64/amd64 并做其他平台编译/合约回归，核实发行签名与安装升级。

实现与 Go dispatcher 的发布必须协调，不能先发关闭旧接口的 Helper 却仍让应用调用旧 RPC；旧 Helper 必须由版本/策略健康检查拒绝，不静默退回旧 socket、旧文件能力或 sudo。

验收覆盖：有效签名也不能调用旧 root 接口；其他 UID、伪造 PID、可写策略/父目录/密钥、重放与资源耗尽拒绝；路径穿越/symlink/hardlink/并发替换不能扩权；hosts 全文、托管块、外部修改、无变化、ACL/xattr 与 DNS 附加失败；批准 CA 的真实指纹和系统信任状态；macOS 服务监听地址/端口矩阵；个人 Shell/PHP/RabbitMQ/数据库旧版本与 MacPorts；密码迁移、终端认证、安装重入及页面卸载；FTP 特例与完整停止；签名发行包的真实首次安装/升级、Apple Silicon/Intel 及受支持系统版本。

设计阶段只完成了源码盘点和平台文档核对；第 13 节记录后续实施与实际运行的验证。跨平台编译和隔离 fixture 不能替代 launchd、Keychain、FTP 与发行安装验收。

## 11 本次审阅重点

- 是否将 Linux 的“仅安装时授权、日常有限 RPC 无认证、终端 sudo 保留且不存密码”同步为 macOS 产品边界。
- Pure-Ftpd 是否接受 Linux 同等的用户程序 root 运行例外；否则选择受保护程序/依赖或显式终端，不把风险藏在格式检查后。
- MacPorts 换源、系统配置与系统 PHP/扩展维护是否采用显式终端；要保留日常无认证的一键能力，就必须逐项定义固定业务接口。
- CA 固定到安装维护时批准的公共证书；首次生成/重新生成需要明确维护，而不是通用任意证书导入。
- 本轮维持现有 macOS 普通服务监听行为；特定地址低端口若需新能力，另行设计，不加入 root Web 执行或扩大监听地址。

## 12 实施约定与进度

用户已批准以上推荐方案，包括 FTP 推荐的普通用户安装程序兼容选项；不额外引入程序/动态库完整性管理。系统源维护使用显式终端，CA 使用安装时批准快照，日常不保存管理员密码。相同 hosts 算法、普通 Unix 调用策略及 FTP 输入校验尽量复用，平台文件仅承担系统差异。

跨部分协议：macOS policy/key/CA 位于 `/Library/Application Support/FlyEnv/Helper/`，socket 位于 `/private/var/run/flyenv-helper/helper.sock`；策略字段沿用 version/uid/gid/dataRoot/caFingerprint；安装命令为 `--install-darwin-policy UID:GID DATA_ROOT CA_PATH CA_FINGERPRINT`。业务 RPC 保持第 7 节形状，不引入额外通用命令。普通 Web 启停不变。无 Pinia/持久化/服务生命周期例外。

- [x] Go：固定 Darwin dispatcher、policy/key/socket/peer PID、复用 hosts 合并事务与输入校验、批准 CA/DNS/PID、固定 FTP launchd 生命周期；真实必要失败传播，DNS/日志失败独立处理。
- [x] 安装：AppHelper 与静态 macOS 安装入口、受保护快照/来源、停旧服务后发布策略/密钥/程序、真实退出与健康终态；生产签名和开发明确安装分开。
- [x] 调用迁移：统一 Unix 固定 hosts facade、撤回通用提权与 root 脚本/进程/密码回退；PHP/RabbitMQ/MacPorts/集成脚本迁移；普通能力/终端交互与既有生命周期保持。
- [x] 集成验证（代码与隔离测试）：Go、macOS/Linux/Windows 合约与相关 TS 行为、平台构建、独立审查；真实系统安装/Keychain/FTP 验收单独报告，未经运行不宣称完成。

## 13 实施记录与验证结果

本次代码已在 `fix/macos-helper-hardening` 完成，未提交、合并或发布；Helper 与客户端及签名安装协议同时升级到 **42**。真实系统验收另列，不把代码检查等同于发行验收。

### 实现收敛

- Go 的 `unix_policy.go`、`unix_hosts.go`、`unix_dispatch.go`、`unix_ftp.go`、`unix_tool.go` 共用策略 schema、受保护句柄、hosts 合并/摘要/原子事务、FTP 配置与账户解析、固定工具限时及输出边界。Darwin 文件仅承担固定路径、原生 ACL/flags、Keychain/DNS、launchd 与实际进程出生时间差异；不增加通用命令注册器。
- Darwin 固定 dispatcher 拒绝旧脚本/文件/PID/模块修复 RPC。连接绑定真实 `LOCAL_PEERPID` 和 UID；策略/密钥在启动时加载，health 验证受保护资产而不并发更新全局授权。密钥 root 持有，原生 ACL 只允许安装 UID 读取；只检查 FlyEnv 自身管理目录的属性，按用户要求取消系统祖先的权限/所有者/ACL 门槛，不再需要 `/private/var/run` 的特殊兼容分支。详见 review 第 10 节。
- 原生 ACL/文件属性/进程身份桥接集中于 `darwin_acl.go`；无 cgo 时相关安全操作明确失败。Darwin 构建固定 SDK sysroot 与 macOS 12 部署目标，Linux/Windows 仍无 cgo。当前 Electron 39 原有系统下限为 macOS 12，未因本次使用新版 SDK 提高到 macOS 15。[Electron 官方兼容说明](https://www.electronjs.org/blog/electron-38-0)
- AppHelper 固定 bootstrap 将发布应用复制到 root 私有 staging，校验真实发行者签名及完整 sealed resources，并要求签名 Info.plist 的 `FlyEnvHelperProtocolVersion=43` 后才执行安装脚本，旧真实发布包也不能回退执行旧安装协议。图形安装调用原有 Sudo.ts applet 认证，传入 FlyEnv 名称和图标；不修改共享提权实现，终端复用同一固定命令；开发未签名安装单独明确标记，不从生产失败降级。停旧服务和真实 PID 退出是更新授权资产的必要前提。
- 客户端共用 `Host/UnixHosts.ts`，全文与托管块编辑共享队列，退出先 drain 再 clear。Go 返回实际 changed，全文无变化不会写或刷新；macOS 成功改变后统一调用固定 DNS，DNS 或诊断失败只影响刷新结果，不重放或否定已经完成的 hosts 写入。未改 `ProcessSend.ts` 或 renderer `util/Host.ts` 的错误展示。
- CA 只允许安装批准的公共证书指纹；普通查询同时核对系统 keychain 中的精确证书和有效信任，不按 CN 判定，也不通过显式信任锚参数绕过安装状态。后台任意 sudo、密码保存/注入、通用文件/进程提权与登录项/quarantine 回退已撤回；PHP/RabbitMQ/个人 shell 改普通用户操作。MacPorts 老数据库安装资源集中准备到普通用户 basedir，未写系统包目录。
- MacPorts 换源由一个模块本地 controller 持有预览、IPC、XTerm、重入 guard、清理与文件结果，无 Pinia/共享配置扩展；两个必要文件独立执行，保留 completed/failed/unknown 与终端记录，部分失败不自动重放。系统文件普通编辑器保持只读，明确终端维护。
- FTP 使用固定安装 UID launchd 实例、受保护配置与运行数据库；pure-pw 数据生成降到普通 UID。bootstrap 前记录意图、启动后记录精确 PID/出生时间，停止前保存已观察会话，失败可重试。已追踪 PID 的出生时间无法读取时保留 state 并报告未知，不能据此删除 state 或声称已停止。普通用户安装的 root FTP 程序/依赖例外仍按已批准范围保留。

### 已运行检查

- Go 1.24.5 本机 `go test -race ./...` 与 `go vet ./...` 通过；native fixtures 覆盖有效签名拒绝旧 RPC、实际 peer PID、精确只读 ACL、hosts ACL/xattr/flags、全文/no-change/摘要冲突/硬链接、FTP 失败与身份未知状态。独立审查发现的 DNS 缺调用和 FTP 未知身份误报均先新增失败用例复现，再修正通过；全文 no-op 返回值也补了实际 Go dispatch 用例。
- 合约和版本同步、macOS 安装/health/CA/换源结果、Unix 普通过程/hosts DNS、Linux Helper chain/install-flow/UI/service-start/迁移的 transport/draft/background/readonly/log/tool、Windows Helper init/resilience/check/install-IPC、renderer operation boundaries、fork error transport 等相关脚本通过。Unix 普通过程 fixture 使用真实 ps 并在信号边界注入，未向外部进程发送信号。service-start fixture 留足普通 Node 启动时间，避免 80 ms 导致提前误判成功。
- main/fork 生产编译、renderer 完整生产构建通过（renderer 默认 Node 内存 OOM 后用 8 GiB 构建内存重跑通过）。改动 TS/Vue lint、Prettier 与 diff whitespace 检查通过。全量 vue-tsc 基线为 66 个既有错误，实施后为 65 个，无新增；不是全项目类型检查已清零。
- Darwin arm64/amd64、Linux arm64/amd64、Windows amd64 Helper 均重新编译到 `src/helper-go/dist`；Windows/Linux main 测试包也交叉编译通过。`otool` 确认两个 Darwin 产物 `minos 12.0`；跨平台编译不代表在对应系统运行过完整业务。
- 临时复制现有真实签名发布包的签名验证通过，修改其已 sealed 的安装资源后拒绝；新协议 gate 会拒绝缺少 42 标记的旧发布包。没有构建/安装本次正式签名发行包。
- 既有 `linux-helper-migration-test.ts installer` fixture 在当前 macOS 上实施前后均失败；`startup-hosts-sync-test.ts` 与 `flyenv-shell-integration-test.ts` 的旧源码断言在基线已失败。相关真实安装 single-flight 行为测试通过，不把这些基线失败计作通过。

### 未运行的系统验收

尚未对真实系统安装/更新 Helper、写系统 hosts 或 Keychain、启停 root launchd FTP；新签名发行包首次安装/升级、Intel 真机、受支持旧系统版本、实际 FTP 登录/上传/账户更新/动态库与会话退出、旧 MacPorts MySQL/MariaDB 初始化需专用环境验收。当前机器只读检查发现 `/private/etc` 为 777，本次未修改它。用户随后明确要求 macOS Hosts 不受该目录权限限制，已在 v43 移除 Hosts 父目录保护校验，实施与回归见 review 第 9 节；策略、密钥和 socket 等帮助程序自身资产仍检查父目录。

普通 UID 501 在当前 macOS 的短暂 bind/close 探测：`0.0.0.0`/`::` 的 80、443 成功，`127.0.0.1`/`::1` 的 80、443 返回 EACCES，四种地址的 18080 均成功；没有改变现有服务地址、端口或提权行为，也没有把这一台机器的结果扩成所有系统保证。

## 14 独立 review 跟进

用户已授权处理 [独立 review](macos-helper-hardening-review.md)。两个 Major 及优先 Minor 已修复：macOS sudo 终端统一入口、图形/终端安装实际互斥、完整 hosts 编辑原始摘要、响应 Key 与 Darwin 超时、MacPorts 失败结果保留、受保护文件/CA/socket 与安装预检细节。无用密码/FTP 分支已清理；验证结果、必要澄清和未扩展项目见 review 第 6 节。系统验收边界继续按第 13 节，不因代码审查通过而豁免。

### 2026-10-07：CA 安装解耦（协议 v44）

按用户确认，仅解除 CA 与 Helper 安装/健康检查的耦合，CA 导入仍走固定 Helper 接口。复用已有自动 SSL 流程和 sslFindCertificate/sslAddTrustedCert 契约，按固定名称检测系统 Keychain，缺少时导入数据根中的固定公有 CA 临时快照；不增加 Sudo 流程、指纹绑定或 verify-cert 门槛。实际 CA 操作失败只阻断本次 SSL，不阻断 Helper/hosts。详见 macos-helper-hardening-review.md 第13节。

### 2026-10-07：兼容 review 全部问题（协议 v45）

集中保留系统附加组；FTP 固定输入由普通 fork 按真实账户权限读取有界快照，两端共用普通账户 pure-pw 构建与固定数据库发布；移除 Helper 初始化对 `/etc`、`/var` 的全局别名断言。固定 root 业务、自身授权资产、Sudo 原 applet 与现有操作生命周期保持。完整结果及测试范围见 [Unix 兼容 review](unix-helper-compatibility-review.md) 末尾；最终 Helper 协议为 v45。
