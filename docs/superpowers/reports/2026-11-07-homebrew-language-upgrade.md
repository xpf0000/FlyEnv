# Homebrew PHP 更新实施与验证

范围：macOS 当前 Homebrew 的 PHP/PHP-FPM；更新入口只在 Homebrew 页。确认后停止相关服务，再执行指定完整配方升级。配置、当前选择、PATH、别名、站点、启动组和旧版本备注保留，服务不自动重启。

## 实现

- Brew 本地 catalog 区分已安装/可用版本及 revision，验证 prefix、架构、tap、安装收据和全部 keg。固定、停用和来源不明不可更新。
- main 保存不可伪造的确认快照与执行许可；停止前复核，升级前核实已停止，受影响安装的 raw/UI/MCP/启动组启动均经过最终 gate。
- 安装/卸载/更新共用包进程 owner；绝对 brew 路径、参数数组、有限日志、真实 close 终态；未知结果保留屏障，不自动重放。
- renderer 单例跨页面保存任务。升级成功后独立收集列表刷新结果，刷新失败保持包操作成功。
- 通用安装刷新支持保留当前选择和备注，合并请求保留限制更强的策略。

## 已执行验证

- `npm run test:homebrew-upgrade`：9 个功能测试脚本通过：catalog、受理/并发、真实临时包进程、controller、刷新、真实 Vue 组件、raw 生命周期、PHP 精确停止及扩展包入口。
- `npm run test:homebrew-upgrade:app-smoke`：真实 Application、renderer、IPC、ForkManager 和包子进程；PHP 服务使用测试专用适配器，真实启动/停止临时 Node 进程。验证取消无副作用、停止失败零升级、先停后升级、非零失败不重启、成功刷新、离页重入、当前选择与 IndexedDB 旧备注及配置文件保留、raw/共用生命周期启动门禁，以及 quit drain 等到包进程 close。中英文、浅色警告和深色窄窗口已查看截图。
- 既有 StartupGroup、服务启动诊断（8/8）、renderer operation boundaries 回归通过。
- 定向 ESLint：0 errors，10 warnings（测试 stub 组件及原有 v-html）。
- 全量 vue-tsc 与 master 基线比较：原有 61 个诊断，未新增；不声称全量类型检查通过。
- 生产 main、fork 和 renderer 源码构建通过。renderer 构建使用 8GB Node heap；2GB 默认堆不足。未打安装包。
- 对日常 Homebrew 仅运行只读 info/outdated/identity 查询：实际 PHP 为 8.5.10，可用 8.5.12_1；依赖潜在变更含数据库，按首版约束阻止执行。没有运行真实升级。

## 实施取舍

1. 保留旧 brewInfoJson 行协议，额外数据在 Brew 本地 catalog；多一次只读查询。
2. 潜在影响保守包含可能变更的依赖及依赖方链接重建；未变化的共享库不会把无关数据库连接进来。补查未安装构建依赖的元数据并解析别名。包含数据库或范围无法验证时阻止更新；可能比 Homebrew 实际 bottle 计划更宽。
3. 停止目标采用 Brew 本地 `{module,item}`，复用各模块的 ModuleInstalledItem.stop，不增加公共服务属性。
4. 忙时明确拒绝其他包变更，不建立隐藏队列；用户稍后重试。
5. 退出等待真实包终态，不按普通服务的 30 秒预算杀 worker；退出可能耗时较长，不提供强制取消按钮。
6. Homebrew 自身的首次 bootstrap 保留既有 XTerm 流程；普通配方的安装/卸载/升级已统一归属。bootstrap 原有页面生命周期问题不在本次重构。
7. 中文和英文提供新文案；其余语言包使用英文兜底，已补齐键和占位符，后续可本地化。

## 验收边界

真实 Homebrew PHP 旧版→新版、依赖变化后的兼容行为，以及正式 Helper 传输与升级组合尚未在隔离 Homebrew 环境验收。额外使用现有 FPM 二进制和其另一前缀副本、临时配置与私有 socket，验证实际进程标题/可执行文件查询、仅终止确认进程树、旧 PID 不误停另一前缀 FPM。此原生检查的信号使用严格限制到测试进程树的适配器；不能替代真实包升级或正式 Helper 组合验收。未修改日常 PHP 安装、用户关联/配置，未推送远端。

## 独立审查和修复

独立审查发现 4 项 Important 和 1 项 Minor；按用户要求“成功刷新列表”的实际影响，将旧查询复用问题也按 Important 处理。五项均在同一修复轮完成 RED→GREEN 回归，没有遗留本次审查的问题；按内联执行流程不追加第二次审查，修复以测试、联调和构建验证。

1. **停止越界**：main 把确认的 root/bin 与登记 generation 绑定，透过通用 ServiceStopContext 传递精确停止范围。升级触发的 PHP 停止只操作该根及已证明的后代；不查共享系列配置或其他 PID 文件。macOS proctitle 不含二进制时读取真实 executable，身份未知则停止更新。根已不存在时仅注销该旧代次。普通停止流程保留原行为。
2. **较早 raw 启动**：升级前等待已受理的原始生命周期请求及其登记消费者；raw 启动终态按 fork 的 stop contract 登记。worker 退休明确为 unknown，相关启动结果未知时阻止包变更。
3. **扩展旁路**：PHP Homebrew 扩展安装/卸载接入同一 main/fork 包 owner，UI 只展示持续日志。扩展特有复制在其模块保留，使用实际 prefix 的 active opt/keg，并由控制器等待。命令成功而复制失败明确为部分完成，不重放命令；首次 Homebrew bootstrap 例外不扩张到扩展。
4. **DNS/FTP**：已知运行于 FlyEnv 自身 worker 的独立服务不归入 Homebrew 安装；未知安装类服务仍保守阻止执行。
5. **刷新旧数据**：安装清单和 Homebrew 列表显式要求包结束后的新查询；等待旧 flight 时继续保留禁止改当前选择/备注的策略。迟到旧 catalog 回包不能覆盖新结果。

追加回归命令仍为 `npm run test:homebrew-upgrade`。另运行：

`FLYENV_TEST_PHP_FPM=/opt/homebrew/opt/php/sbin/php-fpm npx tsx scripts/homebrew-upgrade-php-stop-test.ts`

它只启动临时私有 FPM 实例，不重启/停止日常服务或升级安装。全部测试进程已退出。修复后 Application smoke 五个检查点、既有 StartupGroup/启动诊断/renderer 边界/窗口展示（36/36）、main/fork/renderer 构建通过；定向 lint 0 errors / 10 warnings，全量类型仍为 61 个既有诊断，0 新增。

审查中暂未判断的事项：真实包升级/正式 Helper 组合按上述验收边界保留；保守依赖阻挡和英文兜底维持既定取舍；跨重启持久恢复不在批准范围。本轮不会据 unknown 自动重试。

## PR #960 反馈修复（2026-11-08）

操作归属不变：main 协调器负责受理/提交门禁，Brew renderer 控制器负责 IPC 与页面间状态；没有新配置或 Pinia 状态。

- `idle()` 是提交包命令的必要前置校验，失败时没有调用 runner、没有包变更。安装/卸载在该边界前维持 pending，前置失败返回 failed 并释放本次 gate；调用 runner 后的异常或 unknown 仍保留 gate，不自动重放。
- renderer 必须保留 transport 的 unknown：未知是终态结果但不代表包进程已结束，busy/门禁与未知提示继续保留。普通明确失败仍为 failed，进度 code 200 不结算监听。

两项先复现失败再修复；回归覆盖安装和卸载、连续前置失败与后续受理、提交后的异常/未知，以及 renderer 实际 IPC 适配层和控制器的未知状态。

本轮验证：`npm run test:homebrew-upgrade`（扩为 10 个脚本）、renderer 操作边界、服务启动诊断和 StartupGroup 均通过；应用 smoke 五个检查点通过；main/fork/renderer 完整生产源码构建通过。本地 Monaco worker 文件可用，本轮没有修改 Monaco 配置或依赖。定向 ESLint 通过；全量类型检查仍为 61 个既有诊断，0 新增。未执行真实 Homebrew 升级，未合并 PR。
