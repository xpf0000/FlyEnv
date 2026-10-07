# macOS / Linux Helper 兼容边界复查

日期：2026-10-06。范围：当前 master 工作区，包含尚未提交的 v43 调整。

初始复查仅审阅代码和调用链；以下位置及触发条件记录当时源码。后续按用户授权完成全部 7 项修复，并恢复 Windows CA 按名称查询，见末尾记录。没有执行 root 安装、系统文件写入或系统权限调整。

## 审阅原则

主要目标是关闭日常 Helper 的任意脚本、任意文件读写及其他通用 root 操作，保留固定业务功能。用户管理的系统目录、数据目录、应用源目录和第三方工具，不按 FlyEnv 预设的 UID、mode 或 ACL 设置额外使用门槛。

仍需保留客户端身份/HMAC、防重放、固定业务参数、FlyEnv 自身安装后授权资产的保护，以及真正执行时的错误。不能把“去掉外部环境检查”实现成恢复通用 root RPC，也不能让可选业务失败扩大到整个 Helper。

## 1. P1：降权时丢失用户附加组（已修复）

- `src/helper-go/linux_service.go:67`：低端口 Web 服务启动只设置 `Groups: []uint32{p.GID}`。
- `src/helper-go/darwin_ftp_database.go:49`：普通账户执行 pure-pw 同样只保留主组。

触发：用户属于项目共享组，程序、配置、文档根或动态库通过该附加组授予读取/遍历权限。普通账户直接运行能成功，Helper 降权后反而访问失败；Linux 还可能出现相同服务高端口正常、低端口失败的差异。

建议：集中构造 Unix 普通账户执行凭据，从系统账户查询该 UID 的真实组列表，保留正常附加组；UID、主 GID 与低端口 capability 仍按现有契约处理。不得由 RPC 自报组列表，也不得继承 Helper root 进程的组。组查询失败只影响相应子进程启动，不纳入整个 Helper 健康检查。

## 2. P1：可选 CA 失败扩大到安装和通用健康检查（已修复）

- `src/main/core/AppHelper.ts:164`、`:369`：两端安装准备都会自动读取既有 CA 并构造 X509Certificate，异常直接拒绝整个安装。
- `src/helper-go/unix_policy.go:230`：只要安装参数带 CA，读取、格式和指纹异常也拒绝整个策略安装。
- `src/helper-go/darwin_policy.go:198`：macOS 通用健康检查依赖批准 CA 快照。
- `src/shared/AppHelperCheck.ts:392`、`src/fork/Helper.ts:434`：该健康检查是第一次业务 RPC 的前置步骤。

触发：用户 CA 文件存在但不可读、损坏或被替换，安装 Hosts 所需的 Helper 也失败；已安装 macOS Helper 的 CA 快照异常，会导致 Hosts、FTP、PID 修复进入“需要安装/修复 Helper”的路径，即便通信与授权资产正常。

建议：基础安装/健康只依赖通信、版本、身份与授权资产。自动发现 CA 是独立的可选登记结果；失败应记录完整 debug 和 CA 登记失败，不阻止基础安装，不宣称该 CA 已批准。显式 CA 安装仍必须验证公共证书及批准指纹，失败真实返回，只影响 CA 操作；不得悄悄批准新指纹或自动重生成证书。macOS 批准快照验证移到 `installApprovedCA`，该业务已有对应检查。

## 3. P1：Linux 用户路径含符号链接会阻止整个安装（已修复）

- `src/main/core/AppHelper.ts:359`：Linux 直接传入数据目录的文本路径，macOS 在同一层已使用 realpath。
- `src/helper-go/unix_policy.go:219`、`:230`：共享安装输入通过 openNoSymlinks 打开数据目录和 CA，拒绝任意路径组件的符号链接。
- `src/main/utils/ServerPath.ts:114`：运行目录直接衍生各业务路径，没有在这里统一解析用户目录别名。

触发：用户通过 home 下的符号链接把 FlyEnv 数据放到另一块磁盘，或 CA 路径含用户维护的别名；普通 FlyEnv 文件操作能访问，Linux Helper 安装却失败。直接仅对安装参数加 realpath 也不完整：低端口请求仍使用原路径，随后会被 approved data root 的文本前缀判断拒绝。

建议：在用户路径进入安装/业务协议的边界统一解析目录别名，统一处理根路径与请求路径的比较，保持 UI 所选路径。不能全局取消 openNoSymlinks：它还负责保护 key/policy 和固定 root 写入目标。尤其 PID 修复必须继续只修改授权数据根下的固定目录，不能让用户目录链接变成任意 root chown/chmod。

## 4. P2：FTP 输入把所有者当作可读权限（已修复）

- `src/helper-go/unix_ftp.go:31`：配置、passwd 文件必须满足 `st.Uid == p.UID`。
- 两端 FTP start/refreshUsers 都使用此函数，输入是数据目录中的固定业务文件。

触发：管理员迁移/恢复文件后，配置由 root 或另一账户持有，但当前用户通过组、ACL 或 other 权限可以正常读取；FTP 仍会被 Helper 拒绝。拥有文件和能够读取文件并不等价。

建议：在普通 fork 读取固定 FTP 输入并提交有界内容快照，Helper 只做现有 FTP 配置/账户解析及固定运行文件发布；或者在授权 UID 的实际权限下读取。保留普通账户读失败，不能直接删 UID 条件后继续让 root 读取用户指定目标，否则可能重新形成特权文件读取能力。运行数据库与 state 仍是 FlyEnv 管理资产。

## 5. P2：Linux 应用源目录仍有 root 所有与不可写门槛（已修复）

- `src/main/core/AppHelper.ts:146`：checkLinuxInstallSource 从打包资源一直检查到应用根，要求 UID 0、无 group/other 可写位和无链接。
- `src/main/core/AppHelper.ts:350`：production 安装在调用提权前执行该检查。

触发：用户把应用复制到用户目录运行、修改应用目录归属，或自行调整共享权限；即使资源存在，仍在授权前拒绝安装。停止检查系统祖先只解决了上一层，应用源目录的管理方式仍被固定。

建议：区分“用户持有的应用源资源”和“发布后的 Helper 授权资产”。显式安装保持固定打包资源与安装参数，不以源目录 UID/mode 作为使用前提；发布目标的 key/policy/helper 文件仍按自身资产保护。此调整不得扩大日常 RPC，不能新增运行任意脚本的入口。当前发行配置只包含 deb/rpm；本问题的触发条件是用户复制/调整安装目录，不声称已支持 AppImage。

## 6. P2：macOS 系统别名检查仍是全局阻止项（已修复）

- `src/helper-go/darwin_policy.go:102`：启动要求 `/etc` 和 `/var` 精确解析为 `/private/etc` 和 `/private/var`。
- Darwin Hosts 与 socket 实际已经使用固定 `/private/...` 路径。

触发：系统别名被管理员调整或暂时不可解析，整个 Helper 退出，连无关 FTP、CA 和通信都不可用。这项检查没有提供当前固定操作所需的参数或授权信息。

建议：删除无实际消费者的全局别名断言；实际依赖固定路径的业务直接打开目标并返回相应失败。不能借此允许 RPC 指定另一份系统 Hosts 或任意 socket 位置。

## 7. P2：Linux pure-pw 数据生成仍以 root 执行（已修复）

- `src/helper-go/linux_ftp.go:103`：pure-pw mkdb 经 runFixedTool 在 root Helper 中执行。
- `src/helper-go/darwin_ftp_database.go:46`：macOS 已在普通 UID 下生成，再向固定 root 运行目录发布快照。

这不是用户目录权限阻止项，但属于本次“尽量减少不必要 root 执行”的复查结果。FTP 主服务 root 运行是用户已批准的业务例外，本轮不要求撤销该例外；纯数据生成不需要随之使用 root。

建议：复用集中维护的 Unix 普通账户数据库构建逻辑与第 1 项组凭据，Linux/macOS 只保留平台所需的 FTP 生命周期差异。用户安装程序和动态库不新增 root 所有/不可写要求，格式与固定参数限制保持原样。

## 已确认应保留的边界

- `main.go` 在 Linux/Darwin 路由到专用 dispatcher，旧 runScript、writeFileByRoot、任意 rm/chmod/kill 等通用 root 分支不可达。
- Helper 安装后的 policy/key/socket、CA 导入临时快照和 FTP 运行状态/数据库属于 FlyEnv 管理资产，保护要求不是用户文件夹使用门槛。
- Hosts 已不检查用户管理的父目录 mode/UID/ACL；仍需保持固定文件、内容边界、并发冲突及原属性保留。不可修改标志、真实 rename/读写/属性保存错误不能伪装为成功。
- 客户端 UID/HMAC、防重放、固定 FTP 配置和固定公有 CA 请求仍是授权边界，不能按本轮原则删除。
- Sudo.ts 原 applet 与三端执行机制不属于本轮重写范围；统一取消类不授权扩展认证流程。

实施时应继续使用现有 main/fork 操作所有者、互斥和终态，无需新增控制器、配置、权限框架或额外认证。每个失败只阻断其必要依赖；基础安装完成但可选登记失败必须分别保留结果和 debug 诊断。

## CA 与 Helper 安装解耦（实施约定）

复用 Host/SSL.ts 已有 sslQueue、CA 生成和站点签发流程，不增加控制器、共享状态或持久化。Helper 安装由既有 AppHelper/controller 负责；安装及健康检查只依赖 Helper 自身授权资产，不读取、批准或验证 CA。

自动 SSL 在已有流程中按固定名称 FlyEnv-Root-CA 查询；缺少时调用已有 sslAddTrustedCert 接口。Unix Helper 只接受策略数据目录 server/CA 下的 FlyEnv-Root-CA.crt，验证单张公有 CA 与固定名称，再通过私有快照导入固定系统信任位置；不开放任意路径、任意名称或脚本执行。导入失败只阻断依赖 CA 的本次 SSL 签发，保留已生成 CA 供重试，不影响 Helper 安装、健康及 hosts。Linux 信任更新失败必须报告失败，不能因已经复制 anchor 文件而缓存成功。Windows 行为保持既有流程。

验证覆盖：安装不访问 CA；固定 RPC 参数及证书边界；按名称查询、已安装时跳过导入、缺少时导入及失败后重试；相关安装/健康回归与 Go 测试。页面生命周期、重复调用仍由原有 operation controller 与 sslQueue 管理，无新增例外。

实施结果：CA 相关修复已完成；当时协议 v44、两端安装和健康不依赖 CA、固定名称查询/导入及错误范围详见 macos-helper-hardening-review.md 第13节。原第2项的指纹审批建议由用户明确选择的按名称检测、固定接口导入方案替代。其余6项随后按下述约定实施。

## 剩余问题实施约定（2026-10-07）

用户授权处理其余全部问题，并检查 Windows CA。Windows 保留既有自动 SSL、权限路由和 root store 导入，只恢复按名称查询，查询不读取本地 CA、不依赖其文件路径；真正导入仍检查实际证书输入并保留授权取消/执行失败。

Unix 用户凭据集中构造，附加组来自系统账号查询，不接受 RPC 自报或继承 root 组。Linux 低端口启动和两端普通 pure-pw 构建共用该凭据；组查询失败只阻断该次启动/构建。FTP 固定配置与 passwd 在既有 fork PureFtpd 模块按普通账户权限读取为有界快照，再通过固定 RPC 提交；Helper 只解析内容并发布固定运行资产，配置/读取/数据库失败为启动或刷新用户的必要失败，不使 Helper 健康失败。复用 macOS 既有数据库私有 staging/降权/输出快照逻辑给 Linux，不另建控制器、共享状态或持久化。

用户数据根在 policy 安装时统一解析实际目录；Linux 业务请求解析数据根别名后比较逻辑相对路径，保持界面配置原路径和根内用户维护的配置/日志链接，实际文件由降权子进程读写。PID 修复仍使用授权根中的固定目录与不跟随链接的文件描述符，防止任意 root chown/chmod；自身 key/policy/socket 保护不变。Linux 应用源只检查固定资源是否存在及为实际可用普通文件，不以来源目录 UID/mode/链接设安装门槛；已发布资产仍保护。macOS 删除无消费者的系统别名全局断言，固定 hosts/socket 由各自真实操作返回失败。

操作仍由 main AppHelper、fork PureFtpd/Base 和 Helper 现有生命周期分别持有。沿用 controller 的中间安装事件、终态、重复调用互斥，以及 FTP start/refresh 的已有终态，无新增 renderer 操作或例外。FTP 更新失败保留旧运行数据库及已完成的用户文件变更，不自动重放写入、重装或再次提权。

验证覆盖系统真实组集合、用户目录别名/服务参数、普通账户可读或不可读 FTP 输入、固定内容格式/大小、普通账户数据库失败保留旧结果、关闭的 root RPC/越界 PID 请求，以及 Windows 按名称查询/缺少时导入/失败后重试和现有权限取消处理。

## 剩余问题实施结果（2026-10-07）

全部 7 项已处理，变更保持在 master 未提交工作区。

| 原问题 | 实现与失败范围 |
| --- | --- |
| 1. 附加组丢失 | `unix_user.go` 从安装账户查询真实附加组，集中用于 Linux 低端口子进程与两端 pure-pw；账户/组查询失败只阻断相应启动或构建。 |
| 2. CA 耦合 | 延续已完成的固定接口方案；安装/健康不访问 CA，自动 SSL 按固定名称查询并在缺少时导入。 |
| 3. 数据根链接 | `policyInstallInputs` 解析数据根；`unix_path.go` 统一数据根别名比较，接受普通服务配置/日志中的用户链接，不扩大固定 root PID 修复范围。 |
| 4. FTP 输入所有者门槛 | `PureFtpd/HelperInputs.ts` 按普通 fork 权限读取固定输入、有界提交；Helper 不再以 root 读取这些用户输入，不检查文件 UID/mode。真实读取失败仍返回。 |
| 5. Linux 应用源门槛 | `checkLinuxInstallSource` 保留固定资源路径和普通文件检查，移除来源的 UID/mode/链接限制；发布后的授权资产保护不变。 |
| 6. macOS 系统别名 | 删除 Helper 初始化中 `/etc`、`/var` 的精确别名断言；固定 Hosts/socket 的实际操作错误由其业务返回。 |
| 7. Linux root pure-pw | 两端共用 `unix_ftp_database.go`，普通账户生成有界数据库，恢复运行目录私有权限后原子发布；生成失败保留旧数据库，不重放用户文件修改。 |

Windows 自动 SSL 原本已与 Helper 安装解耦，仍复用旧生成/签发队列以及现有 Helper/UAC 导入。`sslFindCertificate` 恢复只查询 LocalMachine Root 中 `CN=FlyEnv-Root-CA`，移除查询时的本地证书读取、指纹比较和文件路径预检；`sslAddTrustedCert` 的真实输入校验、授权取消和导入错误不变。无需回退整个 Windows 权限路由。

FTP 请求改为 `start({ bin, config, users })` / `refreshUsers({ users })`，因此客户端、Go Helper 和发行标记统一升至协议 v45，旧 Helper 需按现有版本机制更新。没有改 `ProcessSend.ts`、renderer `util/Host.ts`，也没有重写 `Sudo.ts` 的 macOS applet。

验证通过：`yarn test:helper`（39 项契约、本机 Go 测试及 vet）；Unix 凭据/目录别名/普通账户数据库回归；普通 FTP 输入快照、macOS 安装/健康/终端与 FTP、Linux 安装流程/链路/服务启动、Windows 权限选择及自动 SSL 运行时回归；版本同步、真实安装失败诊断和终端 PTY 回归；main/fork 打包编译、相关 TS lint、shell 语法与 diff 检查。Linux 测试包交叉编译与 vet 通过，六种平台/架构 Helper 已重新构建到 `src/helper-go/dist`。

验证范围：本机普通账户测试不修改系统信任库或启动 root FTP；Windows 测试的本地 PowerShell/证书存储分支需要 Windows，当前只运行其可跨平台的构造/路由/队列用例及自动 SSL mock。Linux 原生 root/systemd/FTP fixture、Windows 实际证书查询/导入，以及 macOS 真实签名安装、Keychain 导入和 FTP 会话仍需对应系统验收。没有将交叉编译或 mock 记录为真机验收。
