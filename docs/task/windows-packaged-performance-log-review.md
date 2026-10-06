# Windows 打包后执行耗时日志分析

## 样本与分析方式

2026-10-05 读取 `D:\Temp\User\Temp\flyenv-debug.log`，文件 278288 字节，最后修改时间本地 14:07:13，986 条日志事件。本次仅分析日志与源码，不修改运行逻辑，不运行测试、构建、系统命令或服务操作。

日志为异步写入，文件中的行序不等于发生顺序；以事件的 `at`、requestKey、workerPid、actionId 关联。跨进程时钟不相减；使用各阶段自身 durationMs，父子阶段不重复相加。用户说明本轮使用打包程序，日志本身没有构建版本/包哈希，不能独立确认所有插件及主程序的源码版本。

## PATH 更新：19.23 秒

rendererKey：`IPC-Key-5ih24YlIuaWeDQ8ZRzZxUb7V07eksBPD`；fork requestKey：`LHg2MSaxQ2PJ2Uxqx9sDanSyM6t5EVxh`；worker：31960，已就绪并复用。

本地 14:06:25.693 发出请求，14:06:44.915 main 成功结算，14:06:44.921 显示成功，耗时分别 19221.808ms、19228.4ms。

| 阶段 | 本轮耗时 | 08:55 开发环境样本 |
| --- | ---: | ---: |
| 卷查询 PowerShell | 5394.328ms | 1156.606ms |
| 写入前原值查询 | 5028.178ms | 246.118ms |
| PATH 重建 | 329.109ms | 212.009ms |
| UAC broker 准备 | 680.776ms | 1489.951ms |
| RunAs | 6331.062ms | 2199.923ms |
| action.execute | 46.031ms | 67.394ms |
| 返回列表刷新 | 674.836ms | 682.299ms |

本轮总时间较 08:55 成功提示 6956ms 增加约 12.27 秒。卷查询、原值查询、RunAs 三项增量约 13.15 秒，broker 准备缩短约 0.81 秒，已解释主要差异。不同实机样本不是受控性能实验，不能把差值全部归因于打包，也不能将 RunAs 中用户确认和系统启动区间当成代码纯执行时间。

原值查询的 spawn 观察为 4799ms，退出为 5026ms，创建到 spawn 事件前占据主要时间，spawn 事件后仅约 227ms。`spawnPromiseWithEnv` 的此时钟在 EnvSync 完成、参数合并后开始，故该区间不包含环境同步；但它只记录 spawn 事件，没有同步 spawn 调用返回打点，不能继续断言 4799ms 全是同步创建调用。卷查询仅有总阶段，不能把其 5.39 秒全部当成 CIM 实际查询。

同一 worker 后续的 PATH 查询正常：刷新列表时 spawn 6ms，PowerShell 总计 253.107ms；envPathList 时 spawn 7ms，总计 247.022ms。UAC broker 的 node.spawned 也仅 6.05ms。说明长耗时不是本次所有 PowerShell 启动都固定需要五秒，已有日志无法证明是杀软、ASAR、签名、环境路径或并发负载导致。

## 后台广播与后续列表

写入请求已于 14:06:44.915 成功回包，通知随后启动；spawn-call-returned 耗时 4763.17ms，spawned 4763.348ms。源码对此直接调用 Node spawn，在同步调用返回后记录 spawn-call-returned，因此本轮至少能直接确认后台通知进程创建调用占用了该 worker 约 4.76 秒；不是主请求在 await 广播结果。

envPathList 于 main 14:06:44.917 收到，worker 于 49.681 收到初始化、49.683 进入模块解析，49.942 回包。main 总计 5025.746ms，模块执行约 259ms，前面的约 4.76 秒发生在请求到达业务入口之前。结合相同 worker 和实际 spawn 调用返回时钟，可确认本次通知同步启动占用了 worker，阻碍其同期处理下一请求；无法据此判断其底层 Windows 启动慢的原因。成功提示没有等待通知或 envPathList 完成。

## 退出：23.12 秒，仍然并行

quitId：`ffbcd7e6-6ccc-4e66-8815-b699ccff2976`。14:06:50.244 开始，14:07:13.359 返回，总计 23115.305ms。

两层 drain 合计不足 1ms。HTTP、MCP、服务停止与 hosts 清理从 14:06:50.249 左右并行开始；初始完整进程快照查询 1084.406ms，373 条，六个服务均于 14:06:51.340 进入停止。

| 服务 | main 请求总耗时 | worker 内模块停止耗时 |
| --- | ---: | ---: |
| Nginx，复用 worker | 360.572ms | 354.837ms |
| PHP，PID 31692 | 5754.434ms | 468.281ms |
| PHP，PID 37552 | 5874.736ms | 402.727ms |
| Redis | 5761.265ms | 446.793ms |
| MySQL | 11845.959ms | 6283.144ms |
| mailpit-plugin | 21994.438ms | stop-invoke 至 stop-completed 约 18319ms |

PHP、Redis 的实际 taskkill 都约几百毫秒。它们及 MySQL 的临时 worker 已退休，退出时重建：main 到 spawn 事件约 2.63～2.69 秒，runtime import 约 0.41～0.53 秒，实际服务模块解析另约 1.92～2.08 秒，总计业务停止前约 5.2～5.6 秒。不是单独 runtime import 花了五秒，也不是再次串行停止。spawn 事件区间仍包含系统启动及主进程调度，不能当成纯 CPU 初始化。

MySQL 的 taskkill 于 14:06:57.312 完成，之后查询进程表至 14:07:03.180，共 5861.727ms；query-start 到 spawned 约 5.02 秒，剩余查询/解析约 0.84 秒。第一次 poll 已无原目标，未观察到反复轮询或残留。源码 `stopWindowsServiceProcessesAfterNativeShutdown` 对数据库强制回退传 confirmExit=true，所以 quit 仍保留这次确认；不能误认为通用 PHP 停止也重新查表。

hosts 清理约 7636.852ms，写入 7601.727ms；DNS 尽力启动仅 11.689ms，不等待刷新结果。hosts 于 14:06:57.886 完成，MySQL 于 14:07:03.200 完成，最后 mailpit-plugin 于 14:07:13.350 完成；服务退出总时长由插件拖长，不是 hosts 或 DNS 结束后才开始停服务。

## 插件旧代码线索及边界

mailpit-plugin 的模块解析 193.917ms，14:06:55.031 进入 stop，14:07:13.350 才完成。其间输出 `[ProcessKill][command]` 和 `command: taskkill /f /pid 8476`。当前 `src/shared/Process.ts` 已无这个成功日志，当前执行为完整系统路径、参数数组、公共 kill.command-request/result 日志。该日志是插件正在使用旧停止实现的强线索，未核对已安装产物前不确认具体版本。

源码构建方式支持这条线索：插件继承 `@fork/module/Base`，plugin-builder 使用 bundle:true，并将 @fork/@shared 指向本地源码，构建产物内联 Base/Process 等实现；语言 runtime 是显式宿主桥接。更新主程序不自动替换已安装插件内联的停止代码，必须重新构建并更新对应插件产物才能继承本轮优化。插件内部没有细分日志，因此 18.32 秒无法直接拆成查询、帮助程序探测、命令启动与实际 kill 各自耗时，也不能用主程序 taskkill 的几百毫秒代替它的实测执行时间。

## 下一步优先级

1. 核对已安装 mailpit-plugin 的 entry/版本与其停止代码，更新旧产物后复看；它是本次退出的最长项。
2. 针对主程序长进程启动区间，补充相同参数下 spawn 调用返回、spawn 事件与宿主可执行文件/打包状态的关联，区别同步启动、事件回调延迟与子进程脚本执行；不恢复已删除的 PowerShell 内部临时日志。
3. 对 cold worker 的服务模块解析约两秒继续审查依赖；避免将其与 OS worker 创建或 runtime import 混算。
4. MySQL 的退出确认属于当前数据库策略；若调整必须明确命令成功与已确认退出的业务含义，不能按本次查询慢直接删除或将失败伪装成功。

本轮结论是定位成本与旧插件线索，没有证明打包形式、性能日志或企业安全策略是底层根因，也没有据猜测修改执行链路。

## 后续核对：排除旧插件，聚焦正式包

用户确认插件为旧版，暂不处理；后续性能调查不以插件作为正式包各项变慢的解释。

实际读取 `D:\Program Files\FlyEnv\resources\app.asar`：版本 4.19.1，fork 入口 766 字节，动态导入 runtime chunk；卷查询、PATH 查询、后台广播产物与当前源码使用的调用方式一致。没有因打包变成整包预加载，也没有额外五秒等待、权限复核或串行分支。开发和本地正式打包配置使用同一 fork 入口、分块配置及外部依赖模式，差异包括压缩/删除 console、ASAR 文件布局、宿主可执行文件路径与启动时继承环境。Electron 开发二进制及正式构建配置都指向 39.8.10；安装包 exe 的资源版本是业务版本，不能用该版本直接证明其内部运行时版本。

同一包、同一份日志里的直接启动耗时差异显著：首次 hosts broker 的 node.spawned 为 4546.906ms；后续 PATH broker 为 6.05ms；main 退出 hosts broker 为 9.829ms。进程查询的 query-start 到 spawned 分别出现约 2314ms、10ms、9ms、5021ms、19ms，以及 MySQL 退出确认时约 5018ms。这说明并非仅 `spawnPromiseWithEnv` 或仅某个 PATH 脚本慢，也并非每个正式包进程调用固定慢；需要调查共同的进程创建/事件回调边界。

PATH 快照调用的环境同步已在 spawn 时钟之前完成；卷查询、broker、广播直接使用 windowsPowerShellEnv，无需 EnvSync。目标程序均为完整系统路径，未走 PATH 搜索；卷查询调用 DriveInfo，没有使用 Storage/CIM 卷枚举。因此不能用“环境同步、寻找 powershell 或 Get-Volume 很慢”统一解释本次几个五秒区间。

本地签名只读核对发现安装的 FlyEnv.exe 和开发 electron.exe 都是 NotSigned；不能仅依据正式包未签名解释二者差异。读取该时间窗口的 Defender Operational，发现 14:04:10～17 的 2010 云安全智能更新事件，但事件无 FlyEnv 路径、目标 PID 或扫描持续时间，且发生在主要慢调用之前，不能作为阻塞这些调用的证据。没有读取到该窗口的 CodeIntegrity 事件；这同样不能排除普通扫描或未被该日志记录的系统等待。不修改 Defender 配置或添加排除项。

当前可以确认：后台广播一次同步 spawn 已占用约 4.76 秒；其他多数慢启动只有到 spawn 事件的耗时，尚未区分同步 CreateProcess 路径与宿主回调延迟。worker 的具体服务模块加载另约两秒，属于文件/依赖加载区间，与 powershell.exe 创建应分别追踪。现有应用日志无法继续证明底层阻塞来自扫描、控制台创建、磁盘读取或其他系统组件；需要相同调用条件下的启动边界数据和系统进程/文件跟踪，不能先归因于 ASAR 或关闭系统保护。

本次只读实际安装产物、源码及相关系统事件，没有运行性能测试、启动应用、执行 PowerShell 业务脚本或调整系统策略。
