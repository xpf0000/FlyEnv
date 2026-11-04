# 达梦数据库（DM8）集成调研

> **调研主题**: 达梦数据库 DM8 是否可集成进 FlyEnv
> **调研日期**: 2026-10-16
> **参考实现**: `docs/deepwiki/sql-server.md` 与当前 `plugins/mssql`
> **实现状态**: 已提供实验性 `plugins/dameng` 源码；官方包 URL、大小、包内 ISO 摘要及安装器只读检查证据见 [插件 README](../../plugins/dameng/README.md)。当前仍未完成 Windows x64/Ubuntu 22 x86_64 实机生命周期验收，不等于已验证的一期平台支持。
> **结论**: 具备集成基础，建议以独立插件进行 PoC，完整生命周期验证通过后再开放对应平台。首期目标为 Windows x64 和白名单 Linux x86_64；macOS 无原生版本，Linux 不能按一个通用安装包处理。Linux 优先采用通用启动器与 Base 的 SIGINT 停止流程，不以保留 stdin 为前提；Windows 优先评估官方服务启停，不能把通用 taskkill 当成正常关闭。
>
> **已明确的决策**:
> 1. 以 `plugins/dameng` 独立插件实现，不改为宿主内置模块。
> 2. **只使用达梦官方下载地址**。不使用离线包、内置包或镜像站，不把 DM8 安装包、ISO、安装目录或容器镜像打进 FlyEnv/插件发布物。
> 3. **静默安装前不增加许可展示或用户确认环节**。不新增许可页面、勾选框或确认 IPC。
> 4. 首期采用严格平台白名单，不用 x64 包试探性支持 Windows ARM64，也不把特定国产 ARM 平台的包视为通用 Linux ARM64 支持。
> 5. 首版只管理带 FlyEnv manifest 的自有安装和由 FlyEnv 启动的实例，不扫描、接管或停止外部 DM 实例。
> 6. 优先复用现有 `ModuleInstalledItem` 生命周期。Linux 先验证 `serviceStartSpawn + Base._stopServer(SIGINT)`；Windows 在插件 Fork 内适配官方服务控制，不新增 renderer 启停流程。不预先引入常驻 stdin 控制器或修改宿主 worker 生命周期。
>
> **调研边界**: 本结论来自达梦官方手册、达梦技术社区的原始操作记录、既有安装工件检查记录和 FlyEnv 当前源码。社区记录不等于官方对所有版本的兼容性保证，工件检查仍需补齐可复核证据。尚未在 Windows x64 或 Ubuntu x86_64 上实际安装、初始化和启动 DM8；文中标记为待验证的内容不能在实现时直接当成已证实能力。

---

## 结论摘要

达梦具备 FlyEnv 所需的自动化基础：Windows 和 Linux 都有官方静默安装方式，支持自定义安装目录；`dminit` 能按指定路径和端口初始化实例；`dmserver` 能以控制台方式前台运行；`disql` 可用于连接检查。因此，从进程管理和插件架构看，原生集成没有根本性障碍。

主要复杂度集中在以下方面：

- **平台与包矩阵**：macOS 无原生版本；Linux 按 OS、CPU、glibc 等环境分包；Windows/ARM 与通用 Linux ARM64 不能默认支持。
- **安装形态**：当前公开包为 ZIP 内封装 ISO，不是绿色解压版；没有官方依据支持跳过安装器或随意搬迁安装目录。
- **正常停止**：Linux 已有 Ctrl+C 正常退出及 `kill -2` 停止实例的社区记录，与 Base 默认 SIGINT 相符，优先验证通用启停；Windows 通用停止实际是 `taskkill /F`，需使用官方服务控制。
- **安装事务与共存**：安装器直接写最终目录，不能复用解包版安装后 rename 的发布方式；安装/卸载涉及全局配置，跨版本并行和与外部 DM 共存必须单独验证。
- **初始化与资源**：多个初始化参数建库后不可修改，64 位默认内存和重做日志配置偏高，需要桌面开发资源档位。
- **试用授权**：官网开发版免费试用一年，到期后数据库服务不能启动，运行界面应能呈现授权到期信息。

综合判断：**“Windows x64 + 指定 Linux x86_64 的有限原生插件”可行且值得做；“全平台统一 DM8 模块”在当前官方支持矩阵下不成立。**

官方资料：

- [达梦官方下载中心](https://www.dameng.com/download/)
- [产品 FAQ](https://eco.dameng.com/document/dm/zh-cn/faq/faq-dm-product.html)
- [安装及卸载](https://eco.dameng.com/document/dm/zh-cn/pm/install-uninstall.html)
- [静默安装 XML 模板](https://eco.dameng.com/document/dm/zh-cn/pm/dm8-appendix.html)
- [创建和配置 DM 数据库](https://eco.dameng.com/document/dm/zh-cn/pm/create-configure.html)
- [启动和关闭数据库](https://eco.dameng.com/document/dm/zh-cn/pm/start-shut-down.html)
- [DIsql 入门](https://eco.dameng.com/document/dm/zh-cn/pm/getting-started-disql.html)
- [DM8 Linux 脚本使用手册](https://eco.dameng.com/document/dm/zh-cn/pm/dm8_linux-script-manual.html)

信号停止的补充证据来自社区原始记录，证据范围和待验证项见“正常停止：优先信号，按平台适配”。

---

## 发行方式与支持平台

| 平台 | 官方形态与当前证据 | 集成判断 |
|---|---|---|
| Windows x64 | 当前公开下载有 `dm8_20260709_x86_win_64.zip`；安装手册以 Windows 10 x86-64 为例，支持图形和静默安装 | ✅ 首期推荐 |
| Windows ARM64 | 当前公开下载没有 ARM64 包；x64 转译安装和运行未获官方证实 | ❌ 不开放 |
| Linux x86_64 | 官方按 RHEL/CentOS、Ubuntu、麒麟等环境提供不同安装包；当前有 Ubuntu 22 x86_64 包 | ✅ 白名单支持，首个目标建议 Ubuntu 22 x86_64 |
| Linux ARM64 | 有鲲鹏、飞腾等 CPU 搭配指定麒麟/UOS 的包，但未看到通用 Ubuntu/Debian ARM64 包 | ⚠️ 仅支持经过验证的精确 CPU/OS 组合 |
| macOS Intel / Apple Silicon | 官方 FAQ 明确“目前没有 MAC 系统上安装的版本” | ❌ 不做原生支持 |

其他公开或可申请架构包括龙芯、申威、海光等，但特定安装包可能需要联系达梦商务获取，不纳入 FlyEnv 默认下载清单。

### Linux 包不能抽象为通用 x64/ARM64 包

达梦安装器会检查硬件架构和 glibc。官方 FAQ 也强调安装包需要与操作系统版本对应，部分国产 OS 还需要结合 gcc/glibc 版本选包。因此版本清单至少要记录：

- 操作系统及版本；
- CPU 架构和具体平台标识；
- 官方文件名和下载 URL；
- 文件大小、SHA256 或官方签名校验信息；
- 已验证的 FlyEnv 支持状态。

检测不匹配时应跳过该候选并说明原因，不能下载一个“最接近”的包继续安装。

### macOS 边界

当前决策不使用离线包、内置包或镜像站，且 macOS 没有原生 DM8 服务器版本，因此首期及当前规划均不声明 macOS 支持。不能把 Linux amd64 容器或虚拟机包装成“macOS 原生 DM8”。未来若单独评估容器方案，应重新确认其下载方式和平台兼容性，不属于本文推荐的一期范围。

---

## 下载、许可与安装形态

### 下载源决策

所有在线版本和安装操作只使用达梦官方下载地址：

- 不使用用户本地离线安装包作为安装来源；
- 不在 FlyEnv、插件压缩包或安装器中内置 DM8；
- 不搭建或使用第三方镜像站；
- 不自行托管 DM8 ZIP、ISO、安装目录或容器镜像；
- 官方地址失效时报告下载失败，不自动切换到非官方来源。

实现上建议使用**经过验证的固定版本目录**，而不是把未文档化的下载 JSON 当作唯一发现机制。目录条目保存官方 URL、目标 OS/CPU、文件名、大小和摘要；下载后校验 ZIP，以及 ZIP 内官方提供的 ISO SHA256。自动更新目录时仍需经过平台匹配和验证，不因出现新文件就自动扩大支持矩阵。

### 试用授权

[产品 FAQ](https://eco.dameng.com/document/dm/zh-cn/faq/faq-dm-product.html)明确：

- 官网下载版本可免费试用一年；
- 无 `dm.key` 时按试用版运行；
- 到期后需购买或延期 License，否则数据库服务不能启动；
- 可通过以下 SQL 查询授权到期时间：

```sql
select expired_date from SYS."V$LICENSE";
```

FlyEnv 可在实例信息中读取并展示授权状态和到期时间，但**不在静默安装前增加许可展示、接受或确认步骤**。

### 当前安装包不是绿色版

对当前官方 ZIP 的只读检查显示：

- Windows ZIP 内含 ISO 和对应 `iso_SHA256.txt`；
- Linux ZIP 同样内含 ISO，部分包附 README；
- 必须再经过 ISO 中的官方安装器，不是解压 ZIP 后就得到可运行的 `dmserver`。

官方支持自定义安装目录，`dminit` 和 `dmserver` 也支持显式数据路径，但没有找到以下能力的官方声明：

- 服务器绿色免安装版；
- 跳过安装器直接提取 ISO 运行的正式支持；
- 复制安装后的 `dmdbms` 到其他路径或机器即可运行。

因此，安装目录发布后不应再搬迁；免挂载提取 ISO、跳过安装器或便携目录只能作为单独实验，不进入首期方案。

上述工件检查记录尚未附完整下载 URL、ZIP/ISO 实际大小、SHA256、内部文件清单和检查方法。PoC 应补齐这些证据，并记录安装器及引擎版本；在此之前，文件名和封装结构属于待复核记录，不能仅凭本文生成可发布的下载目录。

ISO 挂载属于必要安装步骤：Windows 验证系统挂载和安装完成后的卸载；Linux 明确只读挂载、所需权限及清理方式，不能假设普通用户能直接 loop 挂载。挂载授权、以普通用户运行安装器、可选 root 安装后脚本是三个不同步骤。介质卸载失败只报告自身失败，不否定已完成的数据库安装。

---

## 安装、权限与卸载

### Windows

官方提供两种安装方式：

```text
图形安装：setup.exe
静默安装：setup.bat -q <配置文件全路径>
```

静默安装需要管理员权限。安装器可能写入 `C:\Windows\system32\dm_svc.conf`，初始化实例后通常会创建 `DmService<实例名>`。FlyEnv 可沿用 MSSQL Windows 的单次 UAC、安装互斥、真实退出等待和部分完成报告模式，但 SQL Server 注册表发现、实例 ACL 和服务命名逻辑均不可复用。

推荐安装 XML 由 FlyEnv 生成，程序直接安装到最终目录 `AppDir/dameng/<installId>`，实例数据放到 `BaseDir/dameng/<instanceId>` 下。`installId` 使用符合安装器限制的稳定标识，与展示版本号分开；manifest 记录真实版本、安装目录和实例映射。推荐 `INIT_DB=N`，随后由 `dminit` 单独初始化；Windows 服务注册方式在 PoC 后固定，不允许同一安装目录混用无法识别的安装形态。

Windows 推荐注册插件自有、按需启动的 DM 服务，并在已有安装提权阶段确认发起用户的服务控制和日志访问权限。后续启停继续走 `ModuleInstalledItem`，只替换插件 Fork 内的实际服务控制；不直接复制 SQL Server 的账户、ACL 或注册表规则。

### Linux

官方提供：

```bash
# 图形安装
./DMInstall.bin

# 命令行交互安装
./DMInstall.bin -i

# 静默安装
./DMInstall.bin -q <配置文件全路径>
```

Linux 可以使用普通用户安装和运行，而且官方不建议 root 安装。注册系统服务需要 root，但直接执行 `dmserver` 不以注册系统服务为前提，适合 FlyEnv 的前台进程模型。

需要注意完整官方流程还包含 `<DM_HOME>/script/root/root_installer.sh` 和 `DmAPService`。官方快速上手说明不执行相关步骤会影响数据库备份。若一期选择普通用户安装并跳过该步骤，必须：

- 把影响限制写入实例能力说明；
- 不把基础启动成功宣称为完整官方安装；
- 备份等依赖功能不可静默假设可用；
- 不为了一个可选能力在启动链路中反复提权。

### 资源预检

官方安装手册建议尽量保证至少 4 GB 可用内存；完全安装约需 3 GB 空间，Linux 安装过程还需要约 3 GB 临时空间。临时目录默认为 `/tmp`，可通过 `DM_INSTALL_TMPDIR` 改到 FlyEnv 临时目录。

Linux 还应检查 `open files` 等 ulimit 建议值。预检失败应明确报告，不在安装链路中自动修改系统级 limits 配置。

### 路径预检

[官方静默安装模板](https://eco.dameng.com/document/dm/zh-cn/pm/dm8-appendix.html)对安装路径允许字符有明确限制，不能默认 FlyEnv 自定义根目录或带点、连字符的版本号可直接作为安装目录。当前实现已核对目标安装器 `AutoInstallXml` 字节码，XML 目录校验确实拒绝点和连字符。按用户最新要求，点击下载时先显示 FlyEnv 内安装目录弹窗，说明每一级文件夹名称仅使用英文字母、数字、下划线；用户可输入路径，或点击输入框右侧按钮再打开系统目录选择器，确认并校验最终安装路径后再下载；程序直接安装到该位置，安装完成后自动登记既有自定义版本目录，版本管理按登记目录及实际引擎判断已安装。不再自动使用同级专属目录，也不移动已有文件。

程序路径与数据路径分别验证：XML 安装路径限制只用于程序目录；原 FlyEnv 数据路径通过原生 `dminit CONTROL` 的 INI 路径值传入（使用原生单引号格式，内部单引号写成两个，不添加命令行双引号；Windows 子路径使用反斜杠），单独检查长度、绝对路径、控制字符及目录归属。官方建库手册还列有路径长度限制，并建议数据路径尽量不含中文。PoC 至少覆盖中文、空格、点、连字符、长路径和无写权限；不匹配时在安装器运行前报告具体路径及限制，不静默搬迁用户目录。

### 安装事务与多版本共存

- **下载与介质准备**可以使用 staging；**官方安装器必须写入最终目录**，不能安装到临时目录后 rename，也不能失败后直接递归删除安装器写入的目录来代替卸载。
- 安装成功后核验引擎文件、实际版本、目标目录和系统副作用，再写入 manifest 完成标记。安装器已完成而核验或登记失败时，保留“已安装、未完成登记”的事实及恢复所需信息，禁止直接重放安装。
- 安装与卸载先采用跨版本互斥，锁作用域需覆盖宿主多个 Fork worker，不能只靠某个 Fork 单例中的 Promise 队列。下载可独立并行；实例运行并行不代表安装器可以并行。
- Windows 官方安装和卸载会涉及共享 `dm_svc.conf`；Linux 安装手册对已有 DM 给出了先卸载的要求。因此，多版本安装及与外部 DM 共存都尚未获本文验证。若不能证明不会覆盖外部配置或服务，应阻止本次安装并解释冲突，不自动卸载外部 DM。
- PoC 要记录全局配置、服务、环境变量和卸载登记的变化，验证卸载一个自有安装不会影响另一个安装或外部实例；通过后再决定是否开放多版本共存。

### 卸载

DM 官方卸载是整个安装目录的卸载：

- Windows：`uninstall.exe`；
- Linux：`uninstall.sh`。

不能像 MSSQL Linux 解包版那样直接删除程序目录。卸载前应先停止本插件拥有的实例，处理本插件创建的服务，再调用官方卸载器。用户数据可能被官方卸载器保留，结果需要区分“程序已卸载、数据保留”“卸载失败”和“部分完成”。

Windows 官方卸载流程会询问是否删除共享 `dm_svc.conf`，不可仅凭本安装 manifest 就授权删除。Linux `uninstall.sh` 默认进入图形卸载，`-i` 才是命令行交互卸载；两平台的无人值守卸载参数均需验证，不把“提供卸载器”写成“已经支持静默卸载”。停止失败必须阻断该安装的卸载，独立安装的结果分别保留。

---

## 初始化、启动、就绪与停止

### 初始化

DM 可在安装时创建数据库，也可安装后使用 `dminit` 创建。为了让 FlyEnv 明确拥有数据目录和初始化参数，推荐安装与实例初始化分离：

```bash
dminit PATH=<BaseDir/dameng/instanceId> \
       DB_NAME=DAMENG \
       INSTANCE_NAME=DMSERVER \
       PORT_NUM=5236 \
       SYSDBA_PWD=<密码> \
       SYSAUDITOR_PWD=<密码>
```

默认端口为 **5236**，实例配置通常位于：

```text
<PATH>/<DB_NAME>/dm.ini
```

以下参数需要在首次初始化 UI 中处理，因为建库后不可修改：

- `PAGE_SIZE`；
- `EXTENT_SIZE`；
- `CHARSET/UNICODE_FLAG`；
- `CASE_SENSITIVE`；
- 其他会影响存储和兼容性的不可变参数。

`AUTO_OVERWRITE=2` 会先清理建库目录，不能作为 FlyEnv 默认参数。已有数据目录、同名实例或未初始化完成的目录必须分别识别，不能通过覆盖来“修复”。

当前插件在启动前重新读取自有 manifest 和数据库配置文件的初始化状态。未初始化时自动打开 FlyEnv 初始化弹窗，确认并成功创建/注册数据库后继续通用启动；取消不会启动，已完成建库的注册恢复不会重建数据。初始化弹窗固定 75vh，内部使用 `el-scrollbar`，SYSDBA 与 SYSAUDITOR 初始密码分别提供生成按钮和用途说明。初始化时设置的是新建账户的密码，已有数据库设置页中的“当前 SYSDBA 密码”则是该账户现在的实际登录密码。两个初始密码均需填写，错误提示明确指出缺失或不合格的字段。

密码属于敏感请求数据，不得写入命令输出、安装日志、manifest 或错误上报。是否保存连接凭据及其保护方式需要明确设计，不能因使用 `StorageSetAsync` 就假设密码已加密。SYSDBA 密码可以在建库后修改，就绪检查不能永久依赖首次初始化密码。

### 桌面开发资源档位

官方文档列出的 64 位默认值包括：

- `BUFFER=8000 MB`；
- 单个重做日志 `LOG_SIZE=4096 MB`，默认至少两个重做日志。

这些默认值不适合不加判断地用于桌面开发环境。一期应提供经过验证的小型开发配置，并在初始化前展示预计内存和磁盘占用。字符集、页大小等不可变选项与资源档位要分开呈现，避免用户以后误以为都能直接编辑。

### 启动

官方支持显式指定配置路径启动。以下是官方命令形态示例，Windows 一期仍优先通过服务启动：

```bash
# Windows
dmserver.exe path=<绝对路径>/DAMENG/dm.ini

# Linux
./dmserver <绝对路径>/DAMENG/dm.ini
```

实例路径通过 `dm.ini` 指定，因此不需要 MSSQL Linux 的 Bubblewrap，也没有 `/var/opt/mssql` 固定实例目录问题。

FlyEnv Fork 模块应拥有本次 `dmserver` 进程、PID、端口、启动输出和退出清理。启动前检查端口和实例归属；发现外部进程或外部服务已占用时报告冲突，不接管、不停止。

Linux 优先通过 `serviceStartSpawn` 直接启动引擎，PoC 验证使用 `-noconsole` 关闭控制台命令读取，能否在 `stdin=ignore`、日志重定向及 detached 条件下持续运行并响应 SIGINT。不能仅凭参数名称推断 PID 不变或进程不派生，必须确认登记的是实际引擎 PID。启动返回 PID 不等于就绪，插件 Fork 仍需完成下述就绪检查。

### 就绪检查

控制台出现 `SYSTEM IS READY` 可作为引擎日志就绪标志，再使用 `disql` 对本次实例做连接检查。默认连接形式为：

```text
disql SYSDBA/<password>@127.0.0.1:5236
```

连接示例仅说明语法，实际调用应避免把密码暴露在诊断输出和可见命令行中，并验证特殊字符处理及非交互退出行为。就绪检查使用当前有效凭据，非交互式 DIsql 在 `CONNECT` 前执行 `SET DEFINE OFF`，避免生成密码中的 `&变量` 被替换或消耗后续 stdin 输入；认证失败应单独报告，不能误报为引擎崩溃，也不能重建数据目录。

不能只凭 PID 存活或端口打开就报告数据库可用。引擎启动失败或本次启动验收失败时，应由统一停止所有者回收本次进程，保留数据文件并返回本次日志和连接检查错误。既有运行实例的信息读取失败不得进入启动失败清理。

### 正常停止：优先信号，按平台适配

这里讨论的是进程信号（signal），不是进程间同步用的信号量（semaphore）。`exit` 是官方控制台关闭方式，但不是唯一可研究的停止入口，不能据此预先认定必须保留 stdin。

#### 信号支持的证据与范围

- [官方启动和关闭手册](https://eco.dameng.com/document/dm/zh-cn/pm/start-shut-down.html)说明了控制台 `exit`、服务停止及 `-noconsole`，未在该章节明确承诺单机各版本的 SIGINT/SIGTERM 行为。
- [社区原始操作记录：实例启动和关闭方式比较](https://eco.dameng.com/community/article/cf8218b2a54e46d5440950fe0f8aab46)包含 Linux 控制台 Ctrl+C 后进入停止流程、输出 `DM Database Server shutdown successfully` 的实测记录。它支持 SIGINT 正常关闭这一方向，但不是当前目标包在 detached 模式下的验证结果。
- [社区问答：DmServiceDSC stop 后进程仍在](https://eco.dameng.com/community/question/1395a8f5b8d6c71b4e1ba494c507cdc0)记录 Linux `kill -2` 可以停止 DMSERVER 单个节点。该记录来自 DSC 场景，只作为补充证据，不据此把集群控制语义带入一期单实例方案。

据此，**Linux 优先采用 SIGINT（`kill -2`）复用现有通用启停**，以目标安装包的 PoC 验收为上线条件。SIGTERM 尚无足够的正常关闭证据，不默认选用；`SIGUSR1/kill -10` 涉及集群停止语义，也不作为单机默认信号。

#### Linux：复用通用启动器和 Base 停止

当前源码的实际行为是：

- `src/fork/util/ServiceStart.ts` 的 `serviceStartSpawn` 使用 `stdio: ['ignore', out, err]`、支持 detached，并在取得 PID 后 `unref()`；它适合不依赖父进程 stdin 的服务。
- `src/fork/module/Base/index.ts` 的 `_stopSignal()` 默认返回 **`-INT`，不是 TERM**；达梦无需为了 SIGINT 修改宿主默认值。
- `Base._stopServer()` 筛选归属进程后，经 `stopUnixServicePids()` 和 `ProcessKillStrict()` 发送信号、等待实际退出，确认后才清除 PID；默认退出等待预算为 10 秒，失败不会自动升级到 SIGKILL。

插件补充 DM 的 manifest、精确实例/程序路径和 PID 创建身份，优先复用上述停止主体。实际实现关闭 Base 的进程名孤立候选扩展，仅允许已确认根 PID 及其进程树进入通用停止，避免通用 substring 匹配把 `dm.ini.backup` 等外部配置纳入。归属标记必须排除同目录下非本次启动的实例，不能把安装目录或进程名本身视为操作授权。若正常关闭耗时超出通用预算，再按实测结果评估插件内最小适配，不先复制整套停止流程。

PoC 必须用与 FlyEnv 相同的启动条件验证：stdin 忽略、日志重定向、detached、可选 `-noconsole`；先写入并提交测试数据，再发送 SIGINT，确认进程退出、正常关闭日志以及重启后的数据可读。还要让启动 worker 空闲回收后由后续请求停止实例，证明停止不依赖原 worker 的内存句柄。

#### Windows：公共生命周期不变，Fork 使用服务控制

Linux 信号结论不能直接外推到 Windows。虽然 Base 的注释提到 Windows `-INT`，实际 `ProcessKillStrict()` 的 Windows 分支不发送 POSIX SIGINT，而是调用 `src/shared/WindowsTaskkill.ts`，执行 **`taskkill /F /PID ...`**。这属于强制终止，不能作为 DM 的正常关闭方案。

Windows 优先使用官方 `DmService<实例名>` 的启动/停止控制。renderer 仍复用 `ModuleInstalledItem.start()/stop()/restart()`；插件 Fork 在既有启停入口内适配服务控制，并确认服务状态、引擎 PID、配置路径和本次启动归属。服务已被外部启动时报告状态冲突，不借插件 manifest 将其接管。服务停止及 PID 退出都确认后才清除本次登记。

#### stdin 仅作为未通过验证后的备选

首选方案不保存 stdin，也不增加常驻控制器。现有插件使用通用 Fork worker 池，空闲 worker 会在 10 秒或 180 秒后回收，后续停止可能路由到其他 worker；因此仅在插件 Fork 单例中保存 `ChildProcess.stdin` 不能构成可靠方案。

若 Linux SIGINT 或 Windows 服务模式未通过验证，再单独评估官方脚本或其他正常关闭入口；确需 stdin 时，必须先解决稳定路由、所有者存续、worker 崩溃和应用退出清理，不能只改 spawn 的 stdio。任何超时或未确认退出都保留失败/未知状态与 PID，不静默强杀，不继续卸载。官方 Linux 脚本手册同样说明停止失败时不会主动强杀服务进程。

---

## FlyEnv 现有基础与复用边界

当前仓库已经有 MSSQL 插件，不限于早期调研文档。其实际形态见 `plugins/mssql/plugin.json:1-25`，目前仅声明 Windows/Linux x64。`docs/deepwiki/sql-server.md` 开头的最新说明优先于文中保留的早期图形安装方案。

### 可以复用的骨架

- 插件 `moduleType: dataBaseServer`、renderer/fork 双入口和动态模块注册；
- 宿主 ServiceManager、VersionManager、Conf、Log 组件；
- MSSQL renderer 模块级 controller、IPC code 200 进度与终态处理、超时清理和监听器释放，见 `plugins/mssql/render/store.ts`；
- 请求快照、同实例操作互斥及跨版本安装/卸载互斥；不直接继承不同版本安装器并行策略；
- 下载/介质 staging、manifest 校验和部分完成报告；不复用安装目录 rename 发布或失败直接删目录；
- `ModuleInstalledItem.start()/stop()/restart()` 及 `startExtParam/stopExtParam`；
- `StorageGetAsync/StorageSetAsync` 持久化与 `reactiveBind` 模块状态；
- Linux 通用启动器、Base 的 SIGINT 停止主体、PID 文件、进程归属筛选和退出复核。

这些代码应按 DM 语义在插件内实现，不跨插件 import MSSQL 私有文件。

### 必须重写的部分

- 官方版本目录、ZIP/ISO 下载校验和安装器调用；
- DM 静默 XML、资源预检和安装结果识别；
- 本地安装 manifest 和实例目录识别；
- `dminit` 初始化与不可变参数 UI；
- `dmserver` 启动、日志就绪、`disql` 连接检查；
- Linux 的 DM 进程归属与就绪适配、Windows 的 DM 系统服务控制；
- 官方卸载器流程；
- DM 日志路径与编码适配，界面优先复用现有日志组件；
- 授权到期信息读取。

MSSQL 的 SQL Server 注册表解析、实例 SID/ACL、sa 密码规则、Bubblewrap 环境、deb 仓库解析和 UTF-16 ERRORLOG 解码均与 DM 无关。

### 新插件与宿主改动

建议新增：

```text
plugins/dameng/
├── plugin.json
├── fork/
├── render/
└── lang/
```

`plugin.json` 使用独立 `id/typeFlag: dameng`，`moduleType: dataBaseServer`，平台按白名单声明。图标和中英文文案放在插件内部；不需要修改宿主 `AppModuleEnum`、`ServerPath.ts`、内置 Fork 分发或 25+ 宿主语言文件，也不新建 Pinia store。

以上为优先插件内实现的目标，不是对未知运行时限制的保证。Linux SIGINT 路径通过验证后无需为了 stdin 改造 worker 池；若 PoC 暴露现有通用能力不足，应先记录具体限制，再评审最小改动，不在宿主中硬编码 DM 私有逻辑。

`plugins/registry.json` 由现有插件构建流程更新。发布物只包含插件自身代码和资源，不包含任何 DM8 安装工件。

ServiceManager 的自定义版本和操作菜单沿用宿主默认行为，不增加特殊显示开关或宿主能力检查；不能因此把 DM 模块数据写入 `config.setup`。

---

## 服务生命周期和状态归属建议

- Fork 模块拥有安装器调用、实例进程、PID、端口、存活状态、启动日志和退出清理。
- 可跨页面继续的下载、安装、初始化和卸载由模块级 singleton controller 持有进度、终态和重复调用 Promise。
- 页面只绑定 controller 状态与命令，不拥有操作 IPC、进度或监听器清理。
- 启停优先复用 `ModuleInstalledItem` 生命周期；DM 端口、实例目录和初始化选项通过模块注册参数传递。
- 模块持久化使用 `StorageSetAsync/StorageGetAsync`，不写 `config.setup`，不新建 Pinia store。
- 安装、初始化、启动、停止和卸载都要有明确终态；部分完成不能被后续补充动作覆盖成失败或重新执行已完成步骤。
- 对外部实例、无效 manifest、平台不匹配候选逐项跳过并报告原因，不中止其他有效版本或实例的扫描。

正式实施计划须为下载、安装、初始化、启停和卸载分别记录操作契约：owner、生命周期、请求快照、进度事件、成功/失败/部分完成/未知终态、重复调用行为、服务或伴随进程交互以及验收场景。下载校验、实际写入、正常停止和必要登记属于对应操作的必要步骤；安装已完成后的介质卸载、通知和授权信息展示属于附加动作，失败只影响自身结果。

用户后续明确授权复用既有 `config.setup.dameng.dirs` 进行自定义版本目录登记；除此以外，模块数据仍用 `StorageSetAsync/StorageGetAsync`，状态用模块本地 class + `reactiveBind`；复用公共生命周期，DM 私有策略和类型留在插件目录。实施时补齐重复触发、进度保留、页面离开/重入、失败重试、worker 回收后停止及应用退出的生命周期验收。

---

## 主要风险

- **平台覆盖断层**：macOS 无原生版本；ARM 支持依赖精确硬件和 OS，不应为了界面统一而放宽门禁。
- **安装链较重**：ZIP 内 ISO、较大的下载体积、安装及临时空间需求，使安装体验明显重于普通开源数据库。
- **非便携安装**：没有官方绿色服务器包，安装目录不能假设可移动或直接解包运行。
- **正常停止验证**：Linux SIGINT 已有社区证据，但目标包在通用启动条件下仍需验收；Windows 必须区分服务正常停止与 taskkill 强杀，不把保留 stdin 预设为必要架构。
- **安装共存与路径**：最终路径不可假设可搬迁；安装器共享配置、多版本共存及路径字符/长度限制均需验证，安装/卸载先采用跨 worker 互斥。
- **初始化不可变参数**：字符集、页大小、大小写敏感等错误选择无法靠后续编辑配置修复。
- **资源默认值偏高**：直接采用默认 BUFFER/LOG_SIZE 可能导致桌面内存和磁盘压力。
- **试用到期**：授权到期会阻止服务启动，UI 和诊断需要能区分许可到期与普通启动失败。
- **Linux 完整功能边界**：普通用户安装若跳过 root/DmAPService 步骤，备份等能力需要单独验证和说明。
- **官方源可用性**：只使用官方地址意味着官方限流、失效或调整目录时没有镜像兜底；应如实报错并保留已安装实例，不自动切换来源。

---

## 建议实施阶段

### 阶段 0：窄范围 PoC

只验证 Windows x64 和 Ubuntu 22 x86_64，使用达梦官方下载地址：

1. 记录官方 URL、ZIP/ISO 大小及摘要、内部清单和版本，验证只读挂载、授权及介质卸载；
2. 预检路径后静默安装到最终目录，确认实际系统副作用和部分完成状态；不 rename 已安装目录；
3. 使用小型开发资源配置执行 `dminit`；
4. Linux 经通用启动器启动，Windows 经自有服务启动，验证实际 PID、`SYSTEM IS READY` 和 `disql` 连接；
5. Linux 用通用 Base SIGINT 停止，Windows 用官方服务控制停止；确认正常关闭日志及实际退出，不使用强杀作为通过标准；
6. 停止前写入并提交数据，再次启动后确认可读；另测启动 worker 回收后仍能正常停止；
7. 验证端口冲突、外部实例不接管、进程异常退出和崩溃恢复；
8. 验证安装/卸载跨 worker 互斥、外部 DM 共存及多版本相互影响；确认官方卸载器交互、共享配置保留、用户数据保留和部分完成结果；
9. Linux 验证跳过可选 root 步骤后的具体功能限制；
10. 验证授权信息读取和到期状态展示，并区分密码变更后的认证失败、引擎启动失败和授权到期；
11. 验证重复操作、页面重入、应用退出停止和超时失败保留 PID；停止未确认时禁止进入卸载。

任一平台未通过完整生命周期，就不进入该平台的一期支持清单。

### 阶段 1：原生插件

优先落地已通过 PoC 的平台。若资源只够先做一个平台，建议先 Windows x64，其安装包矩阵最简单；Linux 从 Ubuntu 22 x86_64 开始，再逐项扩展。

一期只包含：

- 官方源版本目录和下载安装；
- 自有安装发现；
- 单实例初始化、启停、日志和配置入口；
- 授权状态展示；
- 官方卸载流程；
- 真实施工范围内的中英文文案。

### 阶段 2：扩展平台

逐个加入经过实机验证的 RHEL/CentOS、麒麟、UOS 和国产 CPU 组合。每个新平台都需要独立验证安装包匹配、初始化、启停和升级，不能只因架构名称相同就继承支持状态。

macOS 不在当前路线中。若未来单独调研容器或虚拟机方案，应另行评审，不改变本文“不使用离线包、内置包或镜像站”的约束。

---

## 最终判断

达梦具备集成基础，`dminit + dmserver + disql` 适合 FlyEnv 的实例目录模型。Linux 已有 SIGINT 正常关闭的社区证据，首选复用当前通用启停，不必预先设计 stdin 常驻所有者；Windows 复用公共生命周期并在插件内适配官方服务控制。目标包的信号/服务停止、安装共存、初始化参数和完整功能边界仍需 PoC 验证。

建议按 **“PoC 验证 → Windows x64/Ubuntu 22 x86_64 插件 → 精确扩展其他 Linux 平台”** 推进。全程只使用达梦官方下载地址，静默安装前不增加许可展示或用户确认环节；不承诺 macOS 原生支持，不把未验证的解包直跑、ARM 转译或通用 Linux 包写成产品能力。
