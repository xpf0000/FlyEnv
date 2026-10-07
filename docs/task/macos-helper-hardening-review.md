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

方案 §13 明确未做的真机系统验收（新签名发行包首次安装/升级、Keychain 真实信任、root launchd FTP 全流程、Intel 真机与受支持旧系统版本、旧 MacPorts MySQL/MariaDB 初始化）仍然成立，本次代码审查不能豁免。此处原先关于 `/private/etc` 为 777 时拒绝 Hosts 操作的结论，已按用户要求由第 9 节替代。

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

## 7 启动钥匙串访问与未签名安装反馈（2026-10-06）

实机日志确认未签名 production 应用在 root staging 的 codesign 校验失败，未执行安装脚本；旧 UI 随后自动打开 XTerm 重放同一安装命令，将真实原因覆盖成终端退出码。此次修复继续要求正式签名，不增加未签名生产安装降级。

- 插件密钥仍由 PluginManager 管理；Application 传入延迟获取的加解密器，仅创建新密钥或解密既有密文时访问 safeStorage。空扫描、既有明文记录不访问钥匙串；既有加密插件启动验证仍需要解密，未签名构建仍可能触发系统授权。解密失败保留插件验证失败，不降级密文或跳过校验。
- AppHelper 仍独占图形/终端安装 flight；固定 bootstrap 的签名、资源路径和协议校验输出结构化错误标记。main 统一保留原 stderr，并将详情随失败回复及状态广播传递；debug 记录错误码、原始 stderr 和异常堆栈。
- macOS 的签名、资源/ACL、协议拒绝直接显示真实失败详情，不自动打开终端重放；取消授权保持静默，其他安装失败保留原终端入口。33 种语言的通用安装失败文案不再统一承诺终端重试。
- 签名/协议校验和密钥解密都是必要依赖，失败阻断安装/插件激活；UI 通知与日志仍为附加动作，不能改变安装结果。未新增 renderer 操作状态、共享持久化或 Pinia store。

验证：11 个关联回归脚本通过（插件、固定安装脚本、错误 IPC/UI、安装互斥与 PTY、健康、Windows 兼容、hosts 后续同步及 renderer 边界）；main/fork 构建、ESLint、Prettier、JSON 解析及 diff 检查通过。全量 vue-tsc 与既有诊断一致，无新增。未执行真实 root 安装，也未修改钥匙串授权。

## 8. 签名发行包安装后的目录访问回归

本次日志在发布后报告 `helper_key_invalid` / `EACCES`，GUI 安装与终端安装都未通过客户端健康检查。实际 `/Library/Application Support/FlyEnv/Helper` 为 root 所有、0700、无目录 ACL。安装脚本的 `umask 077` 会将 Go `MkdirAll(..., 0755)` 的新目录收紧为 0700，已有目录重装时也不会改变权限；仅给 client.key 设置指定 UID 读取 ACL 不足以让桌面用户穿过父目录。这是本次安装权限衔接的实现遗漏，与应用签名无关。

修复契约与边界：

- main AppHelper 继续持有整个安装操作，直到实际退出与客户端健康检查完成；GUI 同模式共用安装请求，GUI/终端互斥，发布输出只是中间事件，健康失败仍是失败终态。没有增加模块状态、Pinia、共享配置或另一条安装流程。
- 安装器在 Go 验证 root 保护的政策目录及全部祖先、写入授权资产之后，发布 binary/plist 之前，显式恢复 FlyEnv 与 Helper 两级安装目录为 0755。目录权限是客户端可用性的必要依赖，失败则不继续发布/启动；已写入的授权资产不宣称回滚。key 仍为 root 0600 加指定 UID 读取 ACL，root 私有 staging 不变；不自动修改系统 Hosts 目录。
- 按用户要求，帮助程序安装统一调用 shared Sudo.ts。删除 AppHelper 内部 macOS 授权分支，安全的 literal AppleScript 授权实现集中到 Sudo.ts，移除旧可被桌面账户替换的 root 命令脚本。保留 cwd/env 的字面转义、取消分类及原始 stderr；不给不使用图标的调用传入空 icns。底层系统授权仍使用 osascript，调用统一到 Sudo.ts 不等同于恢复旧 applet 的系统弹窗名称。
- 本轮排查时，当前主机 `/private/etc` 为 root 0777，曾是另一个独立的 Hosts 前置失败。随后用户明确要求目录权限不应阻止 Hosts 编辑，相关处理以第 9 节为准；没有修改主机目录权限。

验证：安装器权限回归先在 0700 重装场景失败，修复后通过；另覆盖首次安装的真实 umask 077 目录创建，确认目录修复保留 key 的 0600 及单个 UID 读取 ACL。授权回归通过真实 Sudo.ts 与 AppHelper，系统提权边界替换为普通用户 AppleScript，验证命令、特殊字符 cwd/env、取消及原始错误；发布命令退出成功但读取 key 被拒绝时，失败终态保留 EACCES 且无成功通知，不打开密码弹窗。10 项安装/IPC/终端/健康/Hosts/renderer/Windows 兼容回归、main 构建、ESLint、格式、shell 语法及 diff 检查通过。未执行真机 root 重装，已安装的应用及系统目录权限不会随源代码修复自动改变。

## 9. macOS Hosts 不限制用户配置的父目录权限

用户明确要求：`/private/etc` 的目录权限由用户配置，不能作为阻止系统 Hosts 读取和编辑的条件。

执行契约：只调整 Go macOS 固定 Hosts store 的目录保护策略，读取、全文替换、托管站点同步和清理统一复用此 store，不再核验 `/private/etc` 及祖先的所有者、POSIX mode 或目录 ACL。不新增 UI 状态、控制器、配置、重试或提权流程，现有互斥及 IPC 生命周期保持原样；没有新模块约束例外。Linux 的 Hosts 目录策略保持原样。

文件操作仍是必要结果：保留固定 `/private/etc/hosts` 路径、拒绝 symlink/hardlink/异常文件类型、大小限制、文件不可修改标志、摘要冲突及已打开文件身份校验；实际读取、写入和属性保留失败继续如实传播，DNS 刷新仍是附加动作。不自动修改系统目录权限。

Go 发布版本与应用检查同步升到 43，签名应用的 Info.plist 标记及固定 bootstrap 门控同步，避免仍执行旧目录限制的 v42 Helper 被当作已更新。bootstrap 直接复用共享版本常量，版本一致性测试继续覆盖 Go、应用检查和签名发布标记。

回归在普通用户临时目录中使用 macOS production store 的策略，先复现 0777 下读取被拒绝，再验证读取、全文编辑、站点同步及清理可完成，其他 Hosts 内容和用户指定的目录权限保留。系统 Hosts 和系统目录未被测试修改。

验证：原生 Go 全量测试（`go test -count=1 ./...`）、帮助程序版本同步、macOS 固定安装脚本与健康检查通过；main/fork 构建、ESLint、格式及 diff 检查通过。macOS Intel/ARM、Linux amd64/ARM 和 Windows amd64/ARM 的 v43 产物均已重新构建，未执行 root 系统安装。

既有失败：`hosts-idempotent-write-test.ts` 仍通过源码正则要求 Host 调用旧 `writeFileByRoot(this.hostsFile, result.content)`，而当前 Unix 分支已走 `syncUnixHosts`，该断言失败。本次未改此测试、Host/index.ts 或 SystemHostsBlock.ts，相关文件与 HEAD 一致；实际无变化、摘要冲突及文件元数据行为由 Go 运行时测试覆盖，本轮未扩展修复此旧断言。

## 10. 用户管理的权限不设额外门槛（Linux 与 macOS）

用户进一步明确 Linux 也适用：用户可自行配置、FlyEnv 无法管理的系统目录与工作目录，不应因为所有者、POSIX mode 或 ACL 不符合 FlyEnv 预设而阻止操作。第 9 节保留 Linux 旧策略的决定由本节替代。

实施边界：Unix Hosts store 删除父目录保护选项与重复检查，两端使用同一文件操作策略；帮助程序自身的 protectedDirectory 只检查给定的 FlyEnv 管理目录，不递归检查系统祖先。固定系统工具由实际执行返回结果，不再校验其所在目录或可写位；系统 Keychain、Linux CA 目标目录同样不套用帮助程序资产的权限要求。Linux 安装只校验 FlyEnv 自身资源/目录，停止校验和改写系统安装父目录；macOS bootstrap 不校验系统 staging 祖先的权限。

数据根保留绝对路径、目录存在及参数校验，取消其必须归桌面 UID 所有的要求。文件读取的类型/大小/链接边界与 FlyEnv 自身资产的权限校验在 unix_policy.go 集中复用；普通 CA 目标快照不经过资产权限策略。

操作归属保持原样：main 持有安装全生命周期，Helper 持有固定文件操作和子进程；不新增状态、配置、控制器或重试。读取、写入、签名验证、必要执行和帮助程序自身授权资产仍是必要依赖，失败保持真实结果；DNS 等附加操作不否定已完成 Hosts 写入。固定文件格式、摘要/身份、输入角色与参数边界继续保留，不重新开放通用 root RPC。

验证：共享 Hosts 和系统工具用例先复现权限门槛失败，修复后通过；本机 `test:helper` 契约/Go/vet、原生 Go 全包、Linux/macOS 安装流程、健康/失败/终端/版本回归、main/fork 构建与 ESLint 通过。Linux 交叉编译测试及 vet 通过；root fixture 补充管理目录只查自身、CA 目标 0777、工具可写和 root 所有的数据根场景。当前 macOS 无运行中的 Linux VM，未执行 Linux 原生/root fixture，也未操作系统 Hosts/CA 或真正安装 Helper；Linux 运行验证仍待专用环境执行。

本轮继续使用尚未发布的 v43，更新后的 macOS/Linux/Windows 两种架构产物均重建。旧 Hosts 源码断言测试的问题仍按第 9 节记录，本轮未扩展修复。

## 11. 恢复原有 Sudo.ts macOS 实现

用户明确要求“调用 Sudo.ts”，没有授权重写其 macOS 部分。第 8 节将 literal AppleScript 授权迁入 Sudo.ts 的处理超出了该要求，已撤回；原 applet 的临时命令文件机制不是此次安装失败的已证实原因。

Sudo.ts 完整恢复到本轮修改前的版本；AppHelper 继续通过 lazySudo 调用其 exec，不添加独立授权分支，并恢复原有 FlyEnv 名称和图标参数。仅在安装调用方兼容已有取消文案，以及从旧 applet 的 Error.message 中识别固定安装脚本错误标记，保留真实失败原因与完整 debug 堆栈。签名快照、Helper 目录 0755 修复及用户管理目录权限策略不受此回退影响。

操作仍由 main AppHelper 持有，授权/安装/健康检查是必要依赖，成功发布并不等于安装成功；取消保持取消终态，失败不得覆盖为成功。不新增状态、控制器、重试或共享配置。回归通过真实原有 Sudo.ts 的 applet 解包、名称/图标和命令/结果文件路径，仅替换真正打开系统授权弹窗的边界，以普通用户执行临时测试命令；验证取消、原始安装标记及发布后 key 不可读的失败终态。未执行 root 安装或系统授权。

## 12. 三端提权取消错误集中维护

用户进一步授权统一取消错误类型。此前 Linux 有 LinuxSudoCancelledError，macOS 返回普通 Error 的固定取消文案，Windows 则使用 WindowsSudoError 的 elevation_uac_cancelled。现将错误类、Windows 取消分类及共用取消文案集中到 src/shared/SudoError.ts，三端取消均返回 SudoCancelledError；Linux/macOS 保留 elevation_cancelled，Windows 保留 elevation_uac_cancelled。Windows 启动失败、状态超时和执行失败继续各自分类。Sudo.ts 保留原导出入口，AppHelper 直接引用错误定义，不再判断 macOS 文本。

本节是用户明确授权的错误类型调整，仅替换 macOS 原取消分支抛出的类型，不重写 applet、认证、名称/图标、命令执行或临时文件流程。安装 owner、互斥和成功健康检查契约保持原样；取消终态不报成功、不开启另一轮认证，真实执行失败继续传播。无新状态、配置或模块例外。

Windows/macOS 取消类型断言先在旧实现失败，统一后通过；Linux 完整安装流程通过，包含“认证取消”和“已提权程序返回 126”的区分。原 applet 安装回归保留真实临时文件与普通用户命令执行，系统授权边界替换，无 root 系统安装。

## 13. CA 与 Helper 安装、健康检查解耦

按用户确认，CA 仍由 Helper 的固定接口导入，仅解除安装耦合。对照 hardening 前的 Host/SSL.ts 与 Go HostManager，复用原有 sslFindCertificate/sslAddTrustedCert 契约以及既有生成、队列、签发和错误处理流程；没有增加 SSL 控制器或 Sudo 授权路径。

main 安装准备、bootstrap、两端安装脚本和 Go policy 不再读取/批准/保存 CA 指纹或公有证书；macOS health 不再验证 CA。旧安装界面的指纹与“新 CA 重新安装 Helper”文案一并移除。Unix 固定 dispatcher 实现旧接口名，独立查询固定名称 FlyEnv-Root-CA，只导入策略数据根 server/CA/FlyEnv-Root-CA.crt；单张公有 CA 与固定名称校验、私有临时快照集中在 unix_ca.go，两端只实现各自系统查询与导入。用户目录、文件权限及路径别名不作为权限门槛，实际读取、写入和工具错误仍传播。

Linux 检查系统生成的信任 bundle，避免更新失败后仅存在 anchor 文件就误报已安装；导入失败不缓存成功，重试会再次执行信任更新。macOS 按系统 Keychain 中的固定名称判断，无指纹或额外 verify-cert 判定。CA 失败仅影响依赖它的自动 SSL 签发，保留已生成的 CA，不影响安装/健康/hosts；Windows 原行为保留。

本次改变安装 policy 参数和 Unix RPC，协议同步升到 44，保证旧 Helper 被要求更新。旧 v43 权限修复记录仍是历史记录；本节实施时产物采用 v44，后续更新见第14节。

验证：安装不读取 CA 的回归先复现失败，移除耦合后通过；自动 SSL 运行时回归覆盖生成保留、固定名称查询、导入失败/重试、查询失败/恢复及 debug 原因，两端共享证书输入测试覆盖同名不同证书、其他名称、非 CA/私钥/多证书拒绝、用户目录 0777/别名与私有快照。test:helper 契约/本机 Go/vet、Linux/macOS 安装/健康/终端/失败/版本回归、main/fork 打包编译、相关 ESLint、shell 语法和 diff 检查通过；Linux 测试交叉编译及 vet 通过。六种平台/架构 Helper 产物已重建。没有实际导入系统 CA、重装 root Helper 或修改系统 hosts；Linux 原生信任更新重试用例及真机 Keychain/系统信任验收待运行环境验证。

## 14. Unix 兼容 review 全部问题与 Windows CA

按用户授权完成 [Unix 兼容边界复查](unix-helper-compatibility-review.md) 剩余全部问题：集中保留普通账户真实附加组、支持数据根别名、普通 fork 读取 FTP 固定输入、取消 Linux 应用源 UID/mode/链接门槛及 macOS 无消费者的全局别名检查、两端共用普通账户 pure-pw 数据库生成。固定 root 业务和自身授权资产保护不变，必要失败仅影响其业务，FTP 生成失败保留旧数据库。

Windows 自动 SSL 仍走原队列与既有权限路由，仅恢复系统 CA 按名称查询，取消查询时本地证书/指纹/路径预检。FTP 快照 RPC 改动使最终协议升为 v45，六种 Helper 产物重建；完整实现、通过检查和未运行的真机验收范围见上述文档末尾。不改通用 ProcessSend.ts、renderer util/Host.ts 或 Sudo.ts 的 macOS applet。
