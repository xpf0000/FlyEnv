# FlyEnv 开启中 Issues 梳理与处理方案

> 梳理时间：2026-06-17 ｜ 数据来源：GitHub Open Issues（共 40 个，已排除 PR）
> 分类：① 已直接修复　② 需进一步排查/复现　③ 特性需求-可支持(附方案)　④ 特性需求-暂不建议/待定　⑤ 翻译/分发/流程类

---

## ① 已直接修复

### #728 Running Cron Jobs on Windows
- **根因**：`src/fork/module/Cron/WindowsSystemScheduler.ts` 的 PowerShell 包装脚本两处问题。
  1. `hostId = if ($HostId) { [int]$HostId }`：hostId 是时间戳级大整数（如 `1776985574681`），超出 Int32 上限，抛 `Cannot convert ... to System.Int32`。
  2. `$psi.Arguments = '/d /s /c ' + $Command`：命令含带空格的引号路径（如 `"C:\Program Files\..."`）时，`cmd /s` 会强制剥离首尾引号，导致 `'C:\Program' is not recognized`。
- **修复**：`[int]` → `[long]`；`/d /s /c` → `/d /c`（去掉 `/s`，让 cmd 默认逻辑保留可执行文件引号）。
- **三端兼容**：改动仅在 Windows 调度器文件内，不涉及 Unix（`UnixSystemScheduler.ts`）。
- **来源**：用户已在 2 台 Windows / 2 个版本上测试通过。

### #691 Rust 加载系统环境变量（RUSTUP_HOME 未识别）
- **根因**：`src/fork/module/Rust/index.ts` 将 `~/.rustup` 与 `~/.cargo` 路径硬编码（`homedir()` 拼接），无视 `RUSTUP_HOME` / `CARGO_HOME` 环境变量，导致自定义安装位置下 rustup 显示“未安装”。
- **修复**：新增 `cargoHome()` / `rustupHome()` / `rustupBinPath()` 三个私有方法，优先读取环境变量、回退默认路径；替换 `allInstalledVersions` / `checkRustup` / `rustupData` 中 4 处硬编码。
- **三端兼容**：纯 `process.env` + `path.join`，Windows 仍用 `rustup.exe`，mac/linux 用 `rustup`，逻辑统一。

---

## ② 需进一步排查 / 复现（信息不足或需运行时环境）

| # | 标题 | 现状判断 | 还需要什么 |
|---|------|---------|-----------|
| #724 | Host Files Are Not Applied Correctly (Win11) | 日志显示 nginx 反复 stop/start，hosts 未生效。疑似 helper 写 hosts 权限/时机问题，或多 PHP 实例触发反复重启。 | 需 Windows 复现：确认 helper 是否成功写入 `C:\Windows\System32\drivers\etc\hosts`、是否被安全软件拦截。 |
| #715 | "Failed to start" 首次启动报错但服务正常 (macOS) | 服务实际已起，仅首启误报。疑似启动成功探测（端口/pid 检测）有时序竞态，首启时检测早于服务就绪。 | 需 macOS 复现 + 开启 debug 日志，定位是哪个服务的 check 超时返回 false。 |
| #710 | 设置环境变量失败 (Windows，已管理员) | helper 与主程序均管理员仍失败。需看具体报错与 helper-go 写注册表/环境变量的返回。 | 需完整错误日志、FlyEnv 版本、是否域账户/组策略限制。 |
| #690 | MySQL 启动后窗口卡死、Chrome/VSCode 崩溃 (macOS 26) | “最近几个版本才出现”，连带其他 App 崩溃异常，疑似系统级资源/GPU 或某次启动逻辑变更。 | 需定位回归版本区间（哪个版本开始）、崩溃日志、是否 Apple Silicon。 |
| #636 | 切换菜单风格后报 IDE/AdBlock 出错、界面空白 (Win) | “经典↔现代”切换触发渲染进程崩溃。报错名借用了浏览器插件名，疑似菜单重渲染时空引用。 | 需复现并抓渲染进程 devtools 报错堆栈，定位菜单风格切换的组件。 |
| #633 | python 环境变量架构问题 (Windows v4.14.1) | 与 #713 同源（python PATH/软链）。当前已引入 `PythonShim` + PATH 真实长度排序重构，可能已修复。 | 需在最新版 Windows 复测确认是否仍存在。 |
| #713 | 设置 Python 后 python3 未生效 (macOS) | 根因明确（perl→/usr 软链使 `/usr/bin` 抢先）。当前代码已用 `createPythonBinShims` 建 python/python3 shim + 排序，**大概率已修复**。 | 需 macOS 最新版复测 `python3 -V` / `pip3 -V`。未复现则关闭。 |
| #685 | ollama 下载卡住 | 主要是下载速度/网络问题；但用户指出“无取消入口”是真实 UX 缺口。 | 取消按钮可做（见 ④）。下载加速需评估镜像源。 |
| #689 | thaw 应用更新后 FlyEnv 跑到隐藏 (macOS) | 极小众。疑似窗口绑定依赖 Bundle ID/AX 属性，目标 App 更新后失配。 | 需复现，优先级低。 |
| #585 | Fedora43-gnome 托盘菜单显示在屏幕左侧 | Linux 托盘定位问题，依赖 GNOME/Electron tray 行为。 | 需 Fedora43-gnome 环境复现。 |
| #702 | 已激活仍要求激活 license | 涉及授权校验逻辑（可能服务端/本地缓存），非纯前端。 | 需结合授权校验实现与该用户激活态排查，单独处理。 |

---

## ③ 特性需求 — 可支持（附实现方案）

### #716 退出时自动停止所有服务（autoStopService）
**可做，成本低。** 已有完整对称基础设施。
- **存储**：复用 `config.setup` 模式，新增 `autoStopService?: boolean`（`src/render/store/app.ts`，紧邻 `autoStartService`）。
- **设置 UI**：仿 `src/render/components/Setup/AutoStartService/index.vue` 新建 `AutoStopService/index.vue`，getter/setter 读写 `store.config.setup.autoStopService` 并 `saveConfig()`。
- **退出钩子**：`src/main/Launcher.ts` 的 `before-quit` 已调用 `application.stop()` → `doStop()` → `serverManager.stopServer()`。需在退出流程中，当 `autoStopService===true` 时确保对“所有已启用服务”执行 stop-all（与一键停止同路径），并在 stop 完成后再 quit。
- **注意**：macOS 下关闭窗口默认进托盘不退出，需明确该设置作用于真正 quit（Cmd+Q / 托盘退出）。

### #700 / 建站允许 localhost + 端口（#700 主诉，#727 部分相关）
**可做。** 当前以域名唯一键导致多个 localhost 站点冲突。
- **方案**：站点唯一标识由“域名”改为“域名+端口”组合；hosts 写入逻辑跳过 `localhost`（系统已解析，无需写 hosts，规避管理员权限痛点）；Nginx/Apache/Caddy vhost 以 `listen 端口` 区分 `server_name localhost`。
- **价值**：直接缓解用户“每次要管理员权限 / 绞尽脑汁起域名”的核心痛点。
- **改动面**：Host 模块（站点模型、vhost 生成）+ 前端建站表单校验。建议作为一个完整迭代。

### #727 添加服务项目允许多个端口
**可做（中）。** 当前“TCP 端口检测”仅支持单端口，而 `pnpm dev:local` 类命令会起多个端口。
- **方案**：项目服务的端口字段由单值改为数组（端口列表）；端口占用/存活检测对列表内每个端口生效；UI 端口输入支持多端口（逗号分隔或 tag 输入）。
- **改动面**：Project 模块端口检测逻辑 + 前端端口输入组件 + 数据结构迁移（旧单端口兼容为长度 1 数组）。

### #685（部分）/ Ollama 下载增加“取消”入口
**可做（小）。** 下载无取消按钮是真实缺口。
- **方案**：Ollama/通用下载任务持有可中断句柄（AbortController / 子进程 kill），前端下载条增加取消按钮 → IPC 通知 fork 中断并清理临时文件。可推广到其他大体积下载（如各语言运行时）。

### #672 工具箱新增随机测试数据生成器
**可做（小-中），但需合规声明。** 工具箱（Tool 模块）适合承载。
- **方案**：新增「随机数据」工具，生成符合校验规则的测试用 身份证号/手机号/银行卡号（Luhn）等。
- **强约束**：必须明确标注“仅供开发测试，非真实个人信息”，生成算法仅满足格式/校验位、不关联真实人。避免被用于伪造证件。建议默认面向“假数据(faker)”定位。

### #626 Minio 增加备用下载源
**可做（小）。** 官方 `dl.min.io` 不再维护，pigsty fork 持续维护。
- **方案**：`src/fork/module/Minio/index.ts` 下载 URL 硬编码（darwin/linux/windows 三处）。抽出为可配置源，默认官方 + 备选 `github.com/pgsty/minio` release，或在主源失败时回退。
- **三端**：三个平台 URL 同步调整。

### #723 Homebrew 库小版本更新提供“Update”按钮
**可做（中）。** 当前小版本升级（如 redis 8.6.1→8.8.0、PHP 8.5.6→8.5.7）需先卸载再装，且版本页显示的“已安装版本”与实际不符。
- **方案**：版本列表项在“已安装”状态旁增加“更新”按钮，本质执行 `brew upgrade <formula>` 后刷新版本探测；同时修正版本显示与真实安装版本的一致性（重新读取实际 bin 版本号）。
- **注意**：仅适用于 brew 来源；static 包不适用。

### #698 OpenClaw 支持手动配置目录（WSL 场景）
**可做（小）。** 安装在 WSL 内的 openclaw 探测不到。
- **方案**：参考其他模块的 `setup.xxx.dirs` 自定义目录机制（如 Rust 的 `setup.rust.dirs`），为 OpenClaw 增加手动指定可执行文件/目录的入口，探测时并入自定义目录。

### #687 / #442 CLI 支持 + 框架自动检测
**方向认可，工作量大，建议分期。**
- #687 提议 `flyenv php park / use 8.4 / host add / reload` 等运行时导向 CLI，并对 Laravel(`/public`)、Symfony(`/public`)、Yii(`/web`)、Tomcat、Node 等做 docroot 默认值检测。
- #442（葡萄牙语）提供了 Laravel 项目创建的 PowerShell 脚本，本质是“建站时更多定制项（starter kit / DB / migrations）”。
- **建议**：先做“框架自动检测 docroot”这一可独立落地的小切片（建站时按项目特征推荐根目录），CLI 体系作为中长期规划单独立项。

### #448 发布到 Scoop
**可做（分发，小）。** 用户已提供 `flyenv.json` bucket 元文件。
- **方案**：建立 scoop bucket 仓库，加 GitHub Action 在 release 后自动更新 manifest（版本号 + hash）。属 CI/发布流程改动，不涉及应用代码。

---

## ④ 特性需求 — 需产品决策 / 暂不建议 / 体量大

| # | 需求 | 评估 |
|---|------|------|
| #712 | 集成 AI 编程 CLI 工具管理面板（Claude Code/Codex/OpenCode 等 + Ollama/云 API 对接） | 体量大、想法完整。FlyEnv 已有 `Ai` / `Ollama` / `CliProxyAPI` 模块基础，技术可行，但属重量级新模块，需产品立项排期。建议先支持 1-2 个主流 CLI + Ollama 本地对接做 MVP。 |
| #669 | 大模型切换工具（类 cc switch） | 与 #712 高度重叠，可并入 AI 模块规划，做“provider/model 快速切换 + 配置持久化”。 |
| #726 | Redis 集群（3 节点）一键启动 | 可做但偏小众，用户已自带脚本。可作为 Redis 模块的“集群模式”选项排期，非紧急。 |
| #719 | 图数据库支持（Neo4j） | 新服务模块，技术可行。看需求热度排期。 |
| #722 | 集成 llama.cpp | 新模块，与 AI 方向一致，可纳入 AI 规划。 |
| #653 | 集成 NexaSDK（多模态推理） | 新模块，小众，观望需求量。 |
| #680 | 浏览器内访问 pgAdmin | 可做（类似已有 web 工具集成方式），看优先级。 |
| #648 | Plexum 集成（Cloudflare quick tunnel P2P 故障转移） | 第三方项目方提议，依赖外部 P2P 网络与签名身份，涉及隐私（向种子网络广播签名 URL）。技术上 FlyEnv 已有 cloudflared 基础，但属第三方生态绑定，建议谨慎、保持 opt-in，需与项目方进一步沟通后再定。 |
| #684 | Flutter 的 Android SDK 安装引导 | 当前需手动装 Android Studio。可做“产品提示/引导”小改进（明确告知需另装 Android SDK 及路径配置）。 |
| #483 | PHP7.2 的 phalcon 组件（Win 无效 + ARM Linux） | 属静态扩展包构建/分发，用户已提供可用 zip。需在扩展包仓库补充对应平台二进制，非主程序代码改动。 |
| #587 | 静态 PHP 包缺 pdo_sqlite 扩展 | 属静态包构建配置问题（macOS PHP-8.2.30）。需在静态编译配置中确认/补入 pdo_sqlite，归构建侧处理。 |
| #421 | 新增 frp 内网穿透工具 | 可做新模块（“其他”分类下），与 cloudflared 定位类似。看优先级排期。 |

---

## ⑤ 翻译 / 分发 / 流程类（非代码缺陷）

| # | 内容 | 处理建议 |
|---|------|---------|
| #725 | 减少启动时的支持提醒弹窗（不要每次开浏览器） | 合理 UX 诉求。但**当前仓库代码未找到“每次启动弹窗并打开浏览器”的逻辑**（可能存在于已发布版本或已部分移除）。需先定位实际触发处再改：建议改为非阻塞提示（可关闭横幅）+ 仅新版本发布/间隔一段时间才提示，并提供关闭开关。归入待定位后实现。 |
| #675 | 波斯语 (Persian) 支持 | 引导至 Crowdin（见 #457）。波斯语需注意 RTL。 |
| #546 | 保加利亚语支持 | 同上，走 Crowdin 流程。 |
| #457 | Crowdin 翻译项目 | 已有 https://crowdin.com/project/flyenv 。建议在 README/文档显著位置引导贡献者，新增语言统一走 Crowdin。 |
| #655 | 采用 Gitflow 分支模型 | 流程改进建议（master/develop/feature/release/hotfix）。利于翻译与发布解耦。由维护者决策是否采纳；可先引入 `develop` 集成分支 + release 冻结期供翻译跟进。 |

---

## 汇总

- **已直接修复（2）**：#728（Win Cron 大整数 + cmd 引号）、#691（Rust RUSTUP_HOME/CARGO_HOME）。改动均已通过 `tsc` 类型检查，且严格限定在对应模块、不影响其他平台。
- **需排查/复现（11）**：#724 #715 #710 #690 #636 #633 #713 #685 #689 #585 #702 —— 多为需特定平台运行时复现或更多日志。其中 #713/#633 在当前 PythonShim 重构后大概率已修复，待复测确认。
- **可支持特性-附方案（9）**：#716 #700 #727 #685(取消) #672 #626 #723 #698 #687/#442 #448。
- **待决策/体量大（12）**：#712 #669 #726 #719 #722 #653 #680 #648 #684 #483 #587 #421。
- **翻译/流程（5）**：#725 #675 #546 #457 #655。

### 建议优先落地顺序（特性侧）
1. #716 退出自动停服务（成本最低、对称已有设置）
2. #685 下载取消按钮（小、通用收益）
3. #698 OpenClaw 自定义目录（小、复用现有 dirs 机制）
4. #700 localhost+端口建站（痛点强、价值高）
5. #723 Homebrew 小版本 Update 按钮（高频痛点）
6. #626 Minio 备用源（官方已停维护，时效性强）
