# FlyEnv Open Issues 处理方案盘点

数据快照：2026-05-25 20:24:54 CST  
数据来源：GitHub REST API `/repos/xpf0000/FlyEnv/issues?state=open&per_page=100`  
范围说明：API 返回 32 个 open 条目，其中 `#688`、`#686`、`#683` 是 PR，本文排除 PR 后逐项分析 29 个 open issue。  
任务边界：本次只做方案，不修改业务代码。

## 总览

| Issue | 类型 | 可处理性 | 建议优先级 | 结论 |
| --- | --- | --- | --- | --- |
| [#690](https://github.com/xpf0000/FlyEnv/issues/690) MySQL 点击启动后窗口卡住 | bug | 可部分处理，根因需复现 | P0 | 先补崩溃日志和 MySQL 启动诊断，避免主窗口空白后无信息可查。 |
| [#689](https://github.com/xpf0000/FlyEnv/issues/689) 在 thaw 中使用的问题 | 兼容性 | 需更多信息 | P3 | 很可能与第三方 Thaw 的应用识别规则有关，先确认 bundle id、规则和复现路径。 |
| [#687](https://github.com/xpf0000/FlyEnv/issues/687) CLI support and automatic framework detection | feature | 可处理，范围较大 | P2 | 建议分阶段做 CLI，本质是让 CLI 复用现有 GUI/Fork 能力。 |
| [#685](https://github.com/xpf0000/FlyEnv/issues/685) Ollama 下载卡住/取消/外部下载 | UX/feature | 可直接处理 | P1 | 先补取消、重试、复制命令、代理提示；外部包导入不建议作为第一期。 |
| [#684](https://github.com/xpf0000/FlyEnv/issues/684) Flutter Android SDK 是否单独安装 | UX/feature | 可直接处理 | P1 | 当前 Android 页只检测和修复，缺少 SDK 缺失时的安装引导。 |
| [#680](https://github.com/xpf0000/FlyEnv/issues/680) pgAdmin on browser | feature | 可处理，中等范围 | P2 | 建议新增 pgAdmin 服务模块，浏览器打开本地 pgAdmin。 |
| [#675](https://github.com/xpf0000/FlyEnv/issues/675) Persian language | i18n | 可处理但依赖翻译质量 | P3 | Crowdin 已有 fa 项目，等人工校对后再入库。 |
| [#672](https://github.com/xpf0000/FlyEnv/issues/672) 随机身份证/手机号/银行卡工具 | tool | 可直接处理 | P1 | 新增 Tools 模块，生成测试数据并支持复制/批量导出。 |
| [#669](https://github.com/xpf0000/FlyEnv/issues/669) 大模型切换工具 | feature | 可处理，中等范围 | P2 | 建议基于 CLIProxyAPI/OpenClaw/Hermes 做统一模型 Profile 切换。 |
| [#655](https://github.com/xpf0000/FlyEnv/issues/655) Gitflow branching model | process | 需维护者决策 | P4 | 不是应用 bug，适合作为仓库流程/翻译流程决策。 |
| [#653](https://github.com/xpf0000/FlyEnv/issues/653) NexaSDK | feature | 信息不足 | P4 | issue 缺少期望场景和集成形态，暂不建议直接开工。 |
| [#648](https://github.com/xpf0000/FlyEnv/issues/648) Plexum + Cloudflare quick tunnels | feature | 可处理但需产品决策 | P3 | 建议先做 Cloudflare quick tunnel，再评估 Plexum 作为可选高级能力。 |
| [#636](https://github.com/xpf0000/FlyEnv/issues/636) 菜单风格切换后 IDE/AdBlock 插件出错 | bug | 可部分处理，需复现 | P1 | 加强 tray window 重建和崩溃日志；先让用户确认最新版是否仍复现。 |
| [#633](https://github.com/xpf0000/FlyEnv/issues/633) Python 环境变量问题 | bug | 可直接处理 | P1 | 选中 `python3.x` 时应提供 `python`/`python3` shim 或软链。 |
| [#626](https://github.com/xpf0000/FlyEnv/issues/626) MinIO 下载备选地址 | feature | 可直接处理 | P1 | 当前只用官方 `dl.min.io`，可加 pgsty/minio 备选源和失败回退。 |
| [#608](https://github.com/xpf0000/FlyEnv/issues/608) Windows Server 2022 无法启动 PostgreSQL 18 | bug | 可直接处理 | P0 | Windows `initdb` 当前后台执行后只等 1s，需改为同步执行并捕获错误。 |
| [#605](https://github.com/xpf0000/FlyEnv/issues/605) nanobrew 搜索支持 | feature/bug | 可直接处理 | P1 | 本地版本扫描应使用实际 `brew --cellar`/`brew --prefix`，而不是硬编码 Cellar。 |
| [#587](https://github.com/xpf0000/FlyEnv/issues/587) 静态 PHP 缺少 pdo_sqlite | package | 可处理但依赖包构建 | P2 | 需要重建/替换静态 PHP 包，并加安装后扩展校验。 |
| [#585](https://github.com/xpf0000/FlyEnv/issues/585) Fedora GNOME 托盘菜单位置错误 | bug | 可直接处理 | P1 | tray 弹窗定位应按托盘所在 display 计算并做边界钳制。 |
| [#557](https://github.com/xpf0000/FlyEnv/issues/557) PHP/PostgreSQL 配置错误 | bug | 可直接处理部分问题 | P0 | PHP `upload_max_filesize` 重复是明确 bug；PostgreSQL 注释重复应先确认来源。 |
| [#549](https://github.com/xpf0000/FlyEnv/issues/549) PHP 环境变量问题 | bug | 可直接处理 | P1 | PATH 更新策略应优先真实 bin 目录，避免 FlyEnv shim 意外覆盖 Homebrew。 |
| [#546](https://github.com/xpf0000/FlyEnv/issues/546) Bulgarian language support | i18n | 基本已处理，需验证 | P3 | 代码里已有 `bg` 语言目录和注册；剩余是 Crowdin/完整性确认。 |
| [#543](https://github.com/xpf0000/FlyEnv/issues/543) 备注功能 | UX/feature | 可直接处理 | P1 | Host 已有备注，问题截图更像版本列表备注，应给已安装版本增加 note。 |
| [#483](https://github.com/xpf0000/FlyEnv/issues/483) PHP 7.2 Phalcon 组件 | package/feature | 可处理但依赖二进制校验 | P2 | 可把用户提供包加入扩展库，但需要 ABI/平台验证。 |
| [#457](https://github.com/xpf0000/FlyEnv/issues/457) Crowdin Project | i18n/process | 可处理但需 secret | P3 | 可加 Crowdin 配置和 Action，需要项目 token/secret。 |
| [#448](https://github.com/xpf0000/FlyEnv/issues/448) push app to scoop | release | 可处理但需发布策略 | P3 | 可做 Scoop bucket/manifest 自动更新，需要确认 bucket 归属。 |
| [#442](https://github.com/xpf0000/FlyEnv/issues/442) Laravel 创建项目自定义 | feature | 可处理，中等范围 | P2 | 扩展现有 PHP 项目创建向导，做跨平台 Laravel 选项。 |
| [#440](https://github.com/xpf0000/FlyEnv/issues/440) ZincSearch support | module | 可直接处理 | P2 | 按 MeiliSearch/Typesense 模式新增 ZincSearch 模块。 |
| [#421](https://github.com/xpf0000/FlyEnv/issues/421) frp support | module | 可处理，范围较大 | P2 | 新增 frp/frpc 模块并与 Host 列表映射入口打通。 |

## 建议分批

第一批建议先处理高确定性 bug：`#557`、`#608`、`#549`、`#633`、`#585`，同时给 `#690` 和 `#636` 补崩溃日志与复现诊断。

第二批处理小到中等的产品改进：`#685`、`#684`、`#626`、`#605`、`#672`、`#543`。

第三批处理新增模块或大功能：`#680`、`#687`、`#669`、`#440`、`#421`、`#442`。

第四批等资源或维护者决策：`#648`、`#653`、`#655`、`#675`、`#546`、`#457`、`#448`、`#483`、`#587`、`#689`。

## 逐项方案

### #690 MySQL 点击启动后，会出现窗口卡住

判断：可部分处理，但根因需要复现。用户描述 macOS 26.3.1 启动 MySQL 后 FlyEnv 窗口空白，同时 Chrome、VSCode 标签也会崩溃，这更像 Electron/Chromium/GPU、系统资源或底层进程触发的连带崩溃，不像单纯 MySQL 配置错误。

相关代码：
- `src/fork/module/Mysql/index.ts`：MySQL 启动、初始化、停止逻辑集中在这里。
- `src/main` 当前没有检索到 `render-process-gone`、`unresponsive`、`gpu-process-crashed` 等崩溃日志钩子。

处理方案：
1. 在主进程窗口创建处补充 `render-process-gone`、`unresponsive`、`child-process-gone`、`gpu-process-crashed` 日志，记录正在执行的服务动作、Electron 版本、GPU 信息、平台版本。
2. MySQL 启动按钮保持非阻塞，启动期间只禁用当前按钮并展示 fork 进度，避免 renderer 等待链路导致窗口空白后无反馈。
3. 启动失败时自动收集 `mysql/error.log`、`mysql.pid`、`my-*.cnf`、数据目录状态、端口占用和 `mysqld` 退出码。
4. 在 macOS 26.x 上做专项复现：分别测试 Homebrew/MySQL 官方包/FlyEnv static 包，确认是否只在某类二进制上触发。
5. 如果崩溃日志指向 GPU/Chromium，可增加诊断开关，例如禁用 GPU 或禁用 xterm WebGL addon 后重测。

验收点：
- MySQL 启动失败时 FlyEnv 主窗口不空白。
- 日志能明确给出是 `mysqld` 启动失败、renderer 崩溃还是 GPU/系统级崩溃。
- macOS 26.3.x 至少有一份可复现日志后再做根因修复。

### #689 在 thaw 中使用的问题

判断：暂不建议直接开工，需更多复现信息。现象是 FlyEnv 更新后被 Thaw 放进隐藏列表，重启应用或重启 macOS 不触发，用户猜测是 Bundle Identifier 或 Accessibility 标题变化。

相关代码：
- `configs/electron-builder.ts` macOS `appId` 当前是 `phpstudy.xpfme.com`。
- `configs/electron-builder.linux.ts` 使用了不同的 `appId`，但该 issue 是 macOS 场景。

处理方案：
1. 先向用户确认 Thaw 版本、规则匹配方式、FlyEnv 更新前后 Thaw 记录里的 bundle id/name/title。
2. 检查 macOS 包的 `CFBundleIdentifier`、`CFBundleName`、`CFBundleDisplayName` 是否在近期版本中发生变化。
3. 如果 FlyEnv 更新流程导致应用签名或 bundle id 变化，修正打包配置并保持后续版本稳定。
4. 如果只是 Thaw 缓存或第三方规则问题，给 issue 回复排查结论，不在 FlyEnv 内做 workaround。

验收点：
- 更新前后 `mdls -name kMDItemCFBundleIdentifier` 输出一致。
- Thaw 不再把同一 FlyEnv 版本升级后的应用误判为新隐藏对象。

### #687 CLI support and automatic framework detection

判断：可处理，但范围较大。建议拆成 2 到 3 期，避免 CLI 单独维护一套服务逻辑。

相关代码：
- `src/fork/BaseManager.ts` 已有所有模块 IPC 分发。
- `src/render/components/Host/CreateProject/*` 已有创建项目流程。
- 当前未发现独立 `flyenv` CLI 包或 `bin` 入口。

处理方案：
1. 第一期做 CLI 基础框架：新增 `flyenv` 命令，只负责连接正在运行的 FlyEnv 本地 IPC/localhost socket，不直接重复实现服务管理。
2. 支持只读命令：`flyenv status`、`flyenv services`、`flyenv versions php`、`flyenv env current`。
3. 支持低风险写命令：`flyenv service start mysql`、`flyenv service stop mysql`、`flyenv host reload`。
4. 自动框架检测单独抽象：扫描 `composer.json`、`artisan`、`package.json`、`vite.config.*`、`manage.py`、`go.mod`、`pubspec.yaml` 等文件，输出标准 `framework/type/root/publicDir`。
5. 第二期再做 `flyenv host add --auto /path/to/project`、`flyenv park /workspace`、`flyenv env use php@8.3`。
6. CLI 安全模型：只允许本机用户访问，写操作要求本地 token 或 Electron app 生成的短期授权。

验收点：
- CLI 和 GUI 对同一个服务/Host 的状态一致。
- 关闭 GUI 时 CLI 给出明确提示，而不是静默失败。
- 自动检测 Laravel/Vite/Node/Python/Flutter 项目有稳定测试样例。

### #685 Ollama 下载过程中卡住不动

判断：可直接处理。现有 Ollama 模型下载使用 xterm 执行 `ollama pull`/`rm`，`XTerm.stop()` 已具备停止 PTY 的能力，但下载页缺少清晰的取消入口和失败恢复。

相关代码：
- `src/render/components/Ollama/models/all/setup.ts`：生成 `ollama pull`/`rm` 命令并挂载 xterm。
- `src/render/util/XTerm.ts`：已有 `stop()`。
- `src/render/components/Ollama/models/setup.ts`：切换页面时会调用 `xterm.stop()`。

处理方案：
1. 在模型下载中的 xterm 面板加入固定 footer：取消、复制命令、重试、完成确认。
2. 取消按钮调用 `OllamaAllModelsSetup.xterm.stop()`，并重置 `installing/installEnd` 状态。
3. 下载失败时展示代理设置入口，提醒 FlyEnv 的代理配置会注入命令环境。
4. 保留“复制命令”作为外部终端执行方式。
5. 不建议第一期支持“迅雷下载后导入模型包”：Ollama 模型存储是全局内容寻址目录，直接导入容易破坏 manifest/blob 一致性。可以先支持“打开 Ollama 模型目录”和文档说明。

验收点：
- 下载中能取消，取消后 UI 不再卡在 installing。
- 用户能复制同一条 `ollama pull` 命令到外部终端。
- 代理配置在下载命令中实际生效。

### #684 Flutter 里面 Android SDK 是要单独安装吗

判断：可直接处理。当前 Android 页主要做检测和修复，SDK 不存在时只返回“未找到”，缺少首次使用引导。

相关代码：
- `src/fork/module/Flutter/android.ts`：`_detectAndroidSdkDir`、`androidReadiness`、`androidAutoFix`。
- `src/render/components/Flutter/AndroidToolchain.vue`：Android Toolchain UI。
- `src/lang/en/flutter.json`、`src/lang/zh/flutter.json`：当前没有完整安装引导文案。

处理方案：
1. 当 `androidReadiness` 返回 SDK 缺失时，在 Android 页展示 empty state：说明需要 Android Studio 或 Android command-line tools。
2. 加入按钮：打开 Android Studio 下载页、打开 command-line tools 下载页、刷新检测。
3. 已检测到 SDK 但缺少 `platform-tools`/`cmdline-tools`/`build-tools` 时，给出更具体的 SDK Manager 安装项提示。
4. 第二期可做自动安装：下载 command-line tools，初始化 SDK 目录，执行 `sdkmanager "platform-tools" "cmdline-tools;latest" "build-tools;xx"`，但这会带来 license 接受和下载源问题，建议单独拆。

验收点：
- 首次安装 Flutter 后进入 Android 页，用户能明确知道还需要安装 Android SDK。
- 安装完 SDK 后 `Auto-fix` 能设置 `ANDROID_HOME`、`ANDROID_SDK_ROOT` 和 `platform-tools` PATH。

### #680 Request feature pgAdmin on browser

判断：可处理，中等范围。pgAdmin 可以作为独立服务模块加入，但需要控制 Python/依赖和首次初始化复杂度。

处理方案：
1. 新增 `pgadmin` 模块，按 FlyEnv 服务模块规范提供安装、启动、停止、日志、配置。
2. 安装方式优先评估可维护性：内置 Python venv + `pgadmin4` pip 包，或平台官方包/二进制。
3. 生成默认配置：本地监听地址、端口、默认管理员邮箱、初始密码、数据目录。
4. UI 提供“打开浏览器”按钮，打开 `http://127.0.0.1:<port>`。
5. 可选增强：读取 FlyEnv PostgreSQL 已安装版本和端口，自动生成 pgAdmin server registration。

验收点：
- 三个平台至少一个平台先跑通安装和浏览器访问。
- 停止 pgAdmin 后端口释放，日志可查看。
- 初始账号密码不会硬编码暴露，用户可修改。

### #675 Persian Package language for FlyEnv

判断：可处理但依赖翻译质量。Crowdin 评论里已有 `fa` 项目，但也有反馈称机器翻译语义不准确。

处理方案：
1. 暂不直接把机器翻译导入仓库。
2. 等 Persian 贡献者在 Crowdin 完成主要文件人工翻译和校对。
3. 导入时新增 `src/lang/fa` 目录、`index.ts` 汇总文件，并在 `src/lang/index.ts` 的 `AppAllLang` 注册 `fa: 'فارسی'`。
4. 增加语言完整性检查：以 `src/lang/en` 为基准，检查 `fa` 是否缺 key、是否多 key。
5. UI 走一轮基础冒烟：设置页切换语言、主要模块无空白 key。

验收点：
- `fa` 语言包 key 完整。
- 至少由 Persian speaker 确认主要页面语义可用。

### #672 随机生成身份证号，手机号，银行账号等信息的工具

判断：可直接处理，适合作为 Tools 新模块。

相关代码：
- `src/render/core/AppTool.ts` 会自动加载 `src/render/components/Tools/*/Module.ts`。
- 现有 Tools 模块可作为结构参考。

处理方案：
1. 新增 `Tools/FakeDataGenerator` 模块。
2. 支持类型：身份证号、手机号、银行卡号、姓名、邮箱、地址、统一社会信用代码。第一期优先实现 issue 中提到的三类。
3. 身份证号按地区码、生日、顺序码、校验位生成；银行卡号使用 Luhn 校验；手机号按运营商号段生成。
4. UI 支持生成数量、地区/年龄范围/性别、复制单项、复制表格、导出 CSV/JSON。
5. 明确标记为测试数据，避免被误用为真实身份信息。

验收点：
- 身份证和银行卡校验位通过本地校验。
- 批量生成 1000 条不卡顿。
- 复制和导出结果格式稳定。

### #669 大模型切换工具

判断：可处理，中等范围。FlyEnv 已有 `cliproxyapi`、`openclaw`、`hermes` 等 AI/CLI 相关模块，建议不要另起一套孤立配置。

处理方案：
1. 新增“模型 Profile”概念：provider、baseURL、apiKey 引用、model、场景标签、优先级。
2. 第一阶段支持 OpenAI-compatible provider 和 Claude Code 常用环境变量导出。
3. UI 提供当前模型、快速切换、测速/健康检查、成本/速度标签。
4. 与 `CLIProxyAPI` 配置联动：切换 Profile 后可写入代理配置或生成 `.env`。
5. 支持按工具生成命令片段：Claude Code、OpenAI SDK、LangChain、curl。

验收点：
- 切换后当前默认模型状态可见。
- 终端工具使用生成的环境变量后能命中目标 provider/model。
- API key 不明文写入不必要的位置，至少使用现有配置安全策略。

### #655 Adopt Gitflow branching model

判断：不是应用代码问题，需要维护者决策。

处理方案：
1. 如果项目需要稳定翻译窗口，可采用轻量 Gitflow：`master/main` 只放 release，`develop` 收功能，`release/*` 做冻结和翻译，`hotfix/*` 修生产问题。
2. GitHub Actions 按分支区分：`develop` 构建 preview，`release/*` 同步 Crowdin，tag 才发布正式包。
3. 更新贡献文档，说明 PR 目标分支和翻译冻结周期。
4. 如果维护者希望保持单分支快速迭代，则关闭该 issue 并说明项目目前暂不采用 Gitflow。

验收点：
- 仓库有明确分支策略文档。
- 发布和翻译同步不会互相阻塞。

### #653 NexaSDK

判断：信息不足，暂不建议直接开工。issue 只描述 NexaSDK 支持新模型架构，没有说明希望 FlyEnv 提供安装、服务管理、模型管理还是 UI 集成。

处理方案：
1. 回复 issue 询问期望场景：安装 SDK、运行本地模型、模型下载、API server、还是与现有 AI 模块联动。
2. 调研 NexaSDK 的平台支持、安装方式、CLI/API 稳定性、模型目录格式。
3. 如果有稳定 CLI 和跨平台包，再按 FlyEnv 模块规范新增 `NexaSDK`。
4. 如果只是 Python SDK，建议先作为文档/命令集，而不是服务模块。

验收点：
- 明确集成范围后再排期。

### #648 Plexum integration for Cloudflare quick tunnels

判断：可处理但需要产品决策。现有 CloudflareTunnel 更偏 named tunnel，quick tunnel 和 Plexum 是不同层级。

相关代码：
- `src/fork/module/CloudflareTunnel/CloudflareTunnel.ts` 当前使用 `cloudflared tunnel --no-autoupdate run --token ...`。
- `src/fork/module/Cloudflared/index.ts` 管理 `cloudflared` 二进制。

处理方案：
1. 第一阶段先支持 Cloudflare quick tunnel：执行 `cloudflared tunnel --url http://127.0.0.1:<port>`，解析 stdout 中的临时公网 URL，展示状态和日志。
2. 与 Host 列表联动：给站点添加“Quick Tunnel”开关，自动指向本地站点端口。
3. 第二阶段再评估 Plexum：作为可选增强，不默认注入 Service Worker 或外部 failover。
4. 若引入 Plexum，必须明确隐私、外部服务依赖、生成的 Worker 内容、用户授权和关闭路径。

验收点：
- quick tunnel 单站点可一键启动/停止，并能复制公网 URL。
- 无 Cloudflare 账号场景也能使用 quick tunnel。
- Plexum 相关能力必须默认关闭、显式启用。

### #636 v4.14.2 菜单风格切换后 IDE/AdBlock 插件出错

判断：可部分处理，需要复现。评论里维护者已让用户“最新版本再试下”，建议先确认是否仍存在。

相关代码：
- `src/main/Application.ts`：tray style 切换逻辑。
- `src/main/ui/TrayManager.ts`：现代 tray window 点击和定位。
- 当前未检索到主进程对 renderer/tray window 崩溃事件的统一记录。

处理方案：
1. 先让用户确认最新版本是否仍复现，并提供系统版本、Edge 版本、FlyEnv 日志。
2. 给现代 tray window 增加 `render-process-gone`、`did-fail-load`、`unresponsive` 日志。
3. 切换 classic/modern 时，确保旧 tray window 已关闭、事件监听已移除、再创建新 window。
4. 切换后延迟一次健康检查：如果 modern tray window 加载失败，自动回退 classic 并提示。
5. 如果报错实际来自 Edge 扩展而非 FlyEnv，给出排查说明并关闭。

验收点：
- 连续切换菜单风格不会弹出插件错误。
- 出错时 FlyEnv 能记录是 tray window 加载失败还是外部浏览器扩展错误。

### #633 Python 环境变量存在问题

判断：可直接处理。用户反馈选中的可执行文件是 `python3.11`，PATH 中虽然有目录，但 `python3` 被 Homebrew 或系统 Python 抢先命中。

相关代码：
- `src/fork/module/Python/index.ts`：非 Windows 扫描 `libexec/bin/python`、`bin/python3`。
- `src/fork/module/Tool/path.ts`：统一 PATH 更新逻辑。

处理方案：
1. 对 Python 单独生成 shim 目录，例如 `env/python/bin/python`、`env/python/bin/python3`、`env/python/bin/python3.11` 都指向当前选择的真实 binary。
2. PATH 写入 shim 目录，而不是只写安装根目录。
3. 切换 Python 版本时原子更新 shim，避免残留旧版本。
4. 保留真实 binary 路径展示，方便用户确认当前版本来自哪里。

验收点：
- 添加环境变量后 `python --version`、`python3 --version` 都指向 FlyEnv 当前选择版本。
- 切换版本后新终端生效。

### #626 MinIO 下载备选地址

判断：可直接处理。当前 MinIO 模块下载 URL 固定为官方 `dl.min.io`。

相关代码：
- `src/fork/module/Minio/index.ts`：macOS/Linux/Windows 都直接拼接官方下载地址。

处理方案：
1. 增加下载源枚举：`official`、`pgsty`。
2. 默认仍用 official，下载失败时可自动回退 pgsty，或者在 UI 中让用户选择。
3. 根据 pgsty/minio release asset 命名补平台映射，避免只改 URL 字符串。
4. 记录安装来源到 `SoftInstalled.flag` 或扩展字段，后续更新时沿用同源。
5. 错误提示区分“官方源不可达”和“备选源无对应平台包”。

验收点：
- 官方源失败时可以从 pgsty 源安装。
- 三个平台 URL 映射清晰，不误下载错误架构。

### #608 Windows Server 2022 Standard 无法启动 PostgreSQL 18

判断：可直接处理。当前 Windows 初始化数据目录用 `start /B initdb.exe ... &` 后只等 1 秒检查 `postgresql.conf`，容易在慢机器/Server 环境误判失败，也吞掉 stderr。

相关代码：
- `src/fork/module/Postgresql/index.ts`：Windows 分支中 `initdb.exe` 通过后台命令启动。

处理方案：
1. Windows 初始化改为同步执行：`spawnPromiseWithEnv(initDB, ['-D', dbPath, '-U', 'root'], { cwd: binDir, shell: false })`。
2. 不再使用 `process.chdir` 影响全局进程；所有命令传 `cwd`。
3. 捕获 stdout/stderr 并写入 FlyEnv 日志。
4. 只有 `initdb` 进程成功退出后再检查 `postgresql.conf`。
5. 失败时保留数据目录和日志，不要只返回 `Data Dir create faild`。

验收点：
- Windows Server 2022 上 PostgreSQL 18 初始化不再因 1 秒等待误失败。
- 如果 `initdb` 真失败，日志能显示具体 stderr。

### #605 nanobrew 安装软件搜索支持

判断：可直接处理。当前本地版本扫描硬编码 Homebrew Cellar 路径，对 nanobrew 或自定义 brew 前缀不友好。

相关代码：
- `src/main/utils/CheckBrew.ts` 已能读取 `brew --cellar` 到 `global.Server.BrewCellar`。
- `src/fork/util/Version.ts` 扫描时仍硬编码 `/usr/local/Cellar`、`/opt/homebrew/Cellar`、`/home/linuxbrew/.linuxbrew/Cellar`。

处理方案：
1. `versionLocalFetch` 使用 `global.Server.BrewCellar` 作为首选 Cellar。
2. 额外读取 `brew --prefix`，推导 `${prefix}/Cellar`、`${prefix}/opt`。
3. 允许用户在设置里增加自定义 brew/nanobrew Cellar 路径。
4. 修正 Linux 分支把 `~/.linuxbrew/bin/brew` 当 Cellar 路径加入的错误。
5. 缓存按 Cellar 路径区分，避免不同 brew 源互相污染。

验收点：
- nanobrew 安装的软件能在版本管理里被扫描到。
- Homebrew、Linuxbrew、nanobrew 同时存在时不会重复或误判。

### #587 默认静态 PHP 包没有 pdo_sqlite

判断：可处理但依赖静态包构建资源。这个不是简单 ini 开关问题，如果二进制包没有编译 `pdo_sqlite`，应用层无法凭空启用。

相关代码：
- `static/tmpl/macOS/php.ini`、Linux 模板目前只看到 SQLite 配置段，不代表扩展存在。
- Windows PHP 初始化里会在 dll 存在时启用 `php_pdo_sqlite.dll`、`php_sqlite3.dll`。

处理方案：
1. 先用 `php -m`、`php --ini`、`php -i` 验证 static `PHP-8.2.30` 是否真的没有 `pdo_sqlite`。
2. 如果缺失，重建 static PHP 包，编译启用 `pdo_sqlite` 和 `sqlite3`。
3. 安装/切换 PHP 后增加扩展检查，如果 ini 启用了不存在的扩展，给出明确错误。
4. 对 Kanboard 这类常见应用可以在 PHP 扩展页展示依赖提示。

验收点：
- static PHP 8.2.30 在 macOS 上 `php -m` 能看到 `PDO`、`pdo_sqlite`、`sqlite3`。
- Kanboard 不再因缺少 `pdo_sqlite` 报错。

### #585 Fedora43 GNOME 托盘菜单显示到屏幕左侧

判断：可直接处理。当前现代 tray 弹窗定位只使用主屏宽度，没有按托盘所在 display 计算。

相关代码：
- `src/main/ui/TrayManager.ts`：`handleTrayClick` 使用 `screen.getPrimaryDisplay().workAreaSize.width` 和 `tray.getBounds()`。

处理方案：
1. 使用 `screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y })` 获取托盘所在屏幕。
2. 以该 display 的 `workArea` 计算 x/y，而不是只用主屏 `workAreaSize.width`。
3. 对 Linux/GNOME/Wayland 下 `tray.getBounds()` 返回 0 或异常的情况增加 fallback：使用鼠标位置或 workArea 右上角。
4. 对弹窗宽高做边界钳制，避免出屏。

验收点：
- Fedora GNOME 多显示器下菜单不再跳到屏幕左侧。
- macOS/Windows 原有位置不回退。

### #557 A few errors in the app

判断：PHP 部分可直接处理。PostgreSQL 配置重复注释按评论看更可能是 PostgreSQL 自己生成，需先确认。

相关代码：
- `src/fork/module/Php/index.ts`：
  - `parse.set('post_max_size', 'post_max_size = 200M', 'PHP')`
  - `parse.set('post_max_size', 'upload_max_filesize = 200M', 'PHP')`
- `src/fork/module/Php.win/index.ts` 有同样问题。

处理方案：
1. 把第二个 key 改为 `upload_max_filesize`，避免覆盖或重复写入。
2. 给 PHP ini 初始化增加一次幂等测试：重复初始化不会产生重复配置。
3. PostgreSQL 相关问题先保留：用 `pg_ctl -D ... start` 生成配置复现，确认是否 FlyEnv 修改造成。

验收点：
- 新生成 PHP ini 中 `post_max_size` 和 `upload_max_filesize` 各只出现一次。
- 重复打开/初始化 ini 不产生重复项。

### #549 PHP 环境变量问题

判断：可直接处理，并建议与 `#633` 一起做。问题核心是 FlyEnv 添加的 `env/php` 和 `env/php/bin` 优先级高于 Homebrew 原路径，用户期望选中 Homebrew PHP 时 PATH 更透明。

相关代码：
- `src/fork/module/Tool/path.ts`：`binPath = dirname(join(item.path, 'bin'))` 实际得到的是安装根目录，再创建 `env/<flag>` 软链。

处理方案：
1. PATH 更新以真实 `dirname(item.bin)` 为核心，而不是安装根目录。
2. 对外部安装来源如 Homebrew/MacPorts，优先把真实 bin 目录写入 PATH；只有 FlyEnv 管理包才使用 `env/<flag>` shim。
3. 如果仍保留 shim，需要让 `env/php/bin/php` 指向当前选中的真实 `php`，并在 UI 明确展示“通过 FlyEnv shim 命中”。
4. 去重和排序：当前选中版本必须在 PATH 中优先于旧版本，但不应产生无效的 `env/php` 根目录优先项。
5. 与 Python 一起抽象成“按服务类型生成 shim”的策略，避免每个语言重复实现。

验收点：
- 用户只配置 Homebrew PHP 时，`which php` 指向选中的 Homebrew PHP 或明确的 FlyEnv shim，版本一致。
- PATH 不再出现无意义且优先级过高的根目录项。

### #546 Bulgarian language support

判断：基本已处理，需验证。代码里已经存在 `src/lang/bg`，并且 `src/lang/index.ts` 已注册 `bg: 'Български'`。

处理方案：
1. 跑语言 key 完整性检查，确认 `bg` 相对 `en` 没有缺 key。
2. 在 Crowdin 确认 Bulgarian 是否已完成主要文件翻译。
3. 如果只剩 offline translation 权限问题，回复 issue 说明已开启并请求确认。
4. 如果翻译已足够完整，可关闭 issue；如果缺失较多，则保留为 Crowdin 翻译任务。

验收点：
- 设置里能选择 Bulgarian。
- 主要页面没有明显 fallback key。

### #543 希望添加备注功能

判断：可直接处理。Host 列表已有备注字段，issue 截图更像“已安装版本/版本管理”位置需要备注，防止误删。

相关代码：
- `src/render/components/Host/*/ListTable.vue` 已有 `mark/comment`。
- `SoftInstalled` 当前未看到统一 note 字段。

处理方案：
1. 为已安装版本增加备注存储，建议单独存 local config/localForage，key 使用 `typeFlag + realpath(bin/path) + version`，避免改动安装目录结构。
2. VersionManager 本地版本表增加“备注”列，支持 inline edit。
3. 删除版本确认弹窗显示备注，降低误删概率。
4. 搜索过滤支持备注内容。
5. 如果后续需要服务页也展示，复用同一备注存储。

验收点：
- 给 PHP/Node/Python 任一版本添加备注后，重启应用仍存在。
- 删除版本时能看到备注。
- 搜索能按备注命中。

### #483 新增 PHP 7.2 Phalcon 组件

判断：可处理但需要二进制校验。用户提供了 Windows x64 VC15 PHP 7.2 和 Linux ARM 包，不能直接入库使用，需确认 ABI、线程安全、PHP API 版本。

处理方案：
1. 下载用户提供的两个包到隔离环境，检查扩展文件名、架构、依赖库、PHP API 版本。
2. 在 PHP Extension 在线库或本地 metadata 中增加对应条目，限定平台、架构、PHP 版本、TS/NTS、VC runtime。
3. 安装后自动写入 ini，并执行 `php -m` 或 `php --ri phalcon` 验证加载。
4. 加失败回滚：扩展加载失败时撤销 ini 修改并提示原因。

验收点：
- Windows PHP 7.2 x64 VC15 能安装并加载 Phalcon。
- Linux ARM 对应版本能加载。
- 不影响其他 PHP 版本扩展列表。

### #457 Crowdin Project for FlyEnv

判断：可处理但需要 Crowdin secret。issue 评论已建议使用 Crowdin GitHub Action。

处理方案：
1. 新增 `crowdin.yml`，保持目录层级：
   - source: `src/lang/en/*.json`
   - translation: `src/lang/%two_letters_code%/%original_file_name%`
2. 新增 GitHub Action：手动触发或定时同步翻译，不建议每次 push 都双向同步。
3. GitHub Secrets 需要配置 `CROWDIN_PERSONAL_TOKEN`、`CROWDIN_PROJECT_ID`。
4. 加同步 PR 策略：Action 只创建 PR，不直接 push master。
5. 同步前跑语言 key 完整性检查。

验收点：
- Crowdin 更新能自动生成翻译 PR。
- PR 中目录结构保持现有 `src/lang/<lang>/*.json`。

### #448 could we push the app to scoop

判断：可处理但需要发布策略和 bucket 归属。

处理方案：
1. 确认使用官方 scoop bucket、项目自建 bucket，还是用户提供的 bucket。
2. 维护 `flyenv.json` manifest：version、url、hash、installer/portable、bin/shortcuts。
3. 在 release workflow 后增加 manifest 更新任务，计算 Windows 产物 hash。
4. 如果是外部 bucket，用专用 token 提交 PR；如果是项目 bucket，直接提交到 bucket 仓库。
5. 先支持 stable release，不建议把 nightly/dev 包推到 Scoop。

验收点：
- 新 release 发布后 Scoop manifest 自动更新。
- 用户能 `scoop install flyenv` 并正常启动。

### #442 Laravel 项目创建自定义

判断：可处理，中等范围。现有 PHP 项目创建流程可以扩展，但用户提供的是 PowerShell 思路，FlyEnv 应实现跨平台流程。

相关代码：
- `src/render/components/Host/CreateProject/php.vue`
- `src/render/components/Host/CreateProject/phpCreate.vue`
- `src/render/components/Host/CreateProject/version.ts`

处理方案：
1. 在 PHP 创建项目向导中增加 Laravel 模板选项。
2. 支持选项：Laravel 版本、Starter Kit、Breeze/Jetstream、前端栈、数据库类型、是否执行 migration、是否初始化 git。
3. 命令生成跨平台：优先使用 Composer、PHP、Node 的已选版本路径，不写死 PowerShell。
4. 创建后自动生成 Host，public dir 指向 `public`。
5. 所有步骤通过 xterm 展示，并支持取消。

验收点：
- macOS/Windows/Linux 至少基础 Laravel 项目创建成功。
- 选项能正确反映到 composer/artisan/npm 命令。
- 创建失败时保留日志并提示失败步骤。

### #440 ZincSearch support

判断：可直接处理，中等模块工作量。FlyEnv 已有 Elasticsearch、MeiliSearch、Typesense，可复用搜索引擎模块模式。

处理方案：
1. 新增 `zincsearch` module enum、fork module、renderer components、aside、translations。
2. 安装逻辑从 ZincSearch GitHub releases 获取平台包。
3. 默认配置 data dir、监听端口 `4080`、admin user/password。
4. 启动时注入必要环境变量，例如 `ZINC_FIRST_ADMIN_USER`、`ZINC_FIRST_ADMIN_PASSWORD`。
5. UI 提供日志、配置、打开 Web UI。

验收点：
- 三个平台至少完成一个平台端到端启动。
- 浏览器打开 ZincSearch UI 可登录。

### #421 新增 frp 工具支持

判断：可处理，但范围较大，因为它不只是安装二进制，还要和 Host 映射打通。

处理方案：
1. 新增 `frp` 模块，管理 `frpc` 和可选 `frps` 二进制。
2. UI 分为服务器配置、客户端配置、映射规则、日志。
3. Host 列表增加“映射”列：启动/停止、配置二级域名、随机子域名。
4. 生成 `frpc.toml`，把本地站点端口映射到远端 server。
5. 安全项：server token 加密/隐藏显示；配置导入导出避免明文误泄露。
6. 第一阶段只做 `frpc` 客户端；`frps` 服务器安装教程作为文档/辅助命令。

验收点：
- 已有 Host 能一键生成 frp 映射并启动。
- 映射状态、日志、远端访问地址可见。
- 停止映射后本地 `frpc` 进程退出。

