# macOS 帮助程序权限收敛 — 独立审查记录

日期：2026-10-06。

审查对象：`fix/macos-helper-hardening` 工作区未提交改动（66 个修改文件 + 新增 Go/TS/测试文件），依据 [批准方案](macos-helper-hardening-plan.md) 与 [实施计划](macos-helper-hardening-implementation.md)。

审查方式：六个独立并行审查（Go 策略/分发/peer 身份、Go hosts/CA/DNS/PID、Go FTP 生命周期、可信安装链路、fork 客户端迁移、main/renderer 迁移），各自重跑对应测试并核实关键声明；两个 major 发现由主审查复核源码确认属实。本文档只记录代码审查结论，不构成方案第 13 节所列真机系统验收。

## 1 总体结论

实现与批准方案高度一致，核心安全目标真实达成：

- Darwin 固定 dispatcher 是封闭允许列表；21 个旧通用 action（runScript、通用文件读写/base64、rm/chmod/ln_s、任意 kill/killPorts、模块修复、旧 CA 接口等）即使 HMAC 签名正确也被拒绝，并有 `TestDarwinFixedBoundary` 钉住。
- peer UID 来自内核 `LOCAL_PEERCRED`、PID 来自 `LOCAL_PEERPID`，与签名声明强绑定；伪造 `ClientPid` 有端到端测试拒绝。
- policy/key/socket 全链路 fail-closed：启动时一次性加载、native ACL 精确比对（非仅 POSIX mode）、pinned-fd `O_NOFOLLOW` 逐组件打开无 TOCTOU、无 `/tmp` socket/role 回退；`/private/var/run` root:daemon 775 兼容检查限定精确路径+gid+mode。无 cgo 构建明确失败。
- hosts 事务：摘要冲突在 flock+互斥下检查、no-change 不写不刷新、同目录安全临时文件原子发布、owner/mode/ACL/xattr/flags 保留且错误如实传播、symlink/hardlink/异常类型拒绝、`/private/etc` 别名锚定。
- 失败边界正确：DNS 刷新失败只报告自身、不拒绝/回滚/重放已完成的 hosts 写入；PID 目录修复固定路径、无递归 chown/rm；CA 只能用安装批准指纹、安装后核实信任、生成/未信任/已信任状态区分。
- FTP 固定 launchd job：label/命令/环境/账户全部服务端固定，虚拟账户强制映射安装 UID/GID；启动前持久化意图、启动后记录精确 PID+出生时间并复核；停止核实受管进程真实退出，出生时间不可读时保留 state 并报 unknown（此前独立审查发现的问题已有失败路径测试钉住）。
- 安装链路：桌面可写脚本/plist/binary 的 sudo 流程已移除；固定 bootstrap 把发布快照复制到 root 私有 staging，真实校验签名与 sealed resources、Info.plist `FlyEnvHelperProtocolVersion=42` 门控；先核实旧 Helper 真实停止再替换授权资产；production 失败不降级 dev；health 为成功条件。
- 密码保存/广播/注入在 macOS 已完整移除（磁盘、内存、renderer 三处清理）；后台任意 sudo 在 Unix 全部拒绝；MacPorts 换源 controller 符合模块归属契约（模块本地类 + reactiveBind，无 Pinia/config.setup）。
- Linux 侧重构为纯搬迁或收紧（新增 nlink==1 检查），无行为回退；版本 42 在 Go/TS/plist 标记/contract 四处一致。
- 审查中重跑：`go build/vet/test -race ./...`（src/helper-go）、Linux/Windows 交叉编译、`macos-helper-installer-test.ts`、`macos-helper-health-test.ts`、`helper-version-sync-test.ts`、`helper-contract-check.ts`、`unix-hosts-dns-test.ts`、`unix-process-ordinary-test.ts`、`macos-certificate-trust-test.ts`、`macports-source-terminal-test.ts`，全部通过。

## 2 Major 发现（建议合并前修复）

### M1 macOS sudo 模式自定义服务/语言项目在终端启动时静默丢失提权

render 层把 Unix 的 `isSudo` 启动路由到终端（`src/render/core/ModuleCustomer.ts:282`、`src/render/components/LanguageProjects/ProjectItem.ts:274`），但 fork 的 macOS 终端分支没有像 Linux 那样拼 `sudo`：

- Linux 分支：`if (version.isSudo) command = \`sudo -- /bin/bash -lc '...'\``（`src/fork/module/ModuleCustomer/index.ts:147`）。
- macOS 分支（`src/fork/module/ModuleCustomer/index.ts:85-110`、`src/fork/module/LanguageProject/index.ts:156-186`）直接把裸命令塞进 AppleScript。

原先 macOS isSudo 走后台 `execPromiseSudo`，现在变成在终端里以普通权限运行且无任何提示——对现存所有 sudo 模式自定义服务/语言项目是静默功能回归。方案本意是"显式终端 sudo 保留、由系统认证"。

修复建议：两个 macOS 终端分支在 `isSudo` 时按 Linux 同款 quoting 拼 `sudo -- /bin/zsh -lc '...'`；终端内系统认证即满足边界，不涉及保存密码。

### M2 终端→GUI 并行安装未被拒绝（违反方案 §9 生命周期契约）

`src/main/core/IPCHandler.ts:824` 只在 `AppHelper.state !== 'normal'` 时拒绝发放终端命令（GUI→终端方向已挡住），但反向无防护：终端安装流程（`src/render/components/FlyEnvHelper/setup.ts` 的 controller）从不设置 main 侧 `AppHelper.state`，`HelperStore.repair()` / `AppHelper.initHelper()`（`src/main/core/AppHelper.ts:419`）不知道终端安装正在 sudo 中途。此时 GUI 发起 repair 会并发跑第二个 bootstrap：两边各自重新生成 `client.key`，第二个 `launchctl bootstrap` 撞第一个已加载的 job，报出错误的 `installFaild`。

不是信任边界突破（两边内容相同、各发布步骤原子），但违反已批准的"拒绝图形/终端并行修改资产"契约，且终态报错不实。

修复建议：终端安装期间在 main 侧置"manual install in progress"标记（或让终端完成经由 GUI 可检查的状态），`initHelper()` 检查并拒绝。

## 3 Minor 发现

### Go helper

- `src/helper-go/main.go:1327`：响应超 2 MiB 上限时替换的错误响应丢了 `Key`，客户端无法关联 pending 请求，会挂到自身超时。补回 `Key: info.Key`。
- `src/helper-go/darwin_other.go:18`：非 darwin stub 的 `dispatchDarwin` 返回 `(nil, nil)` 假成功；当前不可达（`main.go:820` 有 GOOS 门控），但应 fail-closed 返回错误。
- `src/helper-go/main.go:655` 与 `darwin.go:84-117`：连接 deadline 30s，而 `host.dnsRefresh` 两个工具最坏 40s、`host.installApprovedCA` 最坏 40s，会把"慢"变成意外的 unknown 结果。对齐超时或按 RPC 放宽 deadline。
- `src/helper-go/darwin.go:111`：注释说 "SSL trust policy"，实际 `verify-cert -p basic -l -L`。行为对（自签 CA 的 trustRoot 可被 basic 区分），注释错，易误导后人把代码"改错"。修注释。
- `src/helper-go/unix_hosts.go:151`、`unix_policy.go:131-151`：rename 后未 fsync 所在目录，崩溃可丢目录项（持久性而非安全问题；macOS 目录 fsync 本身是 best-effort，需注明）。
- `src/helper-go/darwin_hosts.go:70` + `unix_hosts.go:124`：`Fchflags` 在 rename 前把源文件 flags 复制到临时文件；若 hosts 带 `UF_IMMUTABLE`/`SF_IMMUTABLE`，rename 与临时文件清理都会失败并留下残骸（fail-safe 方向）。可考虑 rename 后再应用 immutable 位。
- `src/helper-go/unix_policy.go:85-92`：`protectedFile` 用 `io.LimitReader(f, size+1)` 但不像 `policyInstallInputs` 那样检查溢出；fstat 前置检查使其不可达，一致性补一行即可。
- `src/helper-go/darwin_policy.go:143-193`：`validateDarwinHealth` 不校验 `approved-ca.crt` 存档，篡改/删除要到 `installApprovedCA` 运行时才暴露（fail-safe，但纳入 health 更符合"health 校验受保护资产"的意图）。
- `src/helper-go/main.go:611-628`：socket listen 后到 chown/chmod 之间有短暂窗口，若 helper 以 umask 0 运行则短暂全局可连；后续有内核 UID 检查+HMAC 兜底，深度防御项，可启动时 `syscall.Umask(022)`。
- `src/helper-go/main.go:38-45,233-270,401-425,668-700`：旧 `/tmp/flyenv.role`、`/usr/local/share/FlyEnv` 相关死代码仍编进 darwin 二进制（不可达），升级后旧资产也不清理。可用构建标签隔离或后续清理。
- 测试缺口：16 连接上限、30s deadline、16384 nonce 上限、1 MiB 请求上限、`/private/var/run` 兼容特例负例、`syncManagedEntries` 的 RPC 级摘要冲突、托管块嵌套/重复 marker 拒绝、rename 前最后一刻外部修改拒绝、`preserveHostsAttributes` 失败中断发布。均为 fail-safe 路径，建议补 fixture。

### 安装链路

- 本地未签名打包构建（`configs/electron-builder.mac.local.ts`，`identity: null`）在 production 模式下永远无法安装 helper——行为正确（不降级），但应在文档写明，避免日后误当缺陷。
- `src/main/core/AppHelper.ts:401-404`：macOS 的 `{ name, icns }` lazySudo 选项被系统 AppleScript 对话框静默忽略，纯外观；可删掉无用的 icns 计算。
- bootstrap 中 `[ -z "$(/bin/ls -lde "$parent" | sed -n '2,$p')" ]` 把 `ls` 失败当作"无 ACL"（root 下固定系统目录实际不可达，POSIX 管道 depth 项）；可先捕获再判断。
- `static/sh/macOS/flyenv-helper-init.sh:25`：`ROLE` 的 case 校验接受 `1:2:3`，下游 Go `policyInstallInputs` 已拒绝，深度防御项。
- `launchctl bootout/bootstrap/print` 现在无条件使用（旧 OS_VERSION<13 分支已删）；verbs 自 10.10 存在，下限 macOS 12，无问题，但 macOS 12 真机行为保留在系统验收清单。

### FTP

- `src/helper-go/darwin_ftp.go:259`：bootstrap 失败的报错未像后续失败路径那样提示"intent 已保留、可能需要 stop 清理"。仅措辞。
- `darwin_ftp.go:262`：bootstrap 后单次读 PID，launchd 尚未填 pid 时保守失败（fail-closed，不会产生假成功）；可加短重试减少负载系统上的误失败。
- `darwin_ftp.go:179-184`：refreshUsers 失败时 root `users.passwd` 比 `users.pdb` 新（pdb 仅成功时原子替换，pure-ftpd 只读 pdb，认证数据无错），外观不一致。
- PID 复用主 PID 会硬失败"需管理员恢复"：故意设计，但一个真死且 PID 被回收的 FTP 会卡住 stop 直到手工清理，运维注意事项。
- 测试缺口：外国 job 占用受管 label 拒绝、启动后 2 秒内死亡分支、refreshUsers 传播 pure-pw 失败、大小写变体危险 key 拒绝（已核实 pure-ftpd 配置解析大小写不敏感，当前精确大小写 allowlist 是安全方向）、shipped 模板 `static/tmpl/{macOS,Linux}/pure-ftpd.conf` 与 `ftpConfig` allowlist 的漂移锁定。
- 既有不对称（非本次引入）：Linux pure-pw mkdb 以 root 运行，macOS 降权到安装 UID；后续可对齐。

### 客户端（fork/main/renderer）

- `src/main/core/AppNodeFn.ts:692-696`、`src/fork/Fn.ts:287-291`、`src/main/utils/index.ts:127-131`：通用文件 IPC 写 hosts 走 facade 但不带摘要，队列内取新摘要，对并发外部编辑无冲突保护。当前无 renderer 调用方走此路径（真实编辑器有摘要保护），潜在隐患；建议 unix 上非 facade 的 hosts 写直接拒绝或强制摘要。
- `src/shared/child-process.ts:48-51`：`execPromiseSudo` 已成死代码且 guard 反了（拒绝全部非 Windows，但函数体本来只支持 Unix）；所有 darwin 调用点已被前置拒绝。建议删除函数及 `src/fork/Fn.ts:124` 的再导出。
- `src/fork/module/PureFtpd/index.ts:65-105`：Windows 分支下残留死的 AppleScript/`sudo -S` 块；且 FTP 的 `openInTerminal` 选项在 macOS 被静默忽略（aside 在 `!isWindows` 时 early-return），显式终端 FTP 启动能力被移除而非保留。建议删死代码；若要保留终端 FTP 启动需显式接线。
- `src/main/core/NodePTY.ts:42-46,133-137`：macOS/Linux spawn 分支里留着 `isWindows()` 守卫的密码注入死代码（行为正确，但遮蔽保证）。建议删除。
- renderer 残留死代码：`src/render/components/Setup/RestPassword/index.vue`、`src/render/util/Brew.ts:11` 的 `showPassPrompt` 已无引用。
- `src/render/components/Setup/MacPortsSrc/Controller.ts:22-38`：`prepare()` 在 preview IPC 完成前清空 `outcomes`（失败的重新 prepare 会抹掉上一次 apply 的逐项结果）；30s 超时会孤儿化 fork 已创建的 preview 目录；`prepare()` 不 dispose 旧 xterm 的 IPC 监听器。
- `src/fork/module/Host/UnixHosts.ts:8-9`：队列是 per-process 的——fork（站点同步）与 main（编辑器/退出清理）各持一个 `pendingEdit`，跨进程竞争实际靠 helper 摘要冲突兜底（失败如实，可接受），与方案"共享单资源队列"的表述有出入，建议在方案文档如实记录。
- `finishUnixHostsEditing` 无超时，helper 请求挂起会拖住退出 hosts 分支（退出方 catch 错误但不防挂起）；renderer hosts 保存请求无超时（沿用旧 LinuxHosts 模式）。
- `src/fork/Helper.ts:60-80`：FN 类型联合仍列 darwin 已关闭的 RPC 名（运行时关闭完整，类型清理项）。
- 既有 Windows 假成功吞错（`Tool/index.ts:119-131`、`Tool/path.ts:118-123`）非本次引入，Unix 已改为如实传播，Windows 平价后续跟进。
- 测试缺口：`unix-hosts-dns-test.ts` 未钉 replace/sync 背靠背队列串行与摘要冲突上抛；`unix-process-ordinary-test.ts` 未钉 lsof 不可读的所有权传播。

## 4 与文档声明的一致性核对

方案 §13 声称的验收与代码实际相符：有效签名拒绝旧 RPC、伪造 PID 拒绝、可写策略/密钥/ACL 拒绝、hosts 事务矩阵、FTP 未知身份保留 state 等均有真实测试钉住；合约双向校验与版本同步通过；签名验证、TOCTOU 快照、停旧服务顺序、dev/production 不降级有自包含 fixture 覆盖。

方案 §13 明确未做的真机系统验收（新签名发行包首次安装/升级、Keychain 真实信任、root launchd FTP 全流程、Intel 真机与受支持旧系统版本、旧 MacPorts MySQL/MariaDB 初始化）仍然成立，本次代码审查不能豁免。当前主机 `/private/etc` 为 777 的已知问题也不受影响——新代码会拒绝该目录。

## 5 处置建议

1. 合并前修复 M1（macOS 终端 sudo 包装）与 M2（终端/GUI 安装互斥）。
2. minor 中优先：`main.go:1327` 的 `Key` 丢失、30s/40s 超时失配（影响真实用户体验）；通用 IPC 写 hosts 无摘要保护（潜在扩权面）。
3. 方案文档补两处如实记录：per-process 队列靠摘要兜底的实际语义；本地未签名包无 helper 安装路径。
4. 其余 minor（死代码清理、注释修正、测试补齐）可跟进小提交，不阻断本分支。

## 6 复核与修复记录（2026-10-06）

用户已授权处理；保留上述独立审查原文，以下记录实际处置及必要澄清。

- **M1 已修复**：自定义服务和语言项目使用一个 `MacTerminal.ts` 入口；sudo 模式在可见终端内显式运行 `/usr/bin/sudo -- /bin/zsh -lc`，统一文件、工作目录、环境和 AppleScript 转义。普通模式不增加 sudo；启动失败传播，临时文件清理为附加动作。
- **M2 已修复**：图形/终端安装共用 AppHelper 的实际安装 flight。新终端 IPC 由 main 准备固定命令，NodePTY 等真实退出，AppHelper 再验证健康。页面卸载不释放 flight；反向/重复终端安装拒绝，重复 GUI 安装共享原请求。失败完整记录 debug，成功后的 hosts 同步不否定安装结果。内部安装直接向 PTY 发送转义后的系统 shell 命令，不经过可写的外层临时脚本。
- **响应与超时已修复**：超大响应保留 Key。原客户端实际上会在连接结束后立即报 invalid/unknown，并非等待自身超时。Darwin 固定服务端请求预算 120 秒、客户端 125 秒，覆盖单次 FTP 多步执行（固定工具上限加启动检查约 92 秒）；锁竞争仍可能耗尽预算，结果未知不得自动重放。Linux/Windows 客户端原预算保持 30 秒，Linux 服务端保持 30 秒。
- **hosts 已修复**：全文替换必须带读取时的摘要；三处通用 Unix 文件写入统一拒绝已规范化的系统 hosts 路径，专用编辑器和托管块同步继续使用 facade。进程内队列串行，跨进程由 helper 摘要/互斥检测冲突；DNS debug 异步记录，日志挂起不阻塞完成的写入。退出队列缺少独立总体期限，但底层 RPC 已有有限超时，不能直接认定永久挂起。
- **hosts flags 已修复**：immutable/append-only 文件在创建临时文件前拒绝，并在属性复制前复核。未采用“发布后设置 immutable”建议：那会在属性设置失败时留下已发布的新内容，破坏当前失败边界。
- **Go 细节已修复**：受保护文件读取后再次检查大小；非 Darwin dispatcher 返回拒绝；有批准 CA 时 health 同样校验证书存档，复用严格 CA/指纹解析；basic 信任注释修正；socket 创建使用 077 umask 后恢复；FTP bootstrap 失败报告保留的管理意图。
- **安装预检已修复**：ACL 查询失败直接拒绝，UID:GID 只允许两个数字字段；移除 macOS 无效图标路径计算。
- **MacPorts 已修复**：fork 只返回预览内容，controller 收到成功响应后创建用户快照，超时/迟到结果不会产生孤儿目录。准备失败保留旧预览和逐项结果；新快照完整写好后再清理旧终端和结果；部分应用仍保留完成/失败/未知状态。
- **无用代码已清理**：移除 Unix PTY 密码注入死分支、PureFtpd 的旧 AppleScript/后台 sudo 启动、FTP aside 废弃密码注册、未引用的 RestPassword 与 showPassPrompt。共享 `execPromiseSudo` 和密码 IPC 仍有 Windows 自定义服务调用，本轮未把它们误判为完全无引用。
- **文档已澄清**：hosts 队列为 per-process；未签名 production 包无帮助程序安装降级路径。FTP 采用用户已批准的固定 Helper 生命周期，未恢复旧终端 FTP 路径。

未扩展：rename 后目录 fsync、旧无引用 root 资产清理、额外 FTP 自动重试、passwd/PDB 双文件事务、所有资源上限/nonce 测试矩阵及既有 Windows 授权问题。目录 fsync 属于发布后的持久性增强，其失败不得反过来否定已发布文件。真机系统验收仍按方案第 13 节执行。

本轮验证：23 个相关 TS 回归脚本全部通过（安装/终端、macOS 信任、MacPorts、hosts、Linux 链路、Windows Helper 和 renderer/fork 边界）；Go `test -race -count=1 ./...` 与 `vet ./...` 通过。Darwin amd64/arm64、Linux amd64/arm64、Windows amd64 产物重新构建；main/fork 与 renderer 生产构建通过。修改文件 ESLint、Prettier 和 diff 检查通过。完整 vue-tsc 仍有 65 条既有错误，与此前诊断集合一致，无新增。

额外检查 `windows-privilege-edge-test.ts` 失败：fixture 未提供 `@lang/index.I18nT`，在未修改的 `ModuleInstalledItem.start()` 抛 TypeError；该测试与模块均未在本轮修改，作为基线问题记录。Go race 保留既有 LC_DYSYMTAB 链接警告。上述检查不替代新签名发行包安装、Keychain、root FTP 与旧 macOS/MacPorts 的系统验收。
