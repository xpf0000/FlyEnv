# Windows helper 跨用户 UAC 与 per-SID 实例改造记录

日期：2026-09-15。对应 `docs/task/task.md`、`task1.md`、`task2.md` 和 Issue #852。

> 后续更新（2026-09-26）：本文保留 v26 改造时的历史记录；其中“不另加系统级安装锁”、Windows helper 安装沿用旧 Sudo TEMP 流程等描述已被后续实现取代。当前版本为 v27，增加了 per-SID 系统互斥锁、独立内联 PowerShell 提权、暂存发布、停止任务恢复和启动诊断。完整改动、原因与验证边界见 [Windows helper v27 安装健壮性修复说明](windows-helper-resilience-v27.md)。主程序与备份的指纹选择策略仍不改变。

## 根因

FlyEnv 已经能在 UAC 前取得启动 FlyEnv 的目标用户 SID，但旧架构仍把 helper 运行身份、客户端身份、任务、密钥和命名管道混在一套机器级资源中。标准用户用另一管理员凭据批准 UAC 后，任务可能绑定错误的账户；改成 SYSTEM 后，如果 helper 又拿 SYSTEM SID 校验普通用户客户端，请求仍会失败。单一任务和管道也会让同一台机器上的不同 Windows 用户互相覆盖。

## 最终方案

Windows helper 按 UAC 前捕获的完整 SID 建立独立实例。实例 ID 为规范化大写 SID 的 SHA-256 前 32 个小写十六进制字符。TypeScript、PowerShell 和 Go 使用同一算法并有固定向量测试。

每个 SID 的资源为：

```text
%ProgramData%\FlyEnv\Helper\users\<instance-id>\
  bin\flyenv-helper.exe
  helper.key
  allowed-roots
  instance.json

Scheduled Task: \FlyEnv\Helper\<instance-id>
Named Pipe:     \\.\pipe\FlyEnv.Helper.<instance-id>
```

任务以 `S-1-5-18`（SYSTEM）、ServiceAccount、Highest 运行，登录触发器绑定目标 SID。任务参数只包含 `--instance-id` 和 `--expected-user-sid`。Go helper 要求两个参数同时存在，重新从 SID 推导实例 ID 和 ProgramData 路径，并拒绝不匹配的实例 ID。

主进程检查当前 SID 自己的任务、固定程序路径、程序 SHA-256、key、管道、协议版本及 health 返回的 SID/instance ID。任一项不一致时，进入现有 `AppHelper` 安装修复流程。不同 SID 的任务、进程、文件、key、策略和管道不会被读取、停止或替换。

同一 SID 只保留一个固定 helper 程序。当前运行的 FlyEnv 若发现协议或程序指纹不匹配，会停止该 SID 的任务并原子替换程序，然后重建和启动任务。不会保留旧版本目录，也不会回退旧 helper；同一 SID 下另一个 FlyEnv 版本随后启动时，可以按自己的版本再次替换。并发安装依赖 FlyEnv 的单例启动和现有 `AppHelper` single-flight，不另加系统级安装锁。

程序来源继续采用项目已有的 packaged source、backup、pending、installed SHA-256 对比，不增加新的发布者或签名来源校验。

## 安装、ACL 与迁移

提权安装脚本会重新计算实例 ID、ProgramData 路径、任务路径和管道名，拒绝调用方传入的跨 SID 或非规范路径。共享任务目录允许普通用户遍历和读取；每个实例目录由 SYSTEM/Administrators 控制，目标 SID 只有读取与执行权限。key 为随机 32 字节，只允许 SYSTEM/Administrators 控制和目标 SID 读取。

helper 程序先复制到同目录随机 `.pending` 文件，校验 SHA-256 后原子替换固定路径。allowed-roots 和 `instance.json` 也写入当前实例目录。安装器只通过 Task Scheduler API 停止、等待、注册和启动当前 `<instance-id>` 任务，不再按进程名或路径通配终止 helper。

根目录旧任务 `\FlyEnvHelperTask` 和 `\flyenv-helper` 不足以可靠证明属于哪个目标 SID，因此保留不动。新 FlyEnv 只检查和修复当前 SID 的新任务，旧任务不会阻止新实例安装，也不会导致覆盖其他用户资源。旧用户 profile 中的 key 同样不自动删除。

## 运行时安全边界

- Windows named pipe DACL 只允许 SYSTEM 和目标 SID；每个请求取得真实 peer SID，必须等于任务参数中的目标 SID。
- HMAC、时间戳/nonce、防重放、客户端 PID/可执行文件绑定及 RPC/path allowlist 保持有效。
- Go 只从推导出的 per-SID 路径读取 key 和 allowed-roots，并检查 key 长度、owner、受保护 DACL 和目标用户只读权限。
- helper 安装目录及其祖先不能通过普通 RPC 加入可写根或被修改权限。
- 数据目录权限恢复和 `FlyEnvStartup` 使用 UAC 前捕获的目标 SID；PowerShell profile 路径由 Electron `app.getPath('documents')` 提供，不做目标 SID 或祖先目录 Owner 校验。
- macOS、Linux 以及现有 Sudo TEMP 通信流程不变。

## PowerShell Profile 路径策略（2026-09-16）

PowerShell profile 的 Documents 根路径以主进程调用 Electron `app.getPath('documents')` 的结果为准，再拼接固定的 `WindowsPowerShell\Microsoft.PowerShell_profile.ps1` 或 `PowerShell\Profile.ps1`。Go Helper 与 UAC fallback 只保留绝对路径、固定目录/文件名和 reparse-point 校验，不检查 profile 文件或任一祖先目录的 ACL Owner。

这是明确的产品策略，不应重新增加“祖先 Owner 必须等于目标用户 SID”的限制。Windows 重定向、备份恢复、域策略和管理员预建目录都可能由 SYSTEM 或 Administrators 持有，但仍是当前用户的合法 Documents 路径；Owner 不等价于路径来源或实际写权限。

## 主要改动

- `src/shared/WindowsHelperIdentity.ts`：SID 实例算法、路径、安装配置和当前任务读取。
- `src/shared/AppHelperCheck.ts`、`src/fork/Helper.ts`：按当前 SID 读取 key、连接管道并校验 task/fingerprint/health。
- `src/main/core/AppHelper.ts`：把完整实例配置和协议版本交给现有安装生命周期。
- `static/sh/Windows/flyenv-auto-start-now.ps1`：创建受保护的 per-SID 文件、任务和元数据，只操作当前实例。
- `src/helper-go/main.go`、`src/helper-go/utils/*`：协议 26、实例参数、派生路径、per-SID 管道与 ACL 校验；v26 同时发布不再检查 PowerShell profile 祖先 Owner 的行为。
- `src/helper-go/module/tool.go`、`src/shared/WindowsHelperFallback.ts`：恢复目录和应用开机启动使用目标 SID；shell integration 信任 Electron 提供的 Documents 路径且不检查 profile 祖先 Owner。
- `scripts/windows-helper-*.ts`、`scripts/windows-helper-task-behavior-test.ps1`：实例隔离、安装契约、任务差异、错误处理和兼容回归测试。

没有新增 renderer/Pinia/config.setup 状态。主进程 `AppHelper` 单例拥有安装与修复生命周期，Task Scheduler 拥有 SYSTEM helper 进程生命周期，fork 模块继续发起已认证 RPC。

## 自动验证结果

以下检查已通过：

- SID 实例 ID 的 TypeScript/Go 固定向量与路径测试。
- `test:windows-helper-install`、`test:windows-helper-cross-user`、PowerShell 语法解析及任务行为测试。
- `windows-helper-check-test.ts`、`windows-helper-fallback-plan-test.ts`、`test:windows-app-helper-init`。
- `test:windows-helper-install-ipc`、`test:windows-after-sign-helper`、`test:windows-signing`。
- `test:flyenv-shell-integration`、`test:helper:contract`、helper 协议版本同步。
- `go test ./utils ./module -count=1`、`go vet ./...`；管理员模式的 Go 全量测试此前通过。
- 所有本次修改 TypeScript 文件的定向 ESLint、`git diff --check`。
- 2026-09-16 协议 26 Windows helper 重新编译成功，输出 3,469,312 字节的 `flyenv-helper-windows-amd64-v1.exe`，SHA-256 为 `77E2363F937F2B4B7B72F9AB3552AB15C4CA377297974170370DD5FBFD56493C`。
- 2026-09-15 协议 25 的 `yarn build:win` 曾成功生成未签名的 `release/FlyEnv-Setup-4.18.3.exe`；协议 26 改动本次只重新生成 Helper 二进制，完整安装包留给下一次正式构建。

`yarn tsc --noEmit --pretty false` 仍报告 9 个仓库既有错误，位于 `configs/electron-builder.linux.ts`、DNS、Image、Podman 和 BrewFormula；本次修改文件没有新增类型错误。

## 双账户 Windows 人工验收

真实 UAC 凭据切换和两个交互式登录会话仍需在有两个账户的 Windows VM 上完成。对 Alice 和 Bob 分别在普通 PowerShell 中取得实例信息：

```powershell
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value.ToUpperInvariant()
$bytes = [Text.Encoding]::UTF8.GetBytes($sid)
$hash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
$instanceId = $hash.Substring(0, 32)
$instanceRoot = Join-Path $env:ProgramData "FlyEnv\Helper\users\$instanceId"
$sid
$instanceId
$instanceRoot
```

验收步骤：

1. Alice 登录并启动新构建，在 UAC 中输入另一管理员凭据。确认安装成功，并能执行一次需要 helper 的操作。
2. 用 Task Scheduler COM 或管理员 PowerShell确认 `\FlyEnv\Helper\<alice-id>` 为 SYSTEM/ServiceAccount/Highest，trigger SID 为 Alice，action 指向 Alice 实例目录，参数中的 instance ID/SID 精确匹配。
3. 保持 Alice 会话和 FlyEnv 运行，切换到 Bob 登录并重复安装。确认生成不同的 `<bob-id>` 目录、任务和管道，Alice 的任务、程序 hash、key 修改时间均未变化。
4. 在两个会话分别执行 hosts 或服务操作，确认各自连接自己的 pipe，两个 helper 进程可同时存在，且交叉 pipe 请求被拒绝。
5. 分别退出和重启 FlyEnv，再注销/登录 Alice 与 Bob，确认各自登录触发器启动自己的任务，另一管理员无需登录桌面。
6. 在 Alice 上运行一个携带不同 helper 协议/指纹的 FlyEnv 构建，确认只替换 Alice 的固定程序并重建 Alice 任务；Bob 实例不变。随后切回原 FlyEnv，确认 Alice 实例按当前版本再次替换，不发生旧目录回退。
7. 从旧版本留下根目录 `FlyEnvHelperTask` 后运行新构建，确认新 per-SID 实例正常安装，旧任务不被自动删除，也不会阻塞新 helper。
8. 重复同账户管理员批准、不同本地管理员批准、域用户/域管理员、含空格路径、Unicode 用户路径和取消 UAC 后重试。

## 剩余限制

- 当前开发机没有可自动使用的第二套普通用户与管理员凭据，因此尚未完成上述真人双会话验证；正式发布前应在 Windows VM 执行。
- 根目录旧 helper 任务和旧 profile key 会保留，避免无法确认归属时误删其他用户资源。它们可由管理员在确认无进程依赖后人工清理。
