# Homebrew PHP 更新实施与验证

范围：macOS 当前 Homebrew 的 PHP/PHP-FPM；更新入口只在 Homebrew 页。确认后停止相关服务，再执行指定完整配方升级。配置、当前选择、PATH、别名、站点、启动组和旧版本备注保留，服务不自动重启。

## 实现

- Brew 本地 catalog 区分已安装/可用版本及 revision，验证 prefix、架构、tap、安装收据和全部 keg。固定、停用和来源不明不可更新。
- main 保存不可伪造的确认快照与执行许可；停止前复核，升级前核实已停止，受影响安装的 raw/UI/MCP/启动组启动均经过最终 gate。
- 安装/卸载/更新共用包进程 owner；绝对 brew 路径、参数数组、有限日志、真实 close 终态；未知结果保留屏障，不自动重放。
- renderer 单例跨页面保存任务。升级成功后独立收集列表刷新结果，刷新失败保持包操作成功。
- 通用安装刷新支持保留当前选择和备注，合并请求保留限制更强的策略。

## 已执行验证

- `npm run test:homebrew-upgrade`：catalog、受理/并发、真实临时包进程、controller、刷新和真实 Vue 组件行为全部通过。
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

真实 Homebrew PHP 旧版→新版、真实 PHP-FPM 停止，以及真实依赖变化后的兼容行为尚未在隔离 Homebrew 环境验收。模拟包/服务通过不能代替该项。未修改日常 PHP、用户关联/配置，未推送远端。

整体验证后的独立审查及其修复记录在实施计划和后续提交中。
