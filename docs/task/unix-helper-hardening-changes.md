# macOS / Linux 帮助程序调整：旧版与 v45 对比

整理日期：2026-10-07。

本文以 Git 历史和当前源码为依据，说明本轮 Linux 权限收敛、macOS 同步实施、review 修复及后续兼容性调整的最终结果。Windows 只列本轮相关的 CA 查询、取消错误类型和版本同步，不将此前独立的 Windows 权限改造算进本次 Unix 调整。

## 1. 对比基线与范围

| 对象 | 旧版基线 | 当前实现 |
| --- | --- | --- |
| Linux | `ea981845256db2adbd3a8ab667a886193ccbbdab`，即 Linux 收敛提交 `548e4c52` 的父提交；Helper v37 | `02efa6f543720ea82040632d4ebb3a665af0c2c0`，Helper v45 |
| macOS | `befe3bef1db4b4b008a57f8164a433673e8abf69`，即 macOS 收敛提交 `96a8f0bf` 的父提交；Helper v41 | 同上，Helper v45 |
| Windows 相关行为 | Unix 调整前既有 Helper/UAC 权限路由；CA 查询含本地证书指纹比较 | 保留权限路由，恢复 CA 按名称查询；取消错误集中维护，Helper 版本同步 v45 |

两端使用不同旧版基线，是因为 Linux 先实施，macOS 后实施。macOS 旧版 v41 已包含 Linux 的第一轮收敛，不能把 v41 中的 Linux 实现当成 Linux 收敛前的旧逻辑。

本文描述的是源码差异，不代表上述旧提交已经发布给全部用户，也不代表 v45 已完成签名发布和各平台真机验收。整理时工作区干净，当前实现已经包含在 `02efa6f5` 中。

范围包括 Go Helper、main/fork 调用迁移、安装维护、Hosts/CA/FTP、密码与终端处理，以及本次会话中与服务停止和启动 Keychain 提示有关的配套修复。无关服务模块的新功能和依赖升级不在范围内。

## 2. 核心变化

旧版并不是没有认证：已经有 HMAC、请求时间戳、nonce 防重放、Unix 对端 UID 校验、部分路径与参数检查。主要问题是通过认证的账户仍能调用通用 root 操作，例如执行用户目录里的脚本、通过通用接口覆盖文件、以 root 运行一些模块维护程序。

当前 Linux/macOS 继续使用常驻 root Helper，但日常入口收敛为固定业务。普通权限可完成的操作回到 main/fork；真正需要 root 的操作由 Helper 根据固定路径、安装账户和业务参数完成。签名正确也不能调用已关闭的旧接口。

主要结果：

- 关闭 Unix 通用 root 脚本、文件读写、删除、chmod、链接和任意进程终止 RPC。
- 保留固定 Hosts、固定 FlyEnv CA、DNS 刷新、固定 PID 目录修复和受管理 FTP。
- Linux Web 服务低端口启动降到普通账户，只增加端口绑定 capability；macOS 保持既有普通 Web 启动。
- 普通系统维护通过用户可见终端和系统 sudo 认证完成，不存储或自动注入管理员密码。
- 安装策略与密钥由 root 管理；用户自管目录的所有者、mode、ACL 不作为额外全局使用门槛。
- CA 不参与 Helper 安装或健康检查，自动 SSL 复用原流程，按固定名称检测，缺少时导入。

这些变化没有关闭终端里的合法 sudo，也没有撤销用户批准的 FTP root 运行例外。HMAC 和对端身份检查不能隔离同一个授权账户下的其他代码；该账户仍能使用明确委托的固定业务能力。

## 3. RPC 能力变化

### 3.1 旧通用接口的去向

下表仅描述 Linux/macOS。Windows 的文件、环境变量和进程权限接口按其既有契约保留。

| 旧接口或能力 | 当前 Unix 行为 | 功能如何保留 |
| --- | --- | --- |
| `tools.runScript(shell, scriptPath)` | 两端 dispatcher 拒绝 | 普通服务在 fork 启动；Linux 低端口走固定 `service.launchLowPort`；管理员维护走可见终端 |
| `tools.writeFileByRoot` / `writeBufferBase64ByRoot` | 两端拒绝 | 普通文件按当前账户写；系统 Hosts 使用专用接口；其他系统文件不自动 root 覆盖 |
| `tools.readFileByRoot` | 两端拒绝 | 普通账户读取；固定 Hosts 读取走专用接口 |
| `tools.rm` / `chmod` / `ln_s` | 两端拒绝 | 普通账户删除、改权限、创建链接；真实权限不足返回错误 |
| `tools.kill` / `killPorts` | 两端拒绝 | 普通服务按当前账户发送信号；FTP 只停止 Helper 自己管理的实例 |
| `tools.processList` / Unix 任意端口进程查询 | 不再作为日常 Helper 入口 | 普通 `ps` / `lsof` 查询，不因查询而安装或访问 Helper |
| `redis.logFileFixed(path, user)` | 两端拒绝 | 仅保留不接收路径/用户/权限的 `repairManagedPidDirectory()` |
| `php.iniFileFixed` 与 root `chmod 777` | 两端拒绝 | 使用用户目录内的 PHP 配置，通过 `-c` 传给服务 |
| `rabbitmq.initPlugin(cwd)` | 两端拒绝 | 普通账户执行插件初始化 |
| `mysql/mariadb.macportsDirFixed` | macOS 拒绝；Linux 无此业务授权 | 普通用户准备数据库资源视图，不改系统安装目录 |
| `mailpit.binFixed` | macOS 拒绝 | quarantine 清理由普通账户尝试，失败如实返回 |
| `tools.removeLoginItemMac` | macOS 拒绝 | 使用 Electron 既有登录项设置，不追加 root 清理 |
| 旧 CA 任意目录/名称导入能力 | Unix 只接受固定业务来源 | 导入策略数据根 `server/CA/FlyEnv-Root-CA.crt`，不接受额外证书或任意目标 |

旧代码的一部分仍留在跨平台 `main.go`、`module/` 或类型联合中，用于 Windows、历史兼容和契约检查。**存在旧函数定义不等于 Unix 仍可调用**：Linux/Darwin 请求分别进入专用 dispatcher，不落入旧通用 switch；契约中的 `windows` 或 `legacy-disabled` 标记也不授权 Unix 调用。

依据：[Linux dispatcher](../../src/helper-go/linux.go)、[Darwin dispatcher](../../src/helper-go/darwin.go)、[机器可读契约](../../src/helper-go/contract/helper-contract.json)、[Helper 客户端](../../src/fork/Helper.ts)。

### 3.2 v45 实际保留的 Unix 接口

| 接口 | 参数与结果 | 固定权限范围 |
| --- | --- | --- |
| `helper.version()` | 返回版本 | 版本查询 |
| `helper.health()` | 返回健康信息 | 检查 Helper 本身；macOS 核对启动策略、密钥和 socket，CA 不参与 |
| `host.readHosts()` | 返回 `{ content, digest }` | Linux `/etc/hosts`；macOS `/private/etc/hosts` |
| `host.replaceHostsContent({ content, digest })` | 返回是否实际改变 | 固定 Hosts 全文编辑，必须带原始摘要 |
| `host.syncManagedEntries({ entries, digest })` | 返回是否实际改变 | 固定 Hosts 的 FlyEnv 托管块 |
| `host.clearManagedEntries({ entries: [], digest })` | 返回是否实际改变 | 只清理 FlyEnv 托管块 |
| `host.sslFindCertificate(cwd, commonName?)` | 返回查询结果 | Unix 只接受固定 CA 目录与名称 `FlyEnv-Root-CA`；保留旧接口形状 |
| `host.sslAddTrustedCert(cwd, caName)` | 导入成功才返回成功 | Unix 固定数据根中的 `FlyEnv-Root-CA.crt`，固定系统信任位置 |
| `host.dnsRefresh()` | 返回执行结果 | 固定平台解析器操作，无调用者指定服务或命令 |
| `tools.repairManagedPidDirectory()` | 返回执行结果 | 策略数据根下 `server/pid`，不接收任意 path/UID/GID/mode |
| `ftp.start({ bin, config, users })` | 返回主进程 PID | 固定 FTP 实例、配置格式、普通账户映射和运行文件 |
| `ftp.stop()` | 返回停止的主 PID | 只停止受管理 FTP，验证实际退出 |
| `ftp.refreshUsers({ users })` | 返回刷新结果 | 更新受管理 FTP 的固定数据库 |
| `service.launchLowPort(request)` | 返回 PID；仅 Linux | 固定 Nginx/Apache/Caddy/FrankenPHP 启动形状，普通账户加绑定 capability |

`cwd`、`caName` 等旧参数保留是为了复用自动 SSL 的既有调用，不代表 Unix 仍允许任意路径或名称。FTP 内容快照是 v45 的协议变化，不能向旧 Helper 发送后假定兼容。

## 4. 身份、策略、密钥与通信

### 4.1 授权来源

旧版 Unix 使用 role 文件识别账户，可从 `/usr/local/share/FlyEnv/flyenv.role` 或 `/tmp/flyenv.role` 读取；目录允许范围还涉及 allowed-roots 和其他用户环境信息。

当前两端只使用管理员安装时生成的受保护策略。策略最终只有 `version`、`uid`、`gid`、`dataRoot` 四个字段；固定 action 和资源范围写在版本化业务代码里，没有新增动态权限注册表。用户不能在日常 RPC 中重新指定安装账户、扩大授权数据根或自报允许的附加组。

数据根安装时解析实际目录，接受用户维护的目录别名，不要求数据目录必须由桌面 UID 所有。账户必须是合法普通账户，策略版本必须匹配。policy/key 更新需要安装维护并重启 Helper，不能在运行请求中改全局凭据。

### 4.2 路径布局

| 资产 | 旧版 Unix | 当前 Linux | 当前 macOS |
| --- | --- | --- | --- |
| 授权策略 | role / allowed-roots 等旧来源 | `/etc/flyenv-helper/policy.json` | `/Library/Application Support/FlyEnv/Helper/policy.json` |
| 客户端密钥 | `/usr/local/share/FlyEnv/flyenv-helper.key`，启动后可能 chown 给用户 | `/etc/flyenv-helper/client.key` | `/Library/Application Support/FlyEnv/Helper/client.key` |
| socket | `/tmp/flyenv-helper.sock` | `/run/flyenv-helper/helper.sock` | `/private/var/run/flyenv-helper/helper.sock` |
| Helper 程序 | 既有平台安装位置 | `/usr/local/bin/flyenv-helper` | `/Library/Application Support/FlyEnv/Helper/flyenv-helper` |
| 守护服务 | systemd / `com.flyenv.helper` | 继续 `flyenv-helper.service` | 继续 `com.flyenv.helper` LaunchDaemon |

密钥仍为 32 字节，root 控制内容，通过平台 ACL 只授权安装 UID 读取。Linux 使用 POSIX ACL，macOS 使用原生 ACL；不能把 ACL 的 mask 映射到 mode 后的表现误当成向整个组授权。macOS 对密钥还核对 regular file、root owner、单链接、0600、长度和精确 ACL。

socket 位于 FlyEnv 管理的父目录，先完成创建、账户归属和 0600 设置，再开始接收业务。两端不再使用旧“监听后 sleep，再异步 chown/chmod”的路径，也不回退 `/tmp` socket。

### 4.3 请求身份与资源限制

- Linux 继续利用真实 Unix peer 凭据，授权 UID 改为匹配安装 policy。
- macOS 原先 `LOCAL_PEERCRED` 能获得 UID/GID，但旧实现没有实际 PID；现在增加 `LOCAL_PEERPID`，校验声明 PID 与真实连接进程，并结合实际程序路径进行一致性检查。
- 继续使用既有 HMAC、时间窗与 nonce，不将这些已有机制写成“本次首次增加”。Unix nonce 缓存新增容量限制。
- Linux/macOS 同时在途连接限制为 16，nonce 上限 16384；请求总大小沿用 1 MiB。Hosts 内容上限 1 MiB，CA 公共证书上限 256 KiB，固定工具输出上限 1 MiB；macOS 响应上限 2 MiB，容纳完整 Hosts 的 JSON 编码。
- 连接 I/O 有期限：Linux 30 秒，macOS 120 秒；macOS 客户端请求预算 125 秒，以容纳固定 FTP 多步骤启动。连接期限不等于整个业务在该时刻自动回滚，固定外部工具另有各自执行超时。
- 单请求响应后结束连接，修复 EOF/响应读取悬挂；响应携带原请求 key。macOS 超大响应拒绝也保留 key，避免客户端无法关联终态。
- 请求可能已经送达而响应丢失时，按未知结果处理，不自动换传输、重新提权或重放写入/停止操作。签名拒绝仍可按原机制刷新密钥重签一次；持续失败进入手动安装/修复提示，不自动安装。

依据：[共享 Unix 策略](../../src/helper-go/unix_policy.go)、[Linux policy](../../src/helper-go/linux_policy.go)、[Darwin policy](../../src/helper-go/darwin_policy.go)、[Darwin peer](../../src/helper-go/utils/peer_darwin.go)、[服务端](../../src/helper-go/main.go)、[客户端检查](../../src/shared/AppHelperCheck.ts)。

## 5. 安装与更新流程

### 5.1 Linux

旧脚本写 role/allowed-roots，拷贝程序与 systemd unit；部分命令依赖逐步 sudo 和最后一步状态判断。当前安装入口由 `AppHelper` 统一持有，图形授权调用既有 `Sudo.ts`，Linux 以 argv 调用 pkexec/kdesudo，避免 shell 再解释导致引号或命令类型错误；终端安装单独使用 sudo。

当前顺序为固定资源准备、确认旧 Helper 停止、安装策略/密钥、发布程序和 unit、启动服务、客户端核对版本/健康。旧服务停止失败时，不更换旧 policy/key。发布中间阶段失败返回真实错误，不实现自动回滚或第二轮授权。

systemd 继续 root 服务，新增 `UMask=0077`、`RuntimeDirectory=flyenv-helper`、`RuntimeDirectoryMode=0755`、`NoNewPrivileges=yes`，重启策略为 `on-failure`。应用源资源仅检查固定路径内存在可用普通文件，不以源目录 root 所有、group/other 不可写或无链接作为安装前提；发布后的 Helper 授权资产仍保护。

安装脚本不把已有 `/usr/local/bin` 的权限改成 FlyEnv 预设，也不检查系统祖先目录的 UID/mode。不存在的必要目录由真实安装操作创建，真实复制、ACL、启动错误仍失败。

### 5.2 macOS

旧流程从桌面可写位置执行安装脚本、复制程序/plist，并维护旧 role/allowed-roots。当前使用 `AppHelper.ts` 中固定 bootstrap，将发布应用复制到 root 私有 staging，校验发布者签名、sealed resources、Helper 签名及签名 Info.plist 中的 `FlyEnvHelperProtocolVersion=45`，然后只执行受保护快照中的安装资源。

生产来源签名或资源验证失败会真实拒绝安装。未签名 development 模式单独明确标记，不把未签名 production 包自动降级成开发安装，也不通过终端绕过相同生产校验。

**图形安装最终仍调用原有 `src/shared/Sudo.ts` sudo-prompt applet**，传 FlyEnv 名称和图标。曾引入的独立 `osascript do shell script ... with administrator privileges` 安装分支已撤回。Sudo macOS 原执行、认证和临时文件流程没有重写，只将取消错误替换成共享类型；可见 Terminal 命令使用 osascript 打开窗口是另一条业务路径。

新安装确认旧 launchd Helper 和真实进程已退出后，才更新 policy/key/program/plist。安装脚本在 Go 验证自身目录后显式恢复两级目录 0755，修复 umask 077 使目录实际变成 0700、客户端无法遍历读取 ACL 密钥的问题；key 自身的 0600 和安装 UID 读取 ACL 保留。

不再要求 `/etc`、`/var` 精确解析成某个系统别名后整个 Helper 才能启动；实际 Hosts/socket 使用固定目标，各自 I/O 失败由其业务返回。

### 5.3 两端共同的安装终态

- main `AppHelper` 持有实际安装 single-flight；图形和终端不能同时更新同一套资产。
- 终端由 main 发送固定命令并等待真实 PTY 退出，不将一份用户可改外层脚本作为新的可信安装入口。
- PTY 初始化、执行发送、非零退出、取消和健康检查失败均有终态；需要退出码的安装任务使用真实退出码，旧普通终端调用保留原约定。
- 成功要求安装执行成功且新 Helper 通过版本/健康检查。UI 页面卸载不提前释放实际安装锁，也不以 renderer 超时自动发起第二次安装。
- 安装已成功后的 Hosts 同步或附加回调失败，只报告自己的结果，不撤销安装成功或再次提权。
- Unix 不再在初始化 Helper 时强制生成/批准 CA；CA 文件缺少、损坏或不可读不影响基础安装和健康。

依据：[AppHelper](../../src/main/core/AppHelper.ts)、[Linux 安装脚本](../../static/sh/Linux/flyenv-helper-init.sh)、[macOS 安装脚本](../../static/sh/macOS/flyenv-helper-init.sh)、[PTY](../../src/main/core/NodePTY.ts)、[终端安装 owner](../../src/render/components/FlyEnvHelper/setup.ts)。

## 6. Hosts 与 DNS

旧版 Hosts 站点同步、删除、退出清理和编辑较多复用通用文件读写/提权回退，业务与通用 root 文件能力混合。当前固定文件接口同时支持全文编辑和托管块维护，不能通过请求指定另一份系统文件。

全文编辑保持任意域名、IP、注释和正常换行，不增加域名/IP 授权名单。读取返回 SHA-256 摘要，保存必须带原始摘要，不能在提交时读取一个新摘要替旧编辑“补票”。站点自动同步/退出清理仅修改完整 FlyEnv 标记块，保留块外内容；标记歧义返回错误，不能截断无关内容。

main/fork 使用共享 `UnixHosts.ts` facade 和进程内队列，Helper 对固定文件使用互斥、文件锁、摘要/身份复核与同目录临时文件原子发布。无变化返回 `false`，不换 inode、不刷新 DNS。退出先等待已进入的编辑收尾，再清理托管块。

原属性保留包括 owner、mode、ACL/xattr；macOS 还使用原生 ACL/flags 处理，遇到 immutable/append-only 返回维护错误。Linux 保留 xattr（包括适用的 ACL/SELinux 属性）。真正的读取、rename、属性保存或并发冲突不能伪装为成功。外部编辑器不遵守文件锁时仍有竞争限制，不能将原子 rename 描述成全系统事务。

后续按用户要求删除了两端 Hosts 父目录 UID/mode/ACL 的保护预检，`/private/etc` 或 `/etc` 的管理员自定义权限不会仅凭预设不符就被拒绝。固定文件自身、类型、单链接、大小和不跟随异常链接的边界仍保留。

通用 Unix 写文件/base64 写文件入口显式拒绝系统 Hosts，避免普通账户在 Hosts 可写时绕过摘要。专用编辑器仍可编辑完整 Hosts，普通通用文件读接口遇到固定 Hosts 则转专用读取。

DNS 行为分开说明：

- macOS 实际 Hosts 改变后，共享 facade 调固定 `dscacheutil`/`mDNSResponder` 刷新；刷新失败仅记录完整 debug，保留已完成的 Hosts 写入成功。
- Linux 固定 DNS RPC 收敛为 `resolvectl flush-caches`，不接受服务名，不再提供旧泛化重启 resolved/nscd/dnsmasq 的路径。当前 shared facade 没有为 Linux 新增每次写入后的自动 DNS 调用。
- DNS 失败不触发重新写 Hosts、重装 Helper 或第二次提权。

依据：[UnixHosts facade](../../src/fork/module/Host/UnixHosts.ts)、[共享事务](../../src/helper-go/unix_hosts.go)、[Hosts dispatcher](../../src/helper-go/unix_dispatch.go)、[平台属性](../../src/helper-go/darwin_hosts.go)。

## 7. CA 与自动 SSL

### 7.1 最终方案

自动 SSL 继续使用原 `Host/SSL.ts` 的生成、队列和站点签发逻辑，不新增 SSL controller 或 Sudo 流程。流程为生成或复用本地 CA、查询系统是否有固定名称、缺少时导入，随后继续站点签发。

Helper 安装和健康不读取 CA，不存指纹，不登记批准证书，也不要求为 CA 变化重新安装 Helper。固定名称为 `FlyEnv-Root-CA`；本地 `.crt` 存在不等于系统已经导入，所以重试仍查询系统。检测依据名称，不核对当前本地证书指纹、有效期或额外 verify-cert 状态。

Unix 导入范围仍收敛：仅数据根 `server/CA/FlyEnv-Root-CA.crt`，读取有界 regular file，验证单张公有 CA 和固定 CN，拒绝私钥、其他名称、多证书或混入额外内容。将验证后的字节写入私有临时快照，系统工具只读取快照，结束后清理。CA 私钥不交给 Helper。

平台实现：

- macOS：在固定 System Keychain 查询名称；导入使用固定 `security add-trusted-cert` 业务。
- Linux：按名称解析系统生成的信任 bundle；固定目标复制后执行平台信任更新工具。只存在 anchor 文件不能算导入完成；更新失败保留真实失败，可在下一次 SSL 请求重试，不缓存成功。
- Windows：现有 LocalMachine Root 查询改回按 `CN=FlyEnv-Root-CA` 匹配，不读本地 CA、比较 Thumbprint 或预检 CA 路径。查询走普通权限；导入仍使用现有 Helper/UAC 路由和实际证书输入校验，没有回退整个 Windows 权限系统。

查询/导入失败只影响依赖它的本次自动 SSL，不阻断 Helper、Hosts 或其他业务；已生成 CA 保留供重试，不因导入失败自动重生成。Unix 错误向外传播，Windows 沿用原类型化授权错误与普通证书工具错误的处理区别，debug 均保留原因。

### 7.2 与早期方案的区别

Linux/macOS 初次收敛曾采用安装批准 CA 指纹和 `host.installApprovedCA`，并引入 macOS 精确指纹/verify-cert 判定。用户随后明确选择解除安装耦合、按固定名称检测、仍由 Helper 固定接口导入。

因此，早期 plan 中“安装批准指纹”“首次 CA 需要重新安装”“health 验证 CA”“必须匹配精确证书”的文字是历史方案，不是 v45 行为。`installApprovedCA` 已从当前契约和可达 Unix dispatcher 删除，旧中间 `CertificateTrust.ts` 已删除。

依据：[自动 SSL](../../src/fork/module/Host/SSL.ts)、[共享 CA](../../src/helper-go/unix_ca.go)、[Linux CA](../../src/helper-go/linux_ca.go)、[macOS CA](../../src/helper-go/darwin_ca.go)、[Windows 查询](../../src/shared/WindowsHelperFallback.ts)。

## 8. 服务启动、停止和 PID 修复

### 8.1 Linux 服务启动

旧 Nginx/Apache/Caddy/FrankenPHP 部分启动走 `root:true` 生成脚本，再交给通用 root `runScript`。Tomcat/Numa 也有固定 root 启动分支。

当前普通端口优先普通启动；已知低端口的受支持 Web 服务走 `service.launchLowPort`，必要的权限错误回退只进入这个固定业务，不恢复 root 脚本。Helper 先启动自己的降权子入口，设置安装 UID/GID、系统真实附加组和 `CAP_NET_BIND_SERVICE`；子入口确认不是 root，设置 `no_new_privs`，然后才打开日志、读取用户配置并 exec 用户程序。

服务类型限 Nginx/Apache/Caddy/FrankenPHP，参数限现有前台启动形状，不接受 shell 或任意 CLI 模式。配置与日志按授权数据根别名比较逻辑相对路径；保留根内用户维护的文件链接，实际访问由普通子进程权限决定。Tomcat/Numa 不再固定 root 启动，不新增 JVM root 业务。

附加组现在集中从系统账户查询，不只保留主组，不接受 RPC 自报组列表或继承 Helper 的 root 组。组查询失败只阻断本次需要降权的启动/构建，不纳入整个 Helper 健康。

### 8.2 macOS 普通服务与显式终端

macOS Web/Tomcat/Numa 在其旧版基线已经普通启动，本次保持；没有照搬 Linux capability、增加 root Web RPC、PF 规则或通用端口代理。真实低端口/监听地址权限不足继续报告，不静默改端口或监听地址。

自定义服务和语言项目不再在后台调用 Unix sudo 或通用 root Helper。用户明确启用 sudo 的 macOS 命令通过集中 `MacTerminal.ts` 打开可见 Terminal，在其中进行系统认证；工作目录、环境和命令文件转义统一维护，清理失败不把已派发命令误报成未执行。Linux 自定义后台 sudo 不再支持，管理员命令应在显式终端执行。

### 8.3 停止与创建时间

Unix 普通进程查询由普通 `ps` 完成，返回 USER、PID、PPID、COMMAND 和 CREATED。`ps lstart` 使用英文 locale、UTC，转换为 ISO 创建时间；较旧普通进程表没有这个创建时间字段。常规服务停止不再因 Helper 在线就优先 root kill，也不因普通停止失败回退 Helper。

本次会话复核确认 macOS 已使用三端共用的并行批量停止和初始进程列表传参，无需再建一套 macOS 并行机制。补齐 Base 的初始身份传递、pgAdmin 的公共停止/退出确认，以及 CloudflareTunnel 的共享进程表查询，避免遗漏模块继续使用独立轮询。

服务归属筛选、进程树和退出等待使用创建身份，避免把相同 PID 的新进程当旧服务。普通 Unix `ps lstart` 是秒级时间，不能承诺原子、无竞态的 PID 句柄身份保证。执行层只按已确认列表发送信号，不重复加查询或因一个无效候选取消其他有效目标；FTP root 停止另用专用实例与平台身份。

独立服务并行停止，逐项保留 stopped/skipped/failed；必要停止失败不注销当前服务登记，也不阻止其他实例收尾。停止与退出等待仍区分，不能把“信号命令返回”当作全部退出。

### 8.4 固定 PID 修复

旧修复通过 `redis.logFileFixed(path, user)` 等接口，可能带任意目录/用户并继续尝试删除。当前 `repairManagedPidDirectory()` 不接收参数，只打开安装数据根 `server/pid` 的固定目录句柄，再设置安装 UID/GID 和 0755。

这条 root 改属性路径继续不跟随链接，不能因为支持用户配置/日志链接就扩大成任意 root chown/chmod，也不递归接管或删除未知 root 文件。

依据：[Linux 低端口](../../src/helper-go/linux_service.go)、[Unix 凭据](../../src/helper-go/unix_user.go)、[路径比较](../../src/helper-go/unix_path.go)、[普通进程](../../src/shared/Process.ts)、[创建时间解析](../../src/shared/Process.unix.ts)、[身份与退出确认](../../src/shared/ServiceProcessIdentity.ts)、[批量停止](../../src/main/core/ServiceProcess.ts)。

## 9. Pure-Ftpd

旧模块使用后台 `sudo -S` 等路径启动用户安装的 FTP，未使用现在这套固定 Helper 实例与受保护运行状态。FTP 需要 root 的原因包括身份切换/chroot，不只是 21 端口，不能按普通 Web 服务处理。

当前两端统一 `ftp.start/stop/refreshUsers`，复用既有服务生命周期，没有新 renderer 服务控制器。

### 9.1 输入与数据库

普通 fork 在固定 FTP 目录读取 `pure-ftpd.conf`、`pureftpd.passwd` 并提交有界内容快照。缺少 passwd 视为空用户；真实不可读、异常文件类型、超限仍失败。文件由管理员或其他账户持有但普通账户实际可读时，不再因 UID 不符拒绝。Helper 不继续以 root 去读取这些用户输入文件。

Helper 解析封闭 FTP 配置格式，强制运行配置中的 PureDB/PIDFile 指向自身运行目录；虚拟用户 UID/GID 强制映射安装账户。不能指定任意认证程序、shell、实例 label 或系统写入目标。

`pure-pw mkdb` 两端共用 `unix_ftp_database.go`，在私有 staging 中以普通安装账户及系统附加组生成，Helper 有界读取生成结果，恢复运行目录私有权限后发布固定数据库。Linux 初版收敛仍 root 运行 pure-pw，这一遗漏已修复。生成或恢复权限失败不会替换旧数据库；已完成的普通用户文件修改保留，不自动重放。

### 9.2 平台生命周期

- Linux：固定 `flyenv-pure-ftpd-UID.service`，systemd 管理进程组；固定启动参数、`KillMode=control-group`、SIGINT、停止期限和 `PartOf=flyenv-helper.service`。停止后检查 unit 状态与 MainPID，不仅删除 PID 文件。
- macOS：固定 `com.flyenv.pure-ftpd.UID` launchd job，Helper 管理 plist、state、主进程和已观察会话；保存启动意图、PID 和原生进程出生身份。停止前持久化会话身份，再 bootout，并核对相关会话退出。
- macOS 无法确认已追踪 PID 的出生身份、发现 PID 复用或残留会话时，返回失败/未知并保留 state，不误杀别的进程或宣称已全部停止。Linux/macOS 不接受任意 PID 的 root 兼容清理。

### 9.3 明确保留的例外

两端仍允许普通用户安装的 Pure-Ftpd 以 root 主服务运行，这是用户批准的业务兼容例外。只做固定名称、程序类型和业务参数限制，不新增“程序必须 root 所有/不可写/全部依赖已批准”等门槛。

因此，用户可改程序和动态库的风险仍存在，不能声称这次关闭了所有用户代码的 root 执行能力。关闭的是通用 root 脚本/文件等入口；pure-pw 数据生成已普通化，FTP 主服务的例外没有撤销。

依据：[fork FTP 输入](../../src/fork/module/PureFtpd/HelperInputs.ts)、[共享 FTP 解析](../../src/helper-go/unix_ftp.go)、[数据库生成](../../src/helper-go/unix_ftp_database.go)、[Linux 生命周期](../../src/helper-go/linux_ftp.go)、[macOS 生命周期](../../src/helper-go/darwin_ftp.go)。

## 10. 其他模块、密码与 Keychain

### 10.1 普通功能迁移

- PHP：Unix 使用用户数据目录内按版本区分的 ini，不再通过 Helper 复制系统 ini 或 chmod 777；普通可写配置继续保存，系统配置无自动 root 覆盖。
- RabbitMQ：插件初始化普通执行，不把用户指定 cwd 中的插件程序交给 root。
- MacPorts MySQL/MariaDB：所需 share 资源复制到普通用户 `database-resources`，准备 bin 视图并传 basedir，保留系统安装目录。
- MacPorts 换源：fork 返回两个固定配置文件的预览，由模块本地 controller 持有快照、XTerm、进度与终态。系统写入通过显式 sudo 终端；两个文件独立处理，保留完成/失败/未知，不因一个失败重放已写成功项。
- Shell/PATH/别名：普通 Unix 用户目录管理；集成脚本不再依赖 root 修正安装目录权限。
- 系统环境文件、扩展安装和包管理维护：必要 sudo 保留在用户可见终端；普通文件编辑失败不会借通用 Helper 扩大权限。
- Mailpit quarantine、登录项及 Ollama 补充硬件信息：移除无必要 root 回退；普通操作真实失败或不可读信息按业务处理，不静默请求额外权限。

### 10.2 密码与取消

Linux/macOS 清除旧 `config.password`，不再把管理员密码写回配置、广播到 renderer 或留在 `global.Server.Password`；后台 `execPromiseSudo` 拒绝 Unix 任意命令，PTY 不自动响应 `Password:` 注入保存值。

终端中的 sudo 仍可按系统规则认证，FlyEnv 不替用户提供保存密码。Windows 原有平台执行机制不因 Unix 迁移被重写。

三端取消错误集中到 `SudoError.ts`：共用 `SudoCancelledError`，Unix 使用 `elevation_cancelled`，Windows 使用 `elevation_uac_cancelled`；Windows 启动/状态超时/真实命令失败继续区分。Linux pkexec 返回 126 时结合提权标记判断，不能把已提权程序自己返回 126 错判为用户取消。macOS 仅替换原 applet 取消分支错误类型。

### 10.3 启动时的 “FlyEnv Safe Storage” 提示

这是同一轮排查中的配套修改，属于 Electron 插件密钥存储，不是 Go Helper 的 `client.key` 或自动 SSL CA。safeStorage 获取改为仅在插件秘密确实需要加解密时进行，减少无必要的启动 Keychain 访问。

已有 `enc:` 插件秘密仍需要解密，不能为消除提示改成明文或跳过校验；未签名/身份变化应用可能仍出现系统 Keychain 授权。这个优化不能承诺所有启动场景都没有弹窗，也不改变 Helper 安装必须满足的生产签名条件。

依据：[MacPorts 资源](../../src/fork/module/Mysql/MacPortsResources.ts)、[MacPorts controller](../../src/render/components/Setup/MacPortsSrc/Controller.ts)、[共享取消类型](../../src/shared/SudoError.ts)、[Sudo](../../src/shared/Sudo.ts)、[Application](../../src/main/Application.ts)、[PluginManager](../../src/main/plugins/PluginManager.ts)。

## 11. UI 提示与 debug 结果

三类结果必须分开：

1. **需要安装/修复 Helper**：缺程序、缺/损坏密钥、不可达、旧版本、不健康以及持续签名失败等可用性问题，沿既有 needInstall 事件打开通用提示。业务 IPC 返回通用安装文案；原错误 code、路径、stderr、stack 保留 cause/debug，不把 `[AppHelper][repair] helper_key_missing: ...` 当面向用户的文案。
2. **实际安装失败**：显示真实原因，不能一律替换成“需要安装”。安装端记录完整原始 stderr/堆栈，IPC 与状态广播保留诊断。UI 展示可以有长度上限，完整诊断仍在日志。macOS 签名/资源、版本、ACL 类生产失败直接显示诊断，不自动弹 XTerm 重试同一失败；其他原有终端维护入口继续按原分支处理。
3. **业务执行失败**：Hosts 真正写失败、CA 导入失败、FTP 数据库失败或停止未完成返回该业务真实错误，不能统一伪装成 Helper 不存在。DNS、日志、清理等附加失败不能覆盖已经完成的主结果。

取消授权单独结束，不报安装成功，也不自动打开下一轮认证。结果超时或响应丢失保留未知，不替用户选择另一种权限方式执行。

通用 `ProcessSend.ts` 与 renderer `util/Host.ts` 没有承担本次错误文案转换。提示策略收在 Helper 可用性/安装 owner，避免改所有业务错误的展示路径。

第一次添加站点会触发固定 Hosts 写入，因此新增的密钥前置检查可能在这个时机发现未安装/旧安装缺少 `client.key`。检查本身保留，修复的是前置失败的业务输出：保留 debug 详情并返回通用安装提示，而不是让用户看到底层路径和 `[AppHelper][repair]` 原文。这与实际安装执行失败的真实诊断展示是两条不同路径。

## 12. 后续 review 中撤回或修正的内容

以下不是旧版必须满足的环境条件，也不是当前新增阻止项：

- **CA 与安装绑定**：已撤回；安装/健康不访问 CA，固定名称查询替代批准指纹。
- **Hosts 父目录权限检查**：两端已删除；不因 `/private/etc`、`/etc` 的 UID/mode/ACL 预设不符阻止编辑。
- **系统祖先权限递归检查**：不作为 Helper 资产保护的一部分；只检查 FlyEnv 自身资产，保留实际 I/O 失败。
- **用户数据根必须由安装 UID 所有**：已删除；数据根别名安装时解析，服务请求保持 UI 原路径与普通账户访问能力。
- **FTP 输入必须安装 UID 所有**：已删除；用普通 fork 实际读权限，不能简单去掉 UID 判断后仍让 root 任意读用户文件。
- **Linux 应用源必须 root 所有/不可共享写/无链接**：已删除；显式安装固定资源，发布后资产仍保护。
- **macOS `/etc`、`/var` 精确别名全局断言**：已删除；无消费者的检查不阻断所有 Helper 业务。
- **降权只带主组**：已修正；共享凭据查询真实附加组，避免普通账户本来能读而 Helper 降权后失败。
- **Linux pure-pw root 生成**：已修正；与 macOS 统一普通账户生成和固定发布。
- **独立重写 macOS 安装认证实现**：已撤回；恢复原 Sudo applet 调用，取消类型集中维护。

仍然保留的限制包括固定业务/账户/资源、HMAC/peer 身份、防重放、请求与内容大小、Helper 自身 key/policy/socket/state 保护、固定 root PID 路径与真实读写/执行失败。这些与用户文件夹权限预设不是同一类检查。

详细 review 依据：[兼容边界复查](unix-helper-compatibility-review.md)、[macOS review 与跟进](macos-helper-hardening-review.md)。

## 13. 发布版本、升级与验证状态

### 13.1 版本阶段

- Linux 旧基线 v37；首轮权限收敛及链路修复提交 `548e4c52` 采用 v40，后续 `1a276797` 为 v41。
- macOS 收敛提交 `96a8f0bf` 采用 v42，Linux/macOS 共享 Unix 业务进一步集中。
- v43：两端系统/用户目录权限边界、Hosts 父目录检查和相关安装兼容修复。
- v44：CA 安装/健康解耦，固定名称查询和固定接口导入。
- v45：FTP 普通账户输入快照协议、共享附加组/数据库构建及剩余兼容 review 修复；当前最终版本。

客户端 `HelperVersion`、Go `Helper_Version` 与 macOS 签名 Info.plist 标记统一为 45。旧 Helper 通过现有版本检查要求更新，不降级旧 socket/通用 RPC；安装通过后才使用新请求形状。密钥/策略由安装重新生成，不能仅复制一个 v45 二进制就假定旧资产满足新协议。

Go Helper 产物重建范围为 Darwin amd64/arm64、Linux amd64-v1/arm64、Windows amd64-v1/arm64，输出在 `src/helper-go/dist`。Darwin 使用 cgo 原生 ACL/xattr/进程桥接，构建部署目标 macOS 12；无 cgo 的 Darwin 安全相关操作明确失败，不能当生产替代包。

### 13.2 已有验证记录

以下汇总实施期间的实际记录；本次只整理文档，没有重新执行系统安装或改变系统信任。

- v45 契约校验：39 个契约方法及 TS 调用一致性；不是“39 个真机业务测试”。
- 本机 macOS Go 全包测试、race 和 vet；覆盖闭合旧 RPC、peer、固定参数、Hosts/属性、CA 格式与快照、Unix 真实组集合、目录别名和普通账户数据库失败保留旧结果等。
- Linux 测试包交叉编译和 vet；六种平台/架构 Helper 编译通过，main/fork 打包编译通过。
- 安装流程、缺密钥/版本/健康提示、真实失败诊断、取消、图形/终端互斥、实际 PTY 退出与页面卸载相关回归。
- 自动 SSL 运行时 mock：生成保留、按名称查询、缺少时导入、查询/导入失败后可重试及 debug；Windows 可跨平台的权限构造/路由/队列回归。
- 普通 FTP 输入快照、大小/实际不可读错误、macOS 固定 FTP 调用；MacPorts 部分结果、Unix 普通过程和 Hosts/DNS 失败边界回归。
- 服务停止首表/并行批次/Unix 创建时间及遗漏模块回归；修改文件 lint、安装 shell 语法与 diff 检查。
- 较早 Linux 实施记录中有 WSL 普通账户及隔离 root/FTP/CA/Hosts 验证；这些属于当时版本，不能代替后来 v45 改动的 Linux 原生系统验收。

代表性脚本：[CA 流程](../../scripts/macos-certificate-trust-test.ts)、[FTP 输入](../../scripts/unix-ftp-input-test.ts)、[安装](../../scripts/macos-helper-installer-test.ts)、[Linux 安装流程](../../scripts/linux-helper-install-flow-test.ts)、[终端安装](../../scripts/helper-terminal-install-test.ts)、[版本同步](../../scripts/helper-version-sync-test.ts)、[Windows 权限](../../scripts/windows-privilege-choice-test.ts)、[停止批次](../../scripts/service-stop-batch-test.ts)。完整记录以两平台实施计划、review 文档为准。

### 13.3 未完成的对应系统验收

当前 v45 仍需真实签名发行包的首次安装/升级、macOS Keychain 导入与 FTP 登录/上传/热更新/会话停止、Linux 原生 root/systemd/FTP/信任更新、Windows 实际证书存储查询/导入，以及 Intel/旧受支持系统的对应验证。跨平台编译、普通账户 fixture 和 mock 不能代替这些结果。

全仓 TypeScript 曾有既有诊断，旧 Hosts 等脚本也存在与当前行为不一致的源码断言；历史记录没有宣称全仓类型检查清零或所有历史脚本均通过。本文不将本轮相关回归通过扩大成全项目无问题。

## 14. 维护入口与参考文档

相同逻辑的最终集中位置：Unix policy/安全句柄在 `unix_policy.go`；Hosts 事务在 `unix_hosts.go`；固定 CA 校验/快照在 `unix_ca.go`；普通账户凭据在 `unix_user.go`；FTP 内容解析与数据库构建在 `unix_ftp.go` / `unix_ftp_database.go`；普通 FTP 输入在 `PureFtpd/HelperInputs.ts`；Unix Hosts 调用队列在 `Host/UnixHosts.ts`；安装实际互斥在 main `AppHelper`；取消错误在 `SudoError.ts`。

平台文件保留 systemd/launchd、ACL/xattr、固定系统目标与原生身份差异，不另建通用命令/权限框架。renderer 页面只绑定既有 operation owner，未为这次调整新增 Pinia、共享配置或第二套服务生命周期。

相关历史与实施资料：

- [Linux 权限收敛方案与实施记录](linux-helper-hardening-plan.md)。
- [macOS 方案与实施记录](macos-helper-hardening-plan.md)。
- [macOS 实施任务](macos-helper-hardening-implementation.md)。
- [macOS review 与后续修复](macos-helper-hardening-review.md)。
- [Unix 兼容边界 review 全部问题](unix-helper-compatibility-review.md)。
- [当前 Helper 契约说明](../../src/helper-go/contract/README.md)。

上述 plan 同时保存早期批准方案和后续记录，部分章节会出现旧指纹、旧版本或旧权限检查；判断最终状态应以本文明确的 v45 行为及当前源码为准。
