# docs/task/windows-helper-cross-user-result.md review意见

我看完这份修复记录了。整体评价是：**方向是对的，而且比我们最初设想的修复范围更完整，已经从“修 Issue #852”上升到了对 Windows Helper 身份模型的一次比较系统的重构。**

但我现在**不建议马上发正式安装包**。有 2 个 P0 级问题需要先确认，其中一个涉及 SYSTEM helper 的安全边界。

### 总体判断

Codex 对根因的二次修正是合理的：当前源码其实已经有 `WindowsHelperIdentity.getWindowsHelperIdentity()` 在提权前捕获身份，真正的问题并不是“整个当前代码都在提权后 GetCurrent”，而是后续任务注册、helper 运行身份和客户端身份仍然耦合。

它最终把模型拆成：

```text
FlyEnv.exe
target user
    ↓
authenticated named pipe

flyenv-helper.exe
SYSTEM
    ↓
privileged operations
```

同时：

```text
key path        -> target user
expected SID    -> target user
named pipe ACL  -> target user + SYSTEM
peer SID        -> 必须是 target user
helper runtime  -> SYSTEM
```

这个设计本身是正确的。尤其没有为了让 SYSTEM 工作而删除 `expected-user-sid` 或放宽 named pipe，这一点很好。

---

## P0-1：必须确认“被复制到 ProgramData 的 helper 二进制”信任来源

这是我最关注的一点。

现在设计是：

> 实际执行的是 `%ProgramData%\FlyEnv\helper\flyenv-helper.exe`，由随应用提供的 backup 复制过去，然后 SYSTEM 运行。

同时检查逻辑会比较：

> ProgramData helper 和随包 backup 的 SHA-256。

**这还不够。**

因为 FlyEnv 在 Windows 上历史上至少存在这种安装路径：

```text
C:\Users\<user>\AppData\Local\Programs\FlyEnv\
```

我们这个 Issue 用户最早的日志里就出现过这种路径。

这种情况下，普通用户很可能对：

```text
AppData\Local\Programs\FlyEnv\resources\helper\...
```

拥有写权限。

那么：

```text
backup == installed helper
```

只能证明：

> 两个文件一样。

不能证明：

> 这个文件是可信的 FlyEnv 官方 helper。

极端情况下：

```text
普通用户篡改 bundled helper
        ↓
触发 Helper Repair
        ↓
输入管理员凭据
        ↓
篡改后的 helper 被复制到 ProgramData
        ↓
SYSTEM Scheduled Task 执行
```

这就从功能 Bug 变成了**潜在本地提权边界问题**。

### 我建议必须检查

安装 PowerShell 在复制 helper 到 ProgramData 之前，至少要验证其中一种强信任：

```text
Authenticode signature
+ expected publisher/certificate

或者

编译时固定的可信 hash/manifest
```

而不是：

```text
ProgramData helper SHA256 == user-writable backup SHA256
```

后者不是信任链。

如果 `flyenv-helper.exe` 本身已经由 SignPath 签名，那最适合直接在 elevated installer 里面验证：

```powershell
Get-AuthenticodeSignature
```

而且不能只判断：

```text
Status == Valid
```

最好同时判断预期 publisher / signer。

**这个问题我会列为发布前必须确认。**

---

# P0-2：真正的 Issue #852 场景还没有做真人机测试

修复记录自己已经明确写了：

> 本会话没有真实的“普通用户 + 另一管理员账户凭据”环境；尚未完成跨账户桌面、SYSTEM 实际启动及注销登录验收。

而这恰恰就是 Issue #852 的核心场景。

自动测试再全，也不能完全替代：

```text
标准 Windows 用户登录桌面
+
FlyEnv 普通权限启动
+
UAC 输入另一个管理员账号
+
SYSTEM helper
+
目标用户 named pipe
+
注销/重新登录
```

尤其这里涉及：

* Windows Token
* Task Scheduler
* Named Pipe client impersonation
* Domain SID
* Logon trigger
* ACL

这些东西 mock 很难完全覆盖。

所以我建议：

**在正式发布之前，必须至少在一台 Windows VM 做一次真正的双账号测试。**

最简单：

```text
user1       普通用户
admin1      本地管理员
```

先不用域环境。

如果：

```text
user1 → UAC admin1
```

全部通过，再让 Issue #852 用户测试域环境。

---

# P1：单机仍然只有一个 Helper，未来会有多用户冲突

Codex 自己也明确承认：

> 保留机器级单一 helper task / pipe，多用户同时运行会相互触发身份修复。

这个问题现在不是 Issue #852 的 blocker，但值得记录一个单独 Issue。

比如 Windows 电脑上：

```text
Alice 登录
→ Helper target SID = Alice

Bob 登录
→ 检测 Alice helper 不匹配
→ 修复成 Bob

Alice 还在运行
→ helper health 又不匹配
```

就会出现互相“抢 Helper”的情况。

FlyEnv 如果以后继续拓展企业/教育团队场景，这其实迟早会遇到。

更完整的长期方案应该可能类似：

```text
FlyEnvHelperTask-{SID hash}
FlyEnvHelperPipe-{SID hash}
```

每个 Windows 用户一套身份隔离。

但这个可以作为后续架构优化，**不用把 Issue #852 修复无限扩大**。

---

# P1：Profile owner 检查可能对企业用户过严

这里我也会特别注意：

> PowerShell profile 必须有归属目标 SID 的目录祖先；支持目标用户拥有的 redirected Documents。

而剩余限制也承认：

> 企业重定向 Documents 如果没有目标用户拥有的目录祖先，会拒绝。

这恰好可能发生在：

* OneDrive Known Folder Move
* 企业 Documents Redirect
* 网络 Home Folder
* 公司统一 profile

而 Issue #852 本身就是企业设备。

所以人工测试的时候建议顺便检查：

```powershell
[Environment]::GetFolderPath('MyDocuments')
```

看看该用户是不是：

```text
C:\Users\rabdallah\Documents
```

如果是普通路径，现在不用担心。

如果已经被重定向到：

```text
OneDrive
网络路径
企业目录
```

就要特别验证 shell integration。

这个不一定要挡住 helper 发布，但需要验证。

---

## P1：SYSTEM Named Pipe 身份验证实现要重点人工 code review

记录里这一部分安全设计是好的：

> pipe 只授权 SYSTEM + target SID；真实 peer SID 必须等于 expected SID，另一管理员和 SYSTEM 客户端也不会放行。

我建议你自己或者让 Codex再专门 review 一遍：

```text
CreateWindowsNamedPipe
validatePeer
ImpersonateNamedPipeClient
OpenThreadToken
RevertToSelf
```

尤其确认：

**任何错误路径都一定执行 `RevertToSelf()`。**

Windows named pipe impersonation 如果异常路径没有恢复身份，是比较危险的。

测试现在已经覆盖目标 SID / SYSTEM / 其他管理员 / 空 SID。

测试层面很好，但这部分依然值得肉眼检查。

---

# 其他部分我认为做得很好

### 旧安装迁移

这一块处理得比较谨慎：

```text
task principal
action
key path
expected SID
trigger
binary hash
protocol
health SID
```

全部验证，不匹配才触发修复。

而且没有粗暴删除管理员 profile 里的旧 key。

这很对。

### 不再通配 kill helper

从：

```text
flyenv-helper*
```

收紧到已知 executable path。

这个属于很好的安全收敛。

### Key ACL

随机 32 bytes、关闭继承、target 只读、SYSTEM/Admin 控制、拒绝 hardlink/reparse，是比较完整的设计。

尤其：

```text
target user = Read
而不是 FullControl
```

这点很好。

### 不降低 helper authentication

保留：

```text
HMAC
timestamp
nonce
PID
executable binding
RPC allowlist
```

而且增加 real peer SID。

这是这次改动最值得肯定的地方之一。

### 自动测试覆盖度已经很高

现在已经有：

* cross-user identity
* install script
* old task mismatch
* repair
* fallback
* version sync
* shell integration
* Go peer SID
* key ACL
* profile owner

而且 Go test / vet / 管理员模式 helper test 都过了。

这已经不是“随便 patch 一下”的质量了。

---

# `tsc` 失败这件事我不认为是 blocker

记录说明：

```text
npx tsc --noEmit
```

有 9 个历史错误，而且不在本次修改文件中。

这种情况下只要：

* 修改文件 ESLint 通过
* 相关测试通过
* diff check 通过
* 能完成真实 production build

就可以接受。

但最后那个：

> 没有构建完整 Electron 安装包。

**这个在发布前必须补上。**

---

# 我建议接下来按这个顺序处理

1. **让 Codex确认 production helper 的信任链。**
   重点回答：如果 FlyEnv 安装在 `%LOCALAPPDATA%\Programs\FlyEnv`，普通用户修改了 bundled helper，elevated installer 如何发现并拒绝？

2. **完整构建 Windows production installer。**
   不只是单独 `go build`。

3. **检查最终安装包内 helper 是否正确为 protocol 24。**

4. **双账户 VM 实测：**

   ```text
   standard user + different local administrator
   ```

5. 测：

   ```text
   首次安装 helper
   hosts write
   restart FlyEnv
   logout/login
   startup
   shell integration
   UAC cancel → retry
   ```

6. **再给 Issue #852 用户一个测试安装包。**

---

### 我的结论

如果单纯评价这次 Codex 的实现记录：

**架构方向：很好。
根因覆盖：完整。
迁移设计：很好。
测试覆盖：很好。
目前发布成熟度：还差最后两步。**

真正让我认为需要停一下确认的是：

> **SYSTEM helper 从哪里获得可信二进制。**

因为一旦 task principal 从普通管理员上下文升级成 SYSTEM，**helper binary 的供应链/ACL 就变成安全边界的一部分**。

这个确认没问题，再把真实 cross-user Windows 测试跑通，我就觉得可以出测试安装包给 Issue 用户了。

------------------------------

用户：
1. %ProgramData%是每个用户的都不同吗？ FlyEnv的安装位置是确定的， 帮助程序原始文件是在FlyEnv安装位置文件夹下的。 能否直接使用帮助程序原始文件？而不是再复制到%ProgramData%下。
2. FlyEnv安装的时候，可以选择装到用户目录下，或者全局位置（需要管理员权限）。帮助程序注册的任务， 会影响其他用户吗？ 其他用户登录系统会不会启动帮助程序？

chatgpt：
先说结论：

1. **`%ProgramData%` 不是每个用户不同，而是整台机器共享的。**典型就是 `C:\ProgramData`。它对应 Windows 的 common application data，供所有用户共享。([Microsoft Learn][1])
2. **不建议无条件直接让 SYSTEM 任务执行 FlyEnv 安装目录里的原始 helper。**如果 FlyEnv 是装在用户目录下，这会产生明显的本地提权风险；复制到受保护的 `%ProgramData%\FlyEnv\helper` 反而是正确方向。
3. 当前修复方案里如果 `LogonTrigger.UserId` 绑定的是 FlyEnv 用户 SID，那么**其他用户登录不会触发这个 helper task**。微软文档明确说明：指定 UserId/SID 时，只在那个用户登录时触发；UserId 为空才是任意用户登录都触发。([Microsoft Learn][2])
4. 但是：**Task 本身是机器级的，不是用户私有的。**而且你当前仍是“全机器只有一个 Helper Task / Pipe”的设计，多用户同时使用 FlyEnv 会发生互相修复/抢占的问题。Codex 也已经把这一点列为剩余限制。

---

## 1. `%ProgramData%` 到底是不是每用户一个？

不是。

可以把 Windows 几个目录这样理解：

```text
C:\Users\A\AppData\Local    ← A 用户自己的
C:\Users\B\AppData\Local    ← B 用户自己的

C:\ProgramData              ← 整台电脑共享
C:\Program Files            ← 整台电脑共享
```

Microsoft 对 `CSIDL_COMMON_APPDATA` 的定义就是“包含所有用户应用程序数据的目录”，典型路径为 `C:\ProgramData`。([Microsoft Learn][1])

所以：

```text
%ProgramData%\FlyEnv\helper\flyenv-helper.exe
```

是**一份机器级 helper**。

不是：

```text
User A -> 一个 ProgramData
User B -> 另一个 ProgramData
```

这一点 Codex 当前设计其实是合理的。它现在也明确把实际 SYSTEM runtime 放到了 `%ProgramData%\FlyEnv\helper`。

---

# 2. 能不能直接运行 FlyEnv 安装目录里的原始 helper？

要区分你两种安装方式。

## 情况 A：FlyEnv 安装在 Program Files

例如：

```text
C:\Program Files\FlyEnv\
    resources\
        helper\
            flyenv-helper.exe
```

这种情况下，**从文件权限角度，理论上可以直接运行原始 helper**。

因为普通用户默认不能随意修改：

```text
C:\Program Files\FlyEnv
```

所以：

```text
Scheduled Task (SYSTEM)
    ↓
C:\Program Files\FlyEnv\resources\helper\flyenv-helper.exe
```

这个信任模型基本成立。

---

## 情况 B：FlyEnv 安装到当前用户目录

比如你之前日志里已经出现过：

```text
C:\Users\rabdallah\AppData\Local\Programs\FlyEnv\
```

这就完全不同了。

这个目录属于：

```text
rabdallah
```

普通用户通常可以修改里面的文件。

如果你的任务是：

```text
FlyEnvHelperTask
Principal = SYSTEM

Execute =
C:\Users\rabdallah\AppData\Local\Programs\FlyEnv\resources\helper\flyenv-helper.exe
```

就会出现一个严重问题：

```text
普通用户 rabdallah
        ↓
替换 flyenv-helper.exe
        ↓
等待/触发 FlyEnvHelperTask
        ↓
Windows Task Scheduler
        ↓
SYSTEM 执行被替换后的 exe
```

这实际上就是一条：

> **普通用户 → SYSTEM**

的潜在本地提权路径。

所以只要 FlyEnv 支持：

> Install for current user

那么就**绝对不能简单地让 SYSTEM task 永久执行用户可写安装目录中的 helper**。

---

# 所以复制到 ProgramData 其实是合理的

当前 Codex 的架构：

```text
FlyEnv 安装目录
resources/helper/flyenv-helper.exe
        │
        │ 安装/升级 helper 时
        ▼
%ProgramData%\FlyEnv\helper\
flyenv-helper.exe
        │
        │ ACL:
        │ SYSTEM/Admin = control
        │ user = read/execute
        ▼
SYSTEM Scheduled Task
```

这个思路我认为应该保留。

重点不是：

> `ProgramData` 这个名字安全。

而是必须确保：

```text
C:\ProgramData\FlyEnv\helper
```

ACL 真正做到：

```text
SYSTEM                 FullControl
Administrators         FullControl

普通 FlyEnv 用户       ReadAndExecute

普通用户               ❌不能写
普通用户               ❌不能删除
普通用户               ❌不能替换 exe
```

Codex 的修复记录里正是在往这个方向做。

---

# 我会修改我上一轮关于“backup 信任”的建议

你补充了一个重要背景：

> helper 原始文件在 FlyEnv 安装目录里，而且安装目录是确定的。

因此可以把情况进一步细化。

如果是：

### 全局安装

```text
C:\Program Files\FlyEnv
```

原文件本身就在受保护位置。

可以直接把它作为 trusted source。

### 用户安装

```text
%LOCALAPPDATA%\Programs\FlyEnv
```

原文件是用户可修改的。

就**不能把它天然认为是 trusted source**。

所以当前统一复制 ProgramData runtime 的设计还是比较干净。

我甚至更倾向于：

> **无论 FlyEnv 装在哪里，Helper runtime 都统一放 ProgramData。**

这样不用分：

```text
Program Files 安装 → 直接运行
LocalAppData 安装 → 复制运行
```

减少两套逻辑。

---

# 3. Helper Task 会不会影响其他 Windows 用户？

Task Scheduler 的任务是**机器级资源**。

也就是说：

```text
\FlyEnvHelperTask
```

不是：

```text
A 用户自己的 FlyEnvHelperTask
B 用户自己的 FlyEnvHelperTask
```

任务只有一份。

但：

> **任务存在于整台机器**
>
> 和
>
> **每个用户登录都会触发**

是两回事。

---

## 现在 Codex 的设计是正确绑定 target SID 的

修复记录里写的是：

> SYSTEM principal，Logon Trigger 绑定目标 SID。

比如：

```text
Principal:
SYSTEM

Trigger:
UserId = rabdallah-SID
```

这代表：

```text
rabdallah 登录
        ↓
启动 FlyEnvHelperTask
        ↓
SYSTEM helper
```

但是：

```text
Bob 登录
        ↓
不触发
```

Microsoft 文档对此非常明确：

* `LogonTrigger.UserId = username/SID` → 此用户登录时启动。
* `UserId = NULL` → 任意用户登录时启动。([Microsoft Learn][2])

所以 **只要 Codex 当前确实把 trigger UserId 设置成 target SID，其他用户登录不会启动这个 helper。**

---

# 4. 但是“单任务”仍然会影响其他 FlyEnv 用户

假设电脑有：

```text
Alice
Bob
```

两个人都使用 FlyEnv。

Alice 第一次安装 Helper：

```text
FlyEnvHelperTask

Principal = SYSTEM
Trigger = Alice SID
Key = Alice AppData
Expected SID = Alice
```

没问题。

然后 Bob 登录并使用 FlyEnv。

Bob 的 FlyEnv 会发现：

```text
当前 target SID = Bob

但 Helper Task:
target SID = Alice
```

按照 Codex 现在的修复策略：

```text
检测 mismatch
    ↓
认为 Helper 是旧的/错误的
    ↓
重建 FlyEnvHelperTask
    ↓
改成 Bob
```

于是：

```text
Alice helper
↓
Bob helper
```

下次 Alice 再用：

```text
Bob
↓
Alice
```

这就是修复记录里说的：

> “多用户同时运行会相互触发身份修复”。

---

# 5. 如果 FlyEnv 需要支持 Windows 多用户，我建议最终改成每用户一套 Task

这个比现在的单一：

```text
FlyEnvHelperTask
```

更合理。

例如：

```text
FlyEnvHelperTask-{SID hash}
```

假设：

```text
Alice SID = S-1-5-21-...-1001
Bob SID   = S-1-5-21-...-1002
```

机器上可以同时存在：

```text
FlyEnvHelperTask-a82f3c
FlyEnvHelperTask-f218ab
```

各自：

```text
Task A
Principal = SYSTEM
Trigger = Alice
ExpectedSID = Alice
KeyPath = Alice\AppData\Local\FlyEnv\...

Task B
Principal = SYSTEM
Trigger = Bob
ExpectedSID = Bob
KeyPath = Bob\AppData\Local\FlyEnv\...
```

这样：

```text
Alice 登录 → 只启动 Alice helper
Bob 登录   → 只启动 Bob helper
```

完全不会抢。

---

# 6. Named Pipe 也最好对应用户

如果走真正的 per-user helper，Pipe 最好也区分：

```text
\\.\pipe\FlyEnvHelper-{SID hash}
```

而不是全机器固定：

```text
\\.\pipe\FlyEnvHelper
```

否则两份 SYSTEM helper 会争夺同一个 pipe name。

Key 本身已经天然是 per-user：

```text
Alice:
C:\Users\Alice\AppData\Local\FlyEnv\flyenv-helper.key

Bob:
C:\Users\Bob\AppData\Local\FlyEnv\flyenv-helper.key
```

所以整体架构自然可以变成：

```text
                 Windows Machine
                       │
       ┌───────────────┴────────────────┐
       │                                │
    Alice                             Bob
       │                                │
FlyEnv.exe                         FlyEnv.exe
       │                                │
Alice key                          Bob key
       │                                │
Pipe-A                             Pipe-B
       │                                │
SYSTEM helper-A                    SYSTEM helper-B
       │                                │
Task-A                             Task-B
```

这是最完整的多用户设计。

---

# 不过我不建议这次 Issue #852 顺便做到这里

因为会明显扩大修改范围。

Issue #852 本质只是：

```text
targetUser != UAC admin
```

Codex 现在的 SYSTEM + target SID 方案已经解决它。

所以我建议分两步：

### 这次 v4.18.x 修复

保留：

```text
ProgramData runtime
SYSTEM task
target SID trigger
target SID authentication
```

先解决：

```text
普通用户 + 另一管理员凭据
```

### 后续单独 Issue

做：

> Windows multi-user helper isolation

升级到：

```text
Task per SID
Pipe per SID
Key per SID
```

---

## 最后回答你最核心的两个问题

**第一个：**

> 能不能不用 ProgramData，直接运行 FlyEnv 原始 helper？

**全局 Program Files 安装理论上可以；用户目录安装不应该。**

由于 FlyEnv 两种安装模式都支持，我建议**继续统一复制到 `%ProgramData%\FlyEnv\helper`，并严格控制 ACL**。这是更稳定、安全、统一的方案。

**第二个：**

> 一个用户注册的 Helper Task，其他用户登录会启动吗？

按照 Codex 当前设计：

```text
Principal = SYSTEM
Logon Trigger UserId = target user's SID
```

**不会。**只有绑定 SID 的那个用户登录才会触发。([Microsoft Learn][2])

但 Task 本身属于整台机器，而且目前只有一个，所以**另一个用户如果也运行 FlyEnv，会把这个 Task 修复成自己的**。这才是当前真正的多用户问题。

我认为这个问题值得你现在就让 Codex再做一个小调整：**即使暂时不支持多个 Helper，也至少不要把另一个正常用户的 Helper Task 当成“坏任务”自动覆盖。** 这能避免多用户机器上两个 FlyEnv 用户互相重装 Helper。

[1]: https://learn.microsoft.com/zh-cn/windows/deployment/usmt/usmt-recognized-environment-variables?utm_source=chatgpt.com "识别的环境变量 | Microsoft Learn"
[2]: https://learn.microsoft.com/en-us/windows/win32/taskschd/logontrigger-userid?utm_source=chatgpt.com "LogonTrigger.UserId property - Win32 apps | Microsoft Learn"
