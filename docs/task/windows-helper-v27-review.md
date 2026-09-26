我把你上传的执行结果、审查报告，以及当前 GitHub `feature/plugin-system-mvp` 分支头 `69db0aa` 上相关代码都对了一遍。重点看了 `AppHelper.ts`、`Application.ts`、renderer helper controller、WindowsElevationMethod、`WindowsHelperInstaller.ts`、PowerShell 安装脚本、Go 启动诊断、打包 hook 和相关测试。

结论是：**这份审查报告整体是靠谱的，核心机制判断也基本正确；但我不建议简单按照“全部只是 minor，可以直接合入”处理。** 审查报告本身也明确说 6 个领域没有 blocker/major。:chatgpt-content-reference{index="0"} 不过结合当前分支代码，我认为有几项属于“成本很低、而且直接影响状态正确性/诊断能力”，最好就在这次 Windows helper 改造里处理掉。

### 8 个优先建议逐项判断

| 项目 | 我的判断 | 是否建议本次处理 |
|---|---|---|
| 1. 成功回调失败被当成安装失败 | **完全正确，而且比报告描述更值得重视** | **必须处理** |
| 2. 只读 key / instance.json 行为回退 | **正确，但当前行为并不一定更差** | **不必改逻辑，补文档+测试** |
| 3. Go 脱敏正则误伤错误信息 | **正确** | **建议处理** |
| 4. 确认框取消越权清理 pending | **正确** | **建议处理** |
| 5. 未知错误被健康检查重试 10/30 秒 | **正确** | **建议处理** |
| 6. Global mutex 被其他用户预创建 DoS | **风险判断基本正确，但论证和修复建议不完全准确** | **记录边界即可，暂不复杂化** |
| 7. 提权子进程连不上结果管道时诊断丢失 | **正确** | **建议处理** |
| 8. 300 秒超时还显示“请稍候” | **正确** | **建议处理** |

其中我最看重的是 **#1**。

当前 `AppHelper.install()` 的逻辑实际上是：

`helper 最终健康检查通过` → `_onSuduExecSuccess()` → `checkSuccess`

但这三步仍然处于同一个大的 `try/catch`。

而 `_onSuduExecSuccess()` 在 `Application.ts` 里做的是：

`restoreWindowsElevationMethodAfterHelperReady()` + `serverManager.initServerDir()`。

所以只要后面的数据目录初始化、配置保存等代码抛异常，即使 **helper 已经真实健康并且安装完全成功**，代码仍然会进入：

`installFaild` → `Application.handleHelperStatusMessage()` → runtime elevation method 被改成 `uac`。

审查报告对此判断完全成立。:chatgpt-content-reference{index="1"} 而且现在还可能出现一种比较别扭的状态：配置已经被 `restoreWindowsElevationMethodAfterHelperReady()` 写回 `helper`，但 runtime 又因为后续异常变成 `uac`。

这违背了你这轮设计里“最终健康检查才认定 helper 可用”的边界。执行结果文档本身也明确写了成功条件以及“成功回调异常应与初始 helper 不健康分开处理”。:chatgpt-content-reference{index="2"}

我建议把生命周期明确切成：

`安装/恢复 → helper health OK → helper 成功终态`

之后再执行 data directory 等 post-ready 工作。后处理失败可以单独报告，但**绝对不要再发 `installFaild`，也不要因此把 helper runtime 降级成 UAC**。

---

### #2 我反而不建议为了“恢复旧行为”去改

报告说 v26 的 `Remove-Item -Force + Move` 可以处理 readonly，而现在统一使用 `File.Replace`，readonly 目标可能失败。这个事实是成立的。:chatgpt-content-reference{index="3"}

但我认为：

**现在失败并保留原始文件，比为了处理 readonly 强制删旧文件再 Move 更符合这次“健壮性优先”的设计。**

因为这轮非常重要的一个改进就是 staged + atomic replace。执行结果也明确说明这是“逐文件原子替换”，并且不承诺多文件事务。:chatgpt-content-reference{index="4"}

为了一个相对少见的 readonly 情况重新引入：

`删除旧文件 → Move 新文件`

反而是在削弱原子性。

所以我的建议不是改生产逻辑，而是：

**补一个 readonly key / instance.json 测试，并在文档的 Known limitation / VM validation 里明确写出来。**

如果将来实际用户真的遇到杀软把文件长期标记 readonly，再针对这个场景设计“验证安全后临时清除 readonly attribute”的恢复策略，而不是现在为了理论兼容性破坏发布模型。

---

### #3、#4、#5 都值得顺手修掉

#3 的 Go 正则现在是：

`key\s*[=:]`

而 helper 启动代码确实会记录类似：

`failed to load helper key: %v`

这样 `helper key:` 会被当作敏感字段标签，导致后面的错误首词被 `[redacted]`。审查对此描述准确。:chatgpt-content-reference{index="5"}

这轮专门增加 `startup.log` 就是为了排查“任务起来马上退出”，:chatgpt-content-reference{index="6"} 所以为了脱敏而破坏诊断内容有点得不偿失。

我建议只把真正的赋值形式视作 secret，例如：

`key=xxxx`

而不是把自然语言里的：

`helper key: access denied`

也当作 key value。并增加一个专门的 regression test。

#4 也完全成立。现在 `repair()` 的 `finally` 已经是 `installResultPending` 的真正 owner，但 `showNeedInstallDialog().catch()` 仍然直接：

```ts
this.installResultPending = false
```

如果确认框打开期间另一路径启动 `repair()`，取消这个旧确认框就可能把进行中的状态抹掉。报告指出它违反 controller ownership 模型是对的。:chatgpt-content-reference{index="7"}

这个甚至都不值得犹豫：**删掉这一行即可**。没有安装进行时它本来就是 false；有安装进行时更不应该由 confirmation dialog 修改。

#5 也一样。现在 `waitForHelperHealth()` 只有在错误是 `AppHelperError` 且不是 unreachable 时才立即失败；反过来说，**普通 `Error` / `TypeError` 会被当作暂态错误重试**。

实际应该是：

```ts
if (!isAppHelperError(error)) {
  throw error
}

if (
  error.code !== 'helper_pipe_unreachable' &&
  error.code !== 'helper_unreachable'
) {
  throw error
}
```

也就是只有明确知道是“helper 暂时不可达”的错误才 retry。否则代码 bug 等 30 秒再抛，只会增加排障难度。报告 #5 是正确的。:chatgpt-content-reference{index="8"}

---

### #6 Mutex 风险存在，但不用为了它过度设计

这里我和审查报告有一点技术细节上的不同。

报告认为另一个普通本地用户可以抢先创建：

`Global\FlyEnv.Helper.Install.<instance-id>`

这个**风险本身确实存在**。但是报告提到的 `SeCreateGlobalPrivilege` 理由不准确：微软文档明确说明，这个权限要求针对的是 Global namespace 中的 **file mapping / symbolic link** 创建，并不是普通 mutex；普通客户端进程本身就可以使用 `Global\` mutex。:chatgpt-content-reference{index="9"}

而且如果恶意用户先创建同名 mutex 并给一个拒绝访问的 DACL，那么之后即便调用 `OpenExisting`，也仍然可能得到 `UnauthorizedAccessException`。:chatgpt-content-reference{index="10"}

所以报告提出的：

> OpenExisting + 校验 SD

可以改善识别和诊断，但**并不能真正消除预创建 DoS**。

对 FlyEnv 来说，这个攻击需要：

同一台 Windows 机器上存在另一个主动恶意的本地账户，并且其目标只是让 FlyEnv helper 安装失败。

它不能获得 SYSTEM、不能替换 helper、不能绕过 ACL，本质就是 **local DoS**。当前 helper 的 ACL、SID namespace、指纹检查都不会因此被绕过。

所以我建议：**文档记录这个边界即可，不要为了 minor local DoS 再引入一套更复杂的锁机制。**

以后如果 FlyEnv 真正面向大量学校机房/多租户 Windows 主机场景，再考虑把锁建立在受保护 ProgramData 对象/其他安全 namespace 上。

---

### #7 和 #8 建议修，因为非常符合这轮目标

#7 的代码非常明确：

```powershell
$pipe = New-Object ...
$pipe.Connect(10000)

$writer = ...
...
try {
   # install script
}
```

`Connect()` 在真正的 result-handling `try/finally` 之前。

如果这里被安全软件/pipe policy 阻断，提权进程直接退出；外层 `Start-Process` 又没有拿子进程 stderr，最终用户大概率只得到笼统的：

`elevation_launch_failed`

报告对此判断正确。:chatgpt-content-reference{index="11"}

而这轮改造的重要目标之一就是“失败时保留可以定位原因的诊断”。:chatgpt-content-reference{index="12"} 所以值得补。

不一定需要设计非常复杂的备用 IPC。简单让 child 对“结果管道连接失败”使用一个**明确的特殊 exit code**，launcher 再把它转换为 JSON diagnostics，就已经足够。

#8 更简单。目前 renderer 300 秒 watchdog 超时以后：

```ts
{
  reason: 'elevation_status_timeout',
  msg: I18nT('menu.waitHelper')
}
```

也就是已经等了 5 分钟，再告诉用户“帮助程序正在启动，请稍候”。报告说语义错位完全正确。:chatgpt-content-reference{index="13"}

直接增加一个专门的 timeout 文案即可。

---

## 我额外发现一个审查报告没有充分强调的问题

**当前分支存在一个明显已经过期的测试：`scripts/windows-elevation-method-test.ts`。**

当前真正的生产代码 `WindowsElevationMethod/index.vue` 已经正确改成：

```ts
HelperStore.repair()
```

不再自己发送 `APP-FlyEnv-Helper-Install`，也不再调用：

```ts
HelperStore.beginInstall()
HelperStore.completeInstall()
```

这正符合执行结果文档声称的 controller ownership。:chatgpt-content-reference{index="14"}

但是 `windows-elevation-method-test.ts` 现在仍然反过来要求组件必须存在：

```ts
APP-FlyEnv-Helper-Install
HelperStore.beginInstall()
HelperStore.completeInstall()
```

甚至还断言 helper store 里存在旧的 `app.getWindowsHelperBinaryPath()` 路径。

**也就是说这个 test 按当前分支代码运行应该直接失败。**

为什么审查报告说“18 项相关 TypeScript 回归全部通过”？因为列出的 18 项专项测试里根本没有这个旧的 `windows-elevation-method-test.ts`。执行结果列出的测试范围也是专项集合，并非仓库里所有 Windows elevation 测试。:chatgpt-content-reference{index="15"}

这个我反而建议作为**合入前必修项**：

更新 `windows-elevation-method-test.ts`，让它断言：

`WindowsElevationMethod → HelperStore.repair()`

并明确断言组件中**不存在**直接 helper install IPC 和 begin/complete ownership。

然后就可以把 `HelperStore.beginInstall()` / `completeInstall()` 这两个真正的死代码删掉。

---

## 测试覆盖方面，审核意见也基本准确

报告指出安装脚本测试只检查 error 32、没有守 33，只检查“stage < stop”而没有完整检查：

`stage → stop → publish → register → start`

以及 mutex、task settings、key 32 bytes 等很多只是“代码字符串存在”，没有真正守行为。:chatgpt-content-reference{index="16"}

这些判断我和实际测试代码对过，都是对的。

不过我不会要求把报告列的**所有**测试缺口都在这次补完。最值得补的是：callback failure 不产生 `installFaild`、unknown health error 立即失败、confirm cancellation 不修改运行中 pending、Go `helper key:` 不被错误脱敏、retry 32/33/最大 5 次、完整 stage 顺序、关键 Task Scheduler settings，以及上面那个已经过期的 elevation-method test。

---

## 还有一个发版级问题：macOS / Linux v27

这一点审查报告提醒得非常重要。:chatgpt-content-reference{index="17"}

现在：

```ts
HelperVersion = 27
```

是跨平台共享的，而 `AppHelperCheck` 在 macOS/Linux 上一样会先调用 helper `version` 并要求等于 27。

所以如果发布新的 FlyEnv 主程序，但 macOS/Linux 包进去的 helper 还是 v26，**不是“功能少一个版本号”这么简单，而是健康检查会直接判 `helper_version_mismatch`。**

执行结果文档自己也明确承认目前只重建了 Windows helper，并没有声称构建过 macOS/Linux v27。:chatgpt-content-reference{index="18"}

因此如果这个分支接下来会打全平台 release，我认为这项优先级很高：

**所有平台 helper 都重新构建 v27，同时给 `afterPack` / CI 增加“helper 版本必须与 TS `HelperVersion` 一致”的发布护栏。**

现在的 `helper-version-sync-test.ts` 只验证 **Go 源码里的 27 == TypeScript 源码里的 27**，并没有验证 `dist/flyenv-helper-*` 二进制实际上就是 v27。

---

### 最终我建议怎么处理

如果这是我来决定，我会把这次剩余工作控制得很小，不继续扩大 Windows helper 改造范围。

**合入前处理：#1、#3、#4、#5、#7、#8，修掉过期的 `windows-elevation-method-test.ts`，顺带补对应的小型 regression tests。#2 保持现在的 atomic replace 行为，只补 readonly 边界说明和 VM 测试；#6 记录 local DoS threat boundary，不重新设计 mutex。然后如果准备发布 macOS/Linux，必须重新构建 v27 helper，并最好增加 artifact/version 发布检查。**

这样处理完，我会更认同审查报告里的那句话——**“实现质量高，可以合入”**。现在的代码核心架构确实已经比较稳，尤其是 per-SID、先暂存后停止、原子发布、恢复停止任务、late-result channel 和 startup diagnostics 这些关键设计没有发现需要推翻的地方；剩下主要是几个状态边界和诊断细节。:chatgpt-content-reference{index="19"}
