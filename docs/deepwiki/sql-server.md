> **当前实现（2026-10-15，按最新用户反馈修正）**：SQL Server 使用专用图标；移除 FlyEnv 的 Developer 提示、许可弹窗、下载阶段说明及成功提示。Windows 获取完整官方媒体，以 `/Q` 和官方许可/隐私参数静默安装；保留 FlyEnv 路径，使用虚拟服务账户，将提权前的当前 Windows 用户设为 SQL 管理员（Windows 认证）。安装器仍注册系统服务，但设为手动启动，等待 Setup 真实结束后停止且确认本次新建的实例。已存在实例拒绝重复安装，安装成功但停止失败保留已安装事实并报告部分完成。启停普通权限不足时只提权该次控制，UAC 后复核状态/PID；不接管、不停止外部运行实例。Windows x64 实机安装/UAC 仍待验收。下文关于图形安装、不静默、零提权代码及许可 UI 的表述是早期调研，已被最新要求取代；实施记录见 `docs/superpowers/plans/2026-10-15-mssql-windows-silent.md`。

# Microsoft SQL Server 集成调研

> **调研主题**: Microsoft SQL Server (MSSQL) 是否可集成进 FlyEnv
> **调研日期**: 2026-10-15
> **参考产品**: SQL Server 2017–2025 (Linux/Windows/容器)
> **结论**: 可行性中等，平台差异极大。Windows x64 走"下载官方安装器 + 拉起安装 + 装完扫描安装信息",Linux x64 解包官方 deb，以 Bubblewrap 用户命名空间运行,macOS 无原生版本、只能走容器路线(复用 FlyEnv 已有的 Podman 模块)。以插件形式实现。
>
> **已明确的决策**:
> 1. 下载源采用**插件内直解官方源**(与 kafka/llamacpp 插件同模式),不依赖 api.one-env.com 清单。
> 2. Windows **不做自动安装**,只提供"下载 + 拉起官方安装器 + 装完扫描安装信息";UAC 与 EULA 由官方安装器自己处理,FlyEnv 零提权代码。
> 3. 拉起安装器时按 **FlyEnv 现有安装路径/数据路径规则预填默认参数**(`/INSTANCEDIR`、`/SQLUSERDBDIR` 等);不加 `/Q`/`/QS`,参数仅作为图形向导的预填默认值,用户可修改并亲手接受 EULA。
> 4. Review 后修正 Linux 运行边界：`MSSQL_DATA_DIR` 不是实例根目录。Linux 通过 Bubblewrap 将插件数据目录映射为进程内 `/var/opt/mssql`，同时显式指定 master、errorlog 等路径；需要系统已安装 Bubblewrap 并允许普通用户命名空间，不自动安装依赖、不修改宿主 `/var/opt/mssql`。
>
> **实施状态(2026-10-15，review 修复)**: 一期源码已补充 callback 型 IPC 终态处理、MSSQL 同版本安装/启停/卸载互斥、不同版本安装并行、Linux 原子发布与回滚、Windows 完整媒体获取和图形 Setup 路径预填、安装元数据扫描（不查询或同步外部运行态）、x64 门禁。测试覆盖和验证结果见 `docs/superpowers/plans/2026-10-15-mssql-review-fixes.md`。当前主机为 macOS ARM64；未据此声称 Windows x64 安装/UAC 或 Ubuntu x64 引擎首次初始化已经实机通过。

---

## 结论摘要

SQL Server 是微软的闭源商业数据库。自 SQL Server 2017 起官方支持 Linux(RHEL/Ubuntu/SLES,deb/rpm 包),Windows 上提供免费的 Express 版和 Developer 版;**macOS 从来没有原生版本**,此前唯一面向 ARM64 的 Azure SQL Edge 容器已于 2025-09-30 退役。

FlyEnv 的工程结构(fork 模块 + Base 基类 + 插件机制)可以容纳 MSSQL：Linux 启动需要隔离 PAL 实例目录，再执行 `sqlservr` 并注入 `ACCEPT_EULA` / `MSSQL_SA_PASSWORD` / `MSSQL_PID` 环境变量,初始化流程比 MySQL 的 `--initialize-insecure` + `mysqladmin` 更简单。真正的难点不在代码,而在**平台覆盖与安装形态**:

- SQL Server 没有官方免安装绿色包。Windows 是 setup.exe/ISO/cab 安装器(拉起后安装器自己触发 UAC、用户亲手接受 EULA),Linux 是 deb/rpm(解包本身免 root，用户态运行还需处理 PAL 固定目录),macOS 只有容器镜像。
- 许可侧:Express 版免费可再分发;Developer 版免费但**禁止再分发**,仅限开发测试用途。下载一律走微软官方 URL 直下,Windows 侧 EULA 由用户在官方安装向导中亲手接受;Linux/容器侧需在安装前显式呈现 EULA 并由用户接受(`ACCEPT_EULA`)。

官方资料:

- [SQL Server on Linux 安装指南](https://learn.microsoft.com/en-us/sql/linux/install-upgrade/setup?view=sql-server-ver17)
- [SQL Server on Linux 发行说明](https://learn.microsoft.com/en-us/sql/linux/sql-server-linux-release-notes?view=sql-server-ver17)
- [SQL Server 容器快速开始](https://learn.microsoft.com/en-us/sql/linux/install-upgrade/quickstart-install-docker?view=sql-server-ver17)
- [SQL Server Express LocalDB](https://learn.microsoft.com/en-us/sql/database-engine/configure-windows/sql-server-express-localdb?view=sql-server-ver17)
- [SQL Server setup.exe 命令行参数](https://learn.microsoft.com/en-us/sql/database-engine/install-windows/install-sql-server-from-the-command-prompt?view=sql-server-ver17)

---

## 发行方式与支持平台

| 平台 | 官方形态 | 可否原生集成 | 说明 |
|---|---|---|---|
| Windows x64 | Express(免费)、Developer(免费,仅开发测试)、Standard/Enterprise(付费)安装器;LocalDB MSI | ✅ 可以 | 采用"下载 + 拉起官方安装器(预填路径参数) + 装完扫描安装信息";安装器自带提权清单,UAC/EULA 由用户处理,FlyEnv 不写提权安装代码 |
| Windows ARM64 | 无原生版本 | ❌ 不支持 | Snapdragon 设备上官方不支持安装;只能绕道 Linux 容器 |
| Linux x64 | deb/rpm 包(RHEL、Ubuntu、SLES,packages.microsoft.com) | ✅ 可以(解包式) | 官方安装走系统包管理器 + systemd;但 `sqlservr` 可前台直跑(官方容器就是这么启动的),可用 `dpkg -x` 解包到用户目录，通过 Bubblewrap 映射实例目录，免 root、免 systemd（本期仅 Ubuntu deb） |
| Linux ARM64 | 无 | ❌ 不支持 | 无 ARM64 构建 |
| macOS (Intel/Apple Silicon) | 无原生版本;Azure SQL Edge 已于 2025-09-30 退役 | ⚠️ 仅容器 | 当前唯一路径是跑 Linux x64 容器镜像,Apple Silicon 上依赖 Rosetta/模拟层(OrbStack、Docker Desktop、Podman machine)。容器镜像官方仅支持 x86-64 |

硬件要求:SQL Server 硬性要求**至少 2 GB 内存**才能启动(不足会直接报错退出),建议 4 GB+;磁盘约 6 GB(不含数据)。这与 MySQL/Redis 等轻量服务不同,UI 上应做内存预检和提示。

### Linux 解包直跑的可行性

官方包安装后二进制在 `/opt/mssql/bin/sqlservr`,数据在 `/var/opt/mssql`。容器镜像的启动脚本证明 `sqlservr` 不依赖 systemd:设置 `ACCEPT_EULA=Y`、`MSSQL_SA_PASSWORD`、`MSSQL_PID=Developer`(或 `Express`)后直接前台执行 `sqlservr` 即完成初始化并启动。因此 FlyEnv 可以:

1. 从 `packages.microsoft.com` 下载对应发行版的 deb(Ubuntu)或 rpm;
2. `dpkg -x` / `rpm2cpio | cpio -i` 解包到 `app/mssql/<version>/`;
3. 数据目录指向 `server/mssql/data-<主版本>`,端口 1433(>1024,无需提权);
4. 以当前用户启动 `/usr/bin/bwrap`，只读映射宿主根目录、私有 `/tmp` 与 `/var/opt`，将该实例数据目录绑定到进程内 `/var/opt/mssql`，再执行解包的 `sqlservr`；PID/日志/停止信号由 fork 模块管理。缺少 Bubblewrap 时提示 `sudo apt install bubblewrap`，不在启动链路中提权或自动安装。

注意:这是对官方包的非官方用法,非 RHEL/Ubuntu/SLES 发行版(Arch、Fedora 等)的 glibc/OpenSSL 兼容性需实测;SQL Server 对 OpenSSL 版本敏感(历史上对 OpenSSL 3 有过兼容问题),应以实测为准。Linux 侧没有图形安装器,`ACCEPT_EULA=Y` 由插件注入,因此**安装前必须在 UI 显式展示 EULA 并由用户勾选接受**。

#### 官方包内容核验(2026-10-15,Ubuntu 22.04 jammy `mssql-server_16.0.4305.5-1_amd64.deb`)

为确认"解包直跑 + 数据目录重定向"的真实机制,下载了 packages.microsoft.com 仓库中 SQL Server 2022 最新 CU 的 deb(SHA256 `3fbd4e3d…9385a`,与 Packages 索引一致),在无 dpkg 的 macOS 上用 `ar x` + `tar -xf data.tar.xz` 回退路径完成解包(deb 即 ar 归档,成员为 `debian-binary`/`control.tar.xz`/`data.tar.xz`;本包还带一个 `_gpgorigin` 签名成员,BSD ar 会跳过它,不影响解包)。结论:

- **落盘布局**:`opt/mssql/bin/sqlservr`(2.4 MB ELF x86-64 启动器)、`opt/mssql/bin/mssql-conf`(python 包装脚本)、`opt/mssql/lib/sqlservr.sfp`(610 MB 引擎载荷)等,与插件约定的 `opt/mssql/bin/sqlservr` 路径一致;tar 解包保留可执行位。
- **环境变量的真实含义**：man page 与包内 `mssqlsettingsmanager.py` 将 `MSSQL_DATA_DIR` 映射到 `filelocation.defaultdatadir`，它定义数据库数据文件目录，不等于整个实例根目录；master 和 errorlog 分别有 `MSSQL_MASTER_DATA_FILE`、`MSSQL_MASTER_LOG_FILE`、`MSSQL_ERROR_LOG_FILE`。
- **PAL 固定目录不能由上述变量推断已重定向**：二进制内嵌 `[Pal.Directories]` 包含 `SystemDirectory=/var/opt/mssql/.system`，默认配置文件是 `/var/opt/mssql/mssql.conf`。此前“只设置 DATA/LOG/BACKUP 三个变量即可无需触碰 `/var/opt/mssql`”的结论撤回。
- **当前实现的目录隔离**：Bubblewrap 在进程私有挂载命名空间中将 `server/mssql/data-<引擎主版本>` 映射到 `/var/opt/mssql`；PAL 的 `.system`、系统库、机器密钥、配置、日志与备份均留在该绑定目录。数据库变量明确使用进程内 `/var/opt/mssql/data`、`/var/opt/mssql/log`、`/var/opt/mssql/backup`，master 文件显式指定为 `/var/opt/mssql/data/master.mdf` 与 `mastlog.ldf`。宿主文件路径分别是 `<实例目录>/data/master.mdf`、`<实例目录>/log/errorlog`。
- **初始化与就绪**：首次无 master 时要求强 sa 密码；已有数据库不因修改设置而重置 sa 密码。每次启动使用新建的启动输出日志，等待本次进程输出 `SQL Server is now ready for client connections`，不能仅凭 PID 存活显示成功。失败由现有停止所有者回收进程，保留数据库文件。
- **遗留差异(解包态 vs 官方安装)**:preinst 会写 `/etc/security/limits.d/99-mssql-server.conf`(`mssql soft stack 8192`),脚本注释说明缺少它时 sqlservr 会回退到 legacy VA 布局(mmap_base ~42TB);解包直跑没有这条 limits 配置,属可接受的非官方用法差异,如遇内存布局问题可在文档中引导用户手动添加。
- **待实机验证**:以上结论来自包内脚本、man page 与二进制 strings 的一手证据;x86-64 ELF 无法在 macOS 上运行,Bubblewrap 私有目录内 `.system`、机器密钥、系统库写入与重启恢复的完整行为仍需在真实 Ubuntu 22.04/24.04 上做一次端到端启动验证。

### Windows 两种形态的选择

- **LocalDB**:Express 的用户态子集,MSI 约 50–300 MB,按需启动(`SqlLocalDB start`),实例跑在当前用户会话里,无需 Windows 服务、无需常驻。适合"本地开发连一下"的场景,是 FlyEnv 体验最好的形态;限制是不监听 TCP(默认走 named pipe `(localdb)\...`,可通过 `SqlLocalDB share` 暴露)且不支持远程连接。LocalDB 的 MSI 不支持自定义安装目录,数据固定在各用户 `%LOCALAPPDATA%` 下,路径规则决策不适用于它。
- **Express 完整版**:监听 TCP 1433、支持远程连接、功能完整(容量、内存及 CPU 上限随主版本变化，应以对应版本官方说明为准)。

建议 Windows 首期做 **Express 完整版**;LocalDB 作为轻量选项二期再加。Developer 版(功能等同 Enterprise、免费)也值得列入版本清单,但要明确标注"仅开发测试,禁止生产"。

### Windows 权限模型:安装提权一次(用户经 UAC 确认),运行可全程用户态

- **安装阶段必然要管理员**:Express setup 与 LocalDB 的 SqlLocalDB.msi 都是 per-machine 安装(写 Program Files、HKLM),没有官方免安装 zip。按已明确的决策,这一步不由 FlyEnv 代劳:`setup.exe`/`SqlLocalDB.msi` 自带提权清单,拉起后 UAC 弹窗由安装器自己触发、用户亲手确认。
- **运行阶段可以不走 Windows 服务**:`sqlservr.exe -c` 控制台模式是官方支持的用法——绕过 SCM 直接前台运行,进程在用户安全上下文中,不需管理员。限制只是不能用 `net stop`/配置管理器管理(对 FlyEnv 无影响,fork 模块直接管 PID,与 MySQL 模式一致)。LocalDB 的实例配置在 HKCU,`SqlLocalDB create/start/stop` 全程用户态。
- **运行方式**:无论数据目录在哪,setup 都会把数据目录 ACL 授给服务账户 SID,用户态 `-c` 直跑会撞权限。扫描安装信息时首期按 Windows 服务方式启停(经服务控制 API,不改 ACL)可完全避开;`-c` 模式作为后续增强,启用时需提示用户授权一次。

### Windows 安装流程(已明确:不做自动安装,拉起时预填路径参数)

插件只负责三步:

1. **下载**:从 `download.microsoft.com` 直链下载。要传目录参数必须用**完整安装媒体**里的 `setup.exe`——SSEI 引导器只支持 `/ACTION=Download` 等少量参数,因此下载目标是 ISO/CAB 媒体(或先用引导器拉媒体),而不是直接跑引导器安装;LocalDB 则是单独的 `SqlLocalDB.msi`。
2. **拉起**:spawn 媒体内的 `setup.exe`,**不带 `/Q`/`/QS`**,把按 FlyEnv 路径规则算好的目录参数作为命令行传入——这些参数会成为图形向导中的预填默认值,用户可修改、亲手接受 EULA 后完成安装:

| 参数 | 预填值(按 FlyEnv 路径规则) |
|---|---|
| `/INSTANCEDIR` | `app/mssql/<version>/`(实例程序文件) |
| `/INSTALLSQLDATADIR` | `server/mssql/`(数据目录根,系统库,与 `server/<module>/` 规则一致) |
| `/SQLUSERDBDIR` / `/SQLUSERDBLOGDIR` | `server/mssql/data-<实例名>/` 下(用户库数据/日志) |
| `/SQLTEMPDBDIR` / `/SQLTEMPDBLOGDIR` | `server/mssql/data-<实例名>/temp/<每次安装的 UUID>/`，避免重装时与已保留的 tempdb 文件冲突 |
| `/SQLBACKUPDIR` | `server/mssql/backup-<实例名>/` |
| `/INSTANCENAME` | 预填 `FLYENV` 之类可识别实例名(用户可改);扫描安装信息不依赖固定实例名 |

   注意:`/INSTANCEDIR` 与 `/SQLUSERDBDIR` 不能同目录(官方明确的权限坑,SQL Agent/全文搜索会失败);`/INSTALLSHAREDDIR`(共享组件)建议**保持默认不预填**——共享组件是整机级、多实例共用的,塞进 FlyEnv 目录会在卸载/多版本场景产生歧义。用户若在向导里改掉预填路径,扫描安装信息阶段以注册表实际值为准,不受影响。
3. **扫描安装信息**:安装完成后通过注册表(`HKLM\SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names`,实例名 → `MSSQLxx.<实例ID>`,再读对应 `Setup` 键拿版本与路径)发现实例与版本,走现有 `versionLocalFetch` 本地扫描模式注册为本地版本,之后由 fork 模块管理 FlyEnv 自己启动的服务；不接管外部已运行实例。

预填参数的价值:程序与数据落在 FlyEnv 目录约定下,卸载、磁盘占用展示、备份入口、日志查看等现有 UI 能力可以直接复用;同时保留了"用户手动安装"的合规形态(参数只是默认值,EULA 仍由用户亲手接受)。

---

## 服务与初始化流程

SQL Server 的首次初始化由环境变量完成,比 MySQL 的两段式(`--initialize-insecure` + `mysqladmin password`)更简单:

```bash
# Linux(解包后)
ACCEPT_EULA=Y \
MSSQL_SA_PASSWORD='<强密码>' \
MSSQL_PID=Developer \
MSSQL_TCP_PORT=1433 \
/opt/mssql/bin/sqlservr
```

```powershell
# Windows Express 服务实例在 install 阶段完成初始化;
# LocalDB: sqllocaldb create MSSQLLocalDB; sqllocaldb start MSSQLLocalDB
```

sa 密码有强度要求(至少 8 位,含大小写、数字、符号中的三类),弱密码会导致初始化静默失败,UI 需前端校验。排序规则(`MSSQL_COLLATION`)、语言、内存上限(`mssql-conf set memory.memorylimitmb`)可作为高级配置项。

客户端工具:`sqlcmd` / `bcp` 在 Linux 上是独立包(mssql-tools18),Windows 随安装器可选;FlyEnv 的"终端/命令行"入口可以直接指向它。Web 管理面板可复用 MongoDB 模块的先例:MongoDB fork 模块已集成 DbGate 伴随面板,而 DbGate 原生支持 SQL Server,几乎零成本复用。

---

## 在线版本清单与下载源(已明确:插件内直解官方源)

`fetchAllOnlineVersion` 在插件内直接解析微软官方源,与 kafka(解析 Apache CDN/archive)、llamacpp(解析 GitHub Releases,`plugins/llamacpp/fork/LlamaCpp/index.ts:80`)两个插件同模式,不依赖 api.one-env.com 清单配合:

- **Windows**:Express 各主版本的 `download.microsoft.com` 直链(完整媒体 ISO/CAB;LocalDB 为 `SqlLocalDB.msi` 直链)是稳定的,内置 2019/2022/2025 少量已知版本 + 在线校验。
- **Linux**:`packages.microsoft.com` 的 apt/yum 仓库元数据公开可解析(Packages 索引/primary.xml),可列出各 CU 版本与 deb/rpm 直链。
- **macOS(容器路线)**:镜像 tag 清单查 MCR(`mcr.microsoft.com/mssql/server`),复用 Podman/Image 模块已有的 registry 查询能力。

清单每行标注许可类型(Express / Developer)与用途限制。Linux/容器路线的 `ACCEPT_EULA` 由插件注入,安装前必须显式呈现 EULA 并由用户接受,不要默认代用户接受。

---

## FlyEnv 现有基础与产品边界

- 代码库中目前**没有任何** SQL Server 痕迹(全仓库 grep 仅命中无关文案);`plugins/registry.json` 也无相关条目。
- 数据库模块模式成熟:MySQL(1492 行)、PostgreSQL(1154 行)覆盖 static 包安装、Homebrew、数据目录初始化、密码管理、组实例、备份;Base 基类(`src/fork/module/Base/index.ts`)提供下载/解压/版本获取骨架。
- **插件机制完全够用**:`plugins/` 已有 kafka、llamacpp、mailpit、opensearch 四个先例;插件 `moduleType` 可用 `dataBaseServer`,fork 模块可继承 Base,渲染层可复用宿主的 ServiceManager/VersionManager/Conf/Log 组件,持久化走 `StorageGetAsync`/`StorageSetAsync`,无需进 `AppModuleEnum`、无需动 `ServerPath.ts`、无需补 25+ 语言文件。注意插件安装/更新需要有效 FlyEnv license。
- macOS 容器路线有现成依托:FlyEnv 已有 Podman 模块和镜像管理(`src/fork/module/Podman/`、`src/fork/module/Image/`),MSSQL 插件可以检测 Podman 是否可用并代为创建容器,而不是自己实现容器运行时。

### 建议的接入层次

**第一步:Windows + Linux 插件。**
- Windows:版本清单直解 `download.microsoft.com`;`installSoft` = 下载完整媒体并拉起 `setup.exe`(预填 FlyEnv 路径参数,不静默);`allInstalledVersions` 扫注册表发现实例;`_startServer`/`_stopService` 管理服务(首期按 Windows 服务方式启停,`-c` 用户态模式作为增强)。
- Linux:版本清单解析 `packages.microsoft.com`;`installSoft` 下载并校验 deb，在临时目录解包和写 manifest 后原子发布(前置 EULA 勾选);`_startServer` 通过 Bubblewrap 启动 `sqlservr` + 环境变量注入,数据目录 `server/mssql/data-<主版本>`。
- sa 密码存 localForage(参考 MySQL `Manage/manage.ts` 的 `userPassword` 模式);内存 ≥2 GB 预检放安装页。

**第二步:macOS 容器支持。** 插件检测 Podman/容器运行时可用性,封装 `mcr.microsoft.com/mssql/server` 镜像的拉取、`ACCEPT_EULA`/`MSSQL_SA_PASSWORD` 注入、端口映射和数据卷,对外呈现为同一个 MSSQL 模块的实例。Apple Silicon 明确标注"经 x64 模拟运行,性能受限"。

**第三步(可选):LocalDB 与连接管理。** Windows 加 LocalDB 轻量实例;管理面板接 DbGate;`sqlcmd` 终端入口。

三步可独立上线。若用户群主要是 Windows/.NET 开发者,第一步的 Windows 半边即可覆盖大部分价值。

---

## 服务生命周期和状态归属建议

- Fork 模块拥有 `sqlservr` 进程、PID、端口(默认 1433)、存活状态和退出清理;Windows 侧首期按服务方式启停,服务控制由 fork 发起。
- 可跨页面继续的操作(安装器运行期间、Linux 包下载解包),由模块级 controller 持有进度与终止事件;安装器被拉起后是独立进程,controller 只跟踪"已拉起/等待扫描"状态,不假装拥有安装器内部进度。
- 启停优先走 `ModuleInstalledItem.start()`/`stop()`/`restart()`;版本特有参数(排序规则、内存上限)通过 `startExtParam` 注册。
- 模块数据用 `StorageSetAsync`/`StorageGetAsync` 持久化;不新建 Pinia store;不写 `config.setup`。
- 容器路线的容器生命周期属于 fork 模块,不由 renderer 临时标志代表。

---

## 数据与许可

- SQL Server 为闭源商业软件。Express 版免费且允许再分发(需注册);Developer 版免费但仅限开发测试、禁止再分发与生产使用;Standard/Enterprise 为付费许可。
- 下载一律从微软官方 URL 直下;Windows 侧 EULA 由用户在官方安装向导中亲手接受,Linux/容器侧由插件在安装前显式呈现并要求勾选。
- 版本清单中标注每行的许可类型(Express / Developer)与用途限制。
- 数据目录与程序分离,Windows 通过预填 `/INSTANCEDIR` + `/INSTALLSQLDATADIR` 等参数落到 `app/mssql/<version>/` 与 `server/mssql/`,Linux 解包时直接按此布局落盘。

---

## 主要风险

- **平台覆盖断层**:macOS 无原生版本是最大缺口(存量 Azure SQL Edge 已退役,Apple Silicon 只能 x64 模拟);Windows/Linux ARM64 均不支持。三平台体验不一致,与 FlyEnv 其他数据库模块的"全平台一致"体验有差距。
- **许可合规**:合规面收敛为两点——Linux/容器侧 EULA 必须由用户显式接受;Developer 版需在清单中标注"仅开发测试"。这是本项目首次集成闭源商业软件,与其他模块(全开源)性质不同。
- **资源门槛**:2 GB 内存硬限制、6 GB 磁盘,低配开发机可能无法运行,安装页需预检提示。
- **Windows 安装扫描的边界**:预填参数只是向导默认值,用户可改实例名、端口、认证模式、路径,扫描逻辑要容忍任意实例名与多实例,以注册表实际值为准;`sqlservr -c` 用户态直跑会撞数据目录 ACL(setup 恒授服务账户 SID),首期按服务方式启停可避开；仅管理 FlyEnv 自己启动的 PID，外部已运行实例提示冲突，不接管、不停止。
- **Linux 解包为非官方用法**:发行版兼容性(OpenSSL/glibc)、CU 更新节奏都需要持续维护;微软只承诺 RHEL/Ubuntu/SLES。

## 最终判断

SQL Server 可以集成进 FlyEnv,但它不像 llama.cpp 那样"一个 Release 包全平台通吃":**Windows 和 Linux x64 可做到与其他数据库模块同级的原生体验,macOS 只能走容器**。按已明确的决策,Windows 侧是"下载完整媒体 + 拉起 setup.exe(预填 FlyEnv 路径参数) + 注册表扫描安装信息"的轻量集成(零提权代码、零安装器开发),Linux 侧是 deb 解包后通过 Bubblewrap 隔离实例目录运行,版本清单全部插件内直解官方源。建议以插件形式实现,先 Windows/Linux、后 macOS 容器,LocalDB 与 DbGate 面板作为后续增强。若团队资源只够做一半,优先 Windows——SQL Server 的目标用户(.NET/Windows 生态开发者)集中在那里。
