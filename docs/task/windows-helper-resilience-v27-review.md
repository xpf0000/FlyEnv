# Windows 帮助程序 v27：修复审查报告

日期：2026-09-26。审查对象：[v27 修复说明](windows-helper-resilience-v27.md) 描述的全部未提交改动（working tree 相对 HEAD，68 个文件，约 +1896/-410 行）。

本文只记录审查结论，未改动任何生产代码。

## 总体结论

**实现质量高，可以合入。** 六个审查领域（PowerShell 安装脚本、提权传输、主进程、renderer controller、Go helper、打包/版本同步）均未发现阻断级（blocker）或严重级（major）问题。文档声称的修复要点经逐条对照代码并实际运行测试验证，基本属实。下文按优先级列出跟进项，全部属于 minor 及以下。

## 审查方式

- 六个领域并行独立审查 + 关键发现人工复核（逐条核实 file:line 证据）。
- 实际运行的验证：
  - 18 项相关 TypeScript 回归（含 elevation 真实 PowerShell 子进程+命名管道、renderer controller、install IPC 契约等）全部通过。
  - `powershell -NoProfile -File scripts/windows-helper-task-behavior-test.ps1` 通过。
  - Go：`go test ./module ./utils` 通过（symlink 用例因权限 SKIP，与文档声明一致）；`go vet ./...` 在 windows/linux/darwin 三平台通过；windows/linux/darwin(amd64/arm64) 交叉编译通过。
  - `helper-version-sync-test.ts`（Go 27 ↔ TS 27）与 `windows-after-sign-helper-test.ts` 通过。
  - 实证探针：abandoned mutex 捕获后持锁与释放成立；`File.Replace` 遇只读目标安全失败（原文件与暂存均不丢）；去-UAC 的完整 launcher 引号链回传正常；Win32Exception(1223) 序列化形状符合解析预期。
  - 本轮改动文件 ESLint、`git diff --check`、`gofmt -l` 干净；`tsc --noEmit` 仅剩 10 个未修改文件的既有错误（与文档 §10 一致）。

## 一、建议优先处理（行为副作用或诊断盲区）

1. **成功回调失败会被误报为"安装失败"，并连带把运行时提权方式降级为 uac。**
   `src/main/core/AppHelper.ts:346` 的 `_onSuduExecSuccess` 在 try 内，抛错进入统一 catch → `installFaild` → `src/main/Application.ts:658-665` 把 runtime 提权方式降为 uac。此时 helper 实际是健康的（`:344` 健康检查已通过），下次检查自愈，但用户会看到一次错误的失败弹窗。文档 §6 只写了"不进入第二次安装"，未写明该副作用。已人工核实代码路径属实。

2. **只读目标文件的行为回退（key / instance.json）。**
   v26 用 `Remove-Item -Force` + `Move`（可替换只读文件）；v27 统一走 `File.Replace`，diff 证实 `Remove-Item $keyPath/$instanceConfigPath -Force` 两行已删除（`static/sh/Windows/flyenv-auto-start-now.ps1`）。已有 key/config 若被杀软或企业策略置为只读，安装从"能修复"变为"明确报错"。失败是数据安全、可诊断的，属可接受权衡，但文档 §5.3 及虚拟机验证清单均未记录该边界。

3. **Go 脱敏正则误伤 key 错误的首词。**
   `src/helper-go/startup_diagnostics.go:18` 的正则允许 `key\s*[:=]`，`"failed to load helper key: <错误>"` 中 "helper key: " 本身命中，错误首词被 `[redacted]` 吞掉（实测确认）。方向安全（多脱不漏脱），但劣化了本轮最想保留的 key 失败证据。建议只匹配 `=`，或要求冒号后值不含空格。

4. **确认框取消分支越权清理 controller 状态。**
   `src/render/store/helper.ts:113-115` 的 `.catch` 里 `this.installResultPending = false` 是 v26 残留：该标志现由 `repair()` 的 `finally` 独占管理。确认框打开期间另一入口启动安装、用户再点取消，会把进行中的 pending 标志清掉（loading 消失、全局失败通知抑制失效）。触发概率低（模态遮挡），但违反文档 §3 自己声明的所有权模型，删除该行即可。

5. **`waitForHelperHealth` 把未知错误一律当暂态重试至超时。**
   `src/main/core/AppHelper.ts:63-72` 只识别两类暂态码；非 `AppHelperError` 的编程错误（如 TypeError）会空等满 10/30 秒预算才抛出。方向安全，仅延迟诊断；建议未知错误快速失败。

6. **`Global\` 互斥锁可被同机其他本地用户预创建造成 DoS。**
   `static/sh/Windows/flyenv-auto-start-now.ps1:405-412`。`SeCreateGlobalPrivilege` 默认授予 INTERACTIVE，实例 ID 可由目标 SID 公开推导，另一本地用户可抢先以拒绝 Administrators 的 SD 创建同名 mutex 阻断安装。仅 DoS 无提权（命名空间/ACL/reparse 检查仍兜底），但属本轮新增攻击面。建议记录为已知边界，或创建失败时 `OpenExisting` + 校验 SD。

7. **提权子进程连不上结果管道时诊断全丢。**
   `src/shared/WindowsHelperInstaller.ts:31-32` 的 `$pipe.Connect(10000)` 在 try 块外，连接失败直接未处理退出；`Start-Process` 不重定向子进程输出，管道又是唯一回传通道，用户只得笼统的 `elevation_launch_failed`，无法区分"管道被拦截"与安装本身失败。

8. **300 秒兜底超时的文案语义错位。**
   `src/render/store/helper.ts:41` 超时结果的 msg 复用 `menu.waitHelper`（"帮助程序正在启动，请稍候"），等待 300 秒超时后再显示"请稍候"作为错误详情，对用户有误导。建议给该分支明确的超时描述。

## 二、测试断言空洞（代码正确，测试/文档口径偏宽）

- `scripts/windows-helper-install-script-test.ts`：
  - 只断言 `-eq 32`，**漏 `-eq 33`**（文档 §5.2 声称识别 32/33，代码两者都有，测试没守住）。
  - 顺序断言只有"暂存 < 停止"，**缺"停止 < 发布 < 注册 < 启动"**——把发布挪到停止之前测试仍绿，而这正是本轮核心契约。
  - 互斥锁只断言名字；30 秒上限、abandoned 兼容、finally 释放、锁 ACL 均无断言。
  - 任务设置缺 `ExecutionTimeLimit='PT0S'`、`AllowDemandStart`、`MultipleInstances`、两个电池开关的断言（文档 §5.4 逐条声称）。
  - key 复用只断言函数存在与调用点，32 字节规则未断言；`/FRFX/` 裸正则未锚定到 SDDL 行。
- `scripts/windows-helper-task-behavior-test.ps1`：`Test-SecureHelperKey`（key 复用安全判定）完全未测；`Invoke-WithFileRetry` 5 次上限未断言（只测 3 次成功与永久错误 1 次）；`Get-OrCreateTaskFolder` 并发重读、带 BackupPath 的发布恢复未测。
- `scripts/windows-helper-elevation-test.ts`：真实 launcher 引号链（`Start-Process -ArgumentList` 嵌套转义）无回归，1223 取消路径是 mock stdout。审查期间用去-UAC 探针实证当前链路正确，但未来改动无防护；建议把去-UAC 全链路纳入该测试（非 Windows/提权环境跳过）。
- Go：`OpenWindowsHelperDiagnostics` 打开时超限即轮转的分支（`src/helper-go/utils/helper_diagnostics.go:52-60`）无测试覆盖。
- 文档 §9 对测试覆盖面的描述超出实际断言，建议修正口径或补断言。

## 三、低优先级清理项

- 死代码：renderer `beginInstall()`/`completeInstall()`（`src/render/store/helper.ts:23-29`）、主进程 `fallbackToUac()`（`src/main/core/AppHelper.ts:299-301`，既有问题）、`helper_unreachable` 错误码无抛出点（仅声明与消费）、`'installed'` 中间状态通知随共享 Promise 改造不再可达（`src/main/Application.ts:674` 的映射成死代码，"等待 helper"toast 消失）。
- `windowsDiagnostics` 默认实现用 `getWindowsHelperBinaryPath()` 而非恢复路径用的 `getWindowsHelperValidationBinaryPath()`（`AppHelper.ts:136-137`），当前只影响诊断中未展示的 `binaryMatches` 字段，口径不一致是隐患。
- stderr 中错误标记行重复出现（`WindowsHelperInstaller.ts:168` 前置 + diagnostic 内已有同一行）；nonce 注释 "never trust an unauthenticated result" 措辞偏强（实为防串扰，真实安全由安装后健康检查兜底）。
- `Get-OrCreateTaskFolder` 内层 catch 吞掉任何 CreateFolder 异常，真实权限错误被掩盖为"目录不存在"；另有一次重复 `GetFolder` 调用（ps1:331-337）。
- Go：`rotateLocked` 在 `Close` 失败时留下非 nil 已关闭 handle（`helper_diagnostics.go:100-104`）；`common_application_data_other.go:5-6` 注释已过时（HEAD 起 whitelist.go 就不引用它，本轮改了该文件未顺手修注释）；打开时轮转阈值用 `>` 而 Write 循环用 `>=`（行为等价，仅不一致）。
- 成功路径删除 allowFile 备份失败时遗留 GUID `.backup` 文件（ps1:610-613，位于受保护目录，仅垃圾残留）；`$mutexCreated`（ps1:406）捕获后从未使用。
- 各诊断截断（4,096 / 1,024 / 3,072 / 4,096 字节）可能劈开代理对或 UTF-8 多字节序列——不崩溃，仅边界出现 U+FFFD。
- 迟到失败通知无诊断：`GlobalIPCOn.ts:73` 的 `showInstallFailDialog(res?.reason)` 不带 stderr/msg，且伴随的 `menu.helperInstallFailTips` 是 mac/Linux 语义（既有行为，非本轮引入）。
- 安装脚本独立运行时 `[Console]::Error` 未设 UTF-8，本地化错误文本可能乱码；经提权链路时 stderr 走 StringWriter 不受影响。

## 四、跨平台提醒（发版前确认）

helper 版本常量是跨平台共享的：Windows 已重建 v27 二进制（`src/helper-go/dist/flyenv-helper-windows-amd64-v1.exe`，已验证为当日产物），但 **macOS/Linux 若用同一源码发布，旧 v26 helper 产物会过不了版本检查**；而 mac/Linux 的 `build/afterPack.ts` 没有像 Windows `afterSign.ts` 那样的缺失强校验。文档 §2 提到了该点，但没有任何构建期护栏，建议发版流程中加一道检查（例如把缺失即失败延伸到 afterPack，或在 CI 校验各平台 helper 版本）。

## 五、已重点验证无误的核心机制

- **互斥锁**：abandoned 兼容（子进程持锁被 Kill 后捕获实证，捕获时锁已持有、Release 成功）、30 秒上限、finally 中 Release/Dispose 且不覆盖原异常、锁仅 Administrators/SYSTEM 完全控制。
- **暂存/发布**：暂存→停止→发布→注册→启动顺序正确；`File.Replace` 第三参传 `NullString::Value`（真正的空备份路径）正确；只读目标失败时原文件与暂存均不丢（探针实证）；key 仅当 32 字节且 owner/ACL/无拒绝规则/无额外授权者时复用；exe 指纹相同也重新修复权限；不删除任务；`$originalError` 先于清理捕获；显式 `LASTEXITCODE` 是管道结果正确性的关键（已核实提权包装器在 finally 中读取它的时机）。
- **提权传输**：gzip/base64 编码链路两端严格对称；30,000 字符上限判断安全（不含资源泄漏）；1223 取消经 Win32Exception `NativeErrorCode` 序列化识别；128 KiB 按累计字节在解析前生效（chunked 送达无法绕过）；8000 字符字段上限含单条超长；late 结果通道 server/socket/timer 全部 unref、10 分钟保留、迟到结果只回收资源不改判。
- **主进程**：initHelper 共享 Promise 无重入竞态（检查-赋值同步完成，finally 先于外部 continuation）；恢复前 TS 侧全量校验 + PS 侧 Run 前再验（含指纹防 TOCTOU）；健康等待用绝对截止时间退避；非暂态错误立即失败；rejected Promise 缓存清除位置正确（`AppHelperCheck.ts:42-48`，清除先于任何调用方看到 rejection）；`-ne`/`-cne` 使用与文档 §6 末段一致，未被"误修"。
- **renderer**：重复 repair 只发一次 IPC；成功/失败/取消/同步发送失败/超时五条路径均终态化并清理；超时与真实结果竞态安全（单 resolve + 先到者清理）；诊断截断 1,024；取消不弹框；33 个 locale 仅改 `flyenvHelperInstallFailTips` 一个 key、JSON 全部合法、无插值占位符不匹配。
- **Go**：版本 27 两端一致；日志 256 KiB/单轮转/append 语义有真实文件测试；安全检查（目录链 reparse、owner 限定 SYSTEM/Administrators、`SE_DACL_PROTECTED` 强制、nil DACL 拒绝、ACL 遍历边界、handle 级 reparse+硬链接检查）实现正确且 fail-closed；脱敏覆盖全部 5 个写入点（均为固定格式串，除发现 3 的冒号误伤外无漏脱）；best-effort 双向正确（日志错误不成 fatal，四个 fatal 点未被日志吞掉）；污染 ProgramData 测试非空洞；四平台编译 + vet 通过。
- **打包**：afterSign 有平台守卫（mac/linux 不受影响）、throw 能中止构建；installer.nsh 移除干净（被引用的旧 `flyenv-helper-init.ps1` 本就不存在于仓库）；`helperProtocol` 由安装配置版本生成（ps1:543），无硬编码残留。

## 文档与代码不一致处汇总

1. §9 对结构测试覆盖面的描述超出实际断言（见本文第二节）。
2. §5.3/§10 未记录 key/instance.json 只读目标的行为变化边界（见发现 2）。
3. §6 未写明成功回调失败的副作用：以 `installFaild` 上报并把 runtime 提权方式降级 uac（见发现 1）。
4. §5.4 列举的 stage 划分中，allowed-roots 暂存实际归属 `validate-target` 段（ps1:486-497），报错 stage 定位与叙述略有出入。
5. §3/§8.3 称 "`code: 200` 是中间事件"，但当前主进程在安装 key 上从不发送 200（全局通知走另一通道），renderer 过滤属对未来流式扩展的防御，表述易误解为该事件现实存在。
6. §6 未提及 `'installed'` 中间状态通知随共享 Promise 改造消失（见第三节死代码项）。
7. §4.2 "应用退出也会关闭通道"：代码无显式退出钩子，实际语义是"unref 不阻止退出、进程退出时句柄随进程销毁"，效果等同、机制不同。

以上不一致均为文档口径问题，代码实现本身与文档的核心承诺相符。

## 处理状态（同日更新）

结合 [复审意见](windows-helper-v27-review.md)，第一、二节的问题已全部处理完毕，具体修改见 v27 修复说明文档新增的 §11"审查后跟进修复"：发现 1/3/4/5/7/8 已修复并各有回归测试；发现 2（只读目标）与发现 6（mutex 本地 DoS）按复审结论保留现有逻辑、已在文档中记录为边界（发现 6 的 `SeCreateGlobalPrivilege` 机制描述按复审纠正：创建 Global mutex 无需该特权）；过期测试 `windows-elevation-method-test.ts` 已更新为 controller 契约并连带删除死代码；第二节测试断言空洞已全部补齐；第四节跨平台事项中，`build.sh`/`build-os.sh` 的整包构建修正已解除 macOS/Linux helper 构建阻塞，三个发布 workflow 已加入版本同步校验步骤。复审指出的"实现质量高，可以合入"所需前提已满足。
