# Windows PHP 服务停止耗时诊断

## 诊断计划与操作契约

用户反馈单个 PHP 停止约 13 秒，两个版本退出串行接近 30 秒；本次先分析并增加阶段计时，不调整归属、权限、停止顺序或退出安全策略。

- fork PHP 模块仍拥有进程归属、父树停止、退出确认和 PID 文件清理；共享权限层仍拥有授权前身份、普通执行及必要的 UAC/Helper 路由。
- 计时复用 `WindowsPrivilegeTiming` 的 AsyncLocalStorage，只有诊断入口主动启用；阶段包含嵌套时间，不得直接求和。观察器错误不改变业务成功/失败。
- 新脚本默认 probe，仅查询进程和本地文件；apply 才调用真实 `Php.stopService(version)`，不会启动/重启服务或写 hosts/PATH，不自动安装 Helper。多个版本按顺序执行，与退出实例循环的串行顺序一致；不声称测量了 Electron IPC、退出 drain 或整机退出。
- 目标来自显式 PHP 安装路径和 FlyEnv 数据目录；apply 前校验所有参数/存活 spawner 及版本配置证据。失败保留原模块规则，不增加按同 EXE 扫描结束的目标，也不自动补杀。
- 服务停止是不可恢复的实际操作，apply 后 main/renderer 的运行登记可能暂时仍显示启动，需要刷新或重新启动服务。失败实例仍输出报告并继续下一个实例，类似退出循环的错误隔离。
- 验证仅运行诊断脚本的无系统操作 self-check（参数、语法与计时上下文），不在当前工作区实际结束用户服务；真实阶段耗时由用户在目标 Windows 环境采样。

## 源码发现

1. `Php.win._stopServer` 首次用完整进程表识别父与孤立进程；正常停止成功后，`waitWindowsServiceExit` 至少再查一次完整进程表，然后 PHP 残留检测再查一次，PID 文件清理又查一次。通常至少四次全量 CIM 查询，若等待轮询则更多。
2. `ProcessKillTreeStrict → Helper.send → executeWindowsPrivilegeOperation` 先用普通权限 `runWindowsAction` 采样父创建身份，再用第二次 `runWindowsAction` 执行真正停止。每次均有 PowerShell broker、管道和客户端启动成本，实际 taskkill 只是第二次动作的一部分。
3. 管道 broker 每次 `Add-Type` 编译；已有计时可把 `broker.compile`、`ordinary.pipe-ready`、`ordinary.launch-and-result`、`action.execute` 分开。`action.execute` 包含父身份重查、taskkill 和句柄等待，不代表纯 taskkill 时间。
4. 若普通停止访问被拒绝，还会追加 CIM 身份恢复或 UAC/Helper 执行、授权排队和用户确认。不能将这部分算成服务自身退出时间。
5. main `ServiceProcess.stopInstances` 串行调用每个登记实例，因此查询与管道固定成本按实例叠加。这里只是源码可确认的重复步骤；尚无本次机器采样，不能断定哪项占满 13 秒。

## 使用方法

数据目录为 FlyEnv 设置中实际使用的目录，应包含 `server/php`、`server/pid` 和 `app`。不要把 `server` 子目录当作数据根传入。以下示例路径需替换为当前安装。

```powershell
# 默认只读，观察全量进程查询的冷/热开销，不结束服务。
yarn test:windows-service-stop-timing --data-dir "D:\Program Files\PhpWebStudy-Data" --php-bin "D:\Program Files\PhpWebStudy-Data\app\php-8.3.33\php.exe"

# 真正停止一个已运行的 PHP 服务；不会自动重新启动。
yarn test:windows-service-stop-timing --mode apply --data-dir "D:\Program Files\PhpWebStudy-Data" --php-bin "D:\Program Files\PhpWebStudy-Data\app\php-8.3.33\php.exe"

# 两个 PHP 版本按顺序停止，第二个可复用本进程权限缓存。
yarn test:windows-service-stop-timing --mode apply --data-dir "D:\Program Files\PhpWebStudy-Data" --php-bin "D:\Program Files\PhpWebStudy-Data\app\php-8.3.33\php.exe" --php-bin "D:\Program Files\PhpWebStudy-Data\app\php-8.2.30\php.exe"

# 无系统操作自检。
yarn test:windows-service-stop-timing --self-check
```

`--php-bin` 接受 `php.exe` 或 `php-cgi.exe`。默认从安装目录已有 `php.phpwebstudy.90XX.ini` 文件名恢复 `version.num`，不用启动 PHP 获取版本。如果存在多个运行 ini，需按每个 `--php-bin` 的顺序重复提供 `--php-num`（例如 `83`、`82`）。可同样重复 `--pid` 绑定明确根 PID；只有其中一个 PID 时不能给两个版本共用。

apply 会调用完整生产 `Php.stopService`，重新查进程、识别所属 spawner/孤立 worker、执行停止并确认原树和版本残留、清理符合当前值的 PID 文件；不是测试中直接调用 taskkill。只读预检确认所有待测版本后才开始第一项停止。遇到取消/未知结果保留原失败，不执行自动恢复或补杀；新服务依然只能由正式启动入口登记。

脚本使用已选 UAC 的内存权限协调器；普通权限可以停止服务就不会弹 UAC。此入口不测常驻 Helper 初始化/Go 内部耗时，也不修改实际权限设置。默认是冷 Node 进程，不是正在运行 FlyEnv 的 UtilityProcess，导入、参数准备和额外测试预检单独记入 `test.*`，不纳入 `test.stop-service`。

## 报告与阶段含义

报告写入忽略目录 `tmp/windows-service-stop-timing/<UUID>/report.json`，原始事件保留 start/end，控制台显示各实例汇总及阶段末态。`serviceIndex` 从 1 开始区分版本；无编号为批次准备，`test.serial-batch` 为串行批次总耗时。

| 阶段 | 含义 |
| --- | --- |
| `test.stop-service` | 单实例完整真实停止后端，总时间的主要口径 |
| `php.stop.discover-processes` | 停止前完整 CIM 进程表，用于父归属/原树发现 |
| `php.stop.read-pid-file` / `identify-parents` | 私有 PID 文件读取及内存父归属筛选 |
| `php.stop.execute-and-confirm` | 本版本全部已确认树统一执行停止并确认退出 |
| `service.stop.parent-trees` | 公共父树停止，包含权限动作成本，首次身份来自发现列表 |
| `process-stop.capture-identity` | 无首次列表的工具调用保留；正常 PHP 停止不再启动此采样管道 |
| `process-stop.fallback-cim-identity` | 原生 StartTime 访问拒绝后，以 CIM 恢复身份 |
| `ordinary.pipe-ready` / `broker.compile` | 创建管道 broker 的总成本 / 其中的 Add-Type 编译 |
| `ordinary.launch-and-result` / `action.execute` | 普通动作客户端启动至可信终态 / 其中脚本真正执行 |
| `privilege.resolve-method` / `acquire-lease` | 授权方式解析及 FIFO 排队；只有必要时才出现 |
| `uac.*` / `launcher.runas` | 提升管道及 RunAs，包括用户响应，不能算纯 kill 时间 |
| `service.exit.poll` / `poll-delay` | 每轮完整查询 / 仍有进程时 200ms 退避 |
| `php.stop.check-version-residuals` | 使用确认退出的列表，在内存筛选本版本残留 |
| `service.stop.remove-pid-file` | 复用最终列表，按当前文件值删除本次已退出的登记；无额外进程查询 |
| `process-list.powershell-query` / `parse` | 每次完整 CIM 的实际 PowerShell 启动/查询成本 / JSON 解析 |

`queryCount` 和 `queryMs` 只统计该实例内 `process-list.powershell-query` 的次数和合计，不把包含它的父阶段重复加进去。`action.execute` 同时包含身份复核、taskkill/Stop-Process、句柄等待；若该值很小而父阶段很大，主要是执行器启动和管道成本。若原树确认出现多轮 `poll-delay`，才说明停止后的残留在延长等待。纯 taskkill 与每个 Windows API 的微观耗时尚未拆分。

## 后续优化依据

先根据报告判断是否由全量 CIM 或管道启动主导。可以考虑复用同一停止后快照完成原树、版本残留和 PID 清理，以及在保持同来源创建身份核对与权限边界的前提下缩短普通停止链路；本次不先放宽查询/归属，也不先把退出改并行。没有真实报告前不承诺优化幅度。

## 实施文件与当前验证

- `scripts/windows-service-stop-timing-test.ts`：参数整批验证、版本配置推断、同进程权限桥、真实停止/只读模式、逐实例汇总和 JSON 报告；`package.json` 提供 `test:windows-service-stop-timing` 入口。
- `Php.win/index.ts`：在原有步骤加观察器，保留原目标、顺序、停止结果和文件清理条件。
- `Base/index.ts`：退出轮询每轮查询和 200ms 退避分别计时，不复用停止前快照。
- `Process.win.ts`：全量 PowerShell/CIM 与 JSON 解析分别计时，严格错误仍抛出。
- `WindowsPrivilegeOperation.ts`：父身份采样与 CIM 恢复单独计时；必要的 Helper 分派记录合计，诊断脚本本身使用 UAC 偏好。
- 未修改 Go，因此不递增 Helper 32；计时上下文关闭时不输出计时事件，也不改变授权策略。

当前环境执行 `yarn test:windows-service-stop-timing --self-check` 被 tsx/esbuild 子进程启动限制阻止（`spawn EPERM`），未进入自检主体。改用 Node + TypeScript 内存转换，提取脚本实际 `parseOptions`、`selfCheck` 方法并调用实际计时工具完成无子进程自检：参数校验、中文/空格路径、计时启用/隔离，以及六个关联 TypeScript 文件的语法诊断均通过。此替代方法不覆盖 CLI 全量模块导入、Electron IPC、PowerShell 查询或实际停止；没有全仓类型检查、产物构建或真实服务操作。

## 用户实测与两次全量查询调整

用户提供的 PHP 8.0/7.3 报告：完整停止为 8054.589ms/7118.084ms，各四次全量 CIM 合计 2768.818ms/2764.060ms；身份采样含管道为 2706.170ms/1991.313ms，实际停止含管道为 2453.119ms/2282.337ms。全程普通权限成功，停止后第一次查询即可确认原树已退出，没有残留退避；串行合计 15173.163ms。

原来停止后的三个用途分别调用查询，是实现重复，而不是需要三个不同采样时点。现按用户建议调整：

1. 停止前严格全量查询一次，确认父归属，并从同一列表收集原父与全部后代。
2. 共享权限层复用首次列表新增的 CREATED/EXECUTABLE 根身份执行停止，不再启动独立父身份采样管道；执行端按根读取并复核同来源创建身份仍保留，这不是全量 CIM 查询。
3. 停止后严格全量查询一次，确认第一步全部 PID 消失；若还有原 PID 存活才继续有界轮询。
4. 共享 `ServiceStop` 的等待返回确认退出时的列表，Base 只包装该接口；PHP 和其他 Windows 模块在内存做必要残留检查，用同一列表清理 PID 文件；删除前仍重新比对当前文件值。

正常有目标且首轮确认成功时，`queryCount` 应从 **4 降为 2**。`php.stop.check-version-residuals` 变为纯内存检查，`php.stop.pid-cleanup-query` 不再出现。没有目标/没有执行停止时只使用发现快照，无需额外查询；严格查询失败、目标仍存活或版本新残留仍失败，不发送成功终态。

这次不跨实例缓存进程表，也不删除执行前父身份复核。减少两次停止后查询对应原报告每实例约 1.4 秒；进一步取消独立父身份采样对应原报告约 2.0–2.7 秒的管道成本，不能把这些历史值直接当成新版本的实测收益。后续退出等待也已复用首次创建时间，在证据完整时区分原目标与同 PID 新占用者；字段缺失时仍保守等待，不补杀新进程。

## 首次身份与公共停止收尾合并

上述两次全量查询方案已经推广到公共执行路径。首次全量 CIM 同时返回 CREATED 创建时间，不增加逐 PID 查询；公共执行器通过本次异步上下文携带根身份到普通/UAC/Helper 边界。PHP 有效父树和由专用 ini/安装路径确认的孤立根合为一次公共停止；不再出现独立 `kill-orphans`、`pid-cleanup-query` 或首次列表路径中的 `process-stop.capture-identity`。

项目/自定义服务的相同登记停止流程，以及常规模块、数据库和伴随 Runtime 的 Windows 等待/清理已收口。MySQL/MariaDB 原生关闭后的等待/回退也共用实现，取消固定 1500ms 睡眠；查询失败不再触发强制回退，只有已知残留超时允许回收原树。PostgreSQL/MongoDB 原生关闭策略保留。详细文件、原因与边界见 [Windows 服务停止快照与公共阶段合并](windows-service-stop-snapshot-unification.md)。

本轮没有运行耗时脚本或真实服务操作。正常 PHP 的预期口径是两次全量查询、一次父树停止动作，无独立父身份采样；实际速度需重新启动待测版本后复测。已有测试预检/模块导入属于 `test.*`，不计入单实例后端耗时。

后续修正历史 PPID 引起的假残留：公共建树在首次列表中排除创建时间早于父的假子，退出等待复用首次创建身份，超时报错只列实际未退出的目标并记录 `[ServiceStop][exit-timeout]`。没有增加全量查询或独立 worker 采样。详细证据和边界见快照合并文档的“PHP 已停止却退出确认超时”一节；本修复尚无实际停止复测结果。

## 用户复测：公共停止与假残留修复后的结果

用户随后提供 `tmp/windows-service-stop-timing/cc574ab8-c54c-4652-8488-5af34c74462e/report.json`，同样以 apply 串行停止 PHP 8.0.30 和 7.3.33，整批 status 为 ok。

- PHP 8.0：5411.622ms，较前次 8054.589ms 减少 2642.967ms（约 32.8%）；全量查询 2 次、合计 1762.911ms；父树执行合计 3589.948ms，执行脚本内部 942.829ms；首轮退出确认查询 996.175ms。
- PHP 7.3：6227.700ms，较前次 7118.084ms 减少 890.384ms（约 12.5%）；全量查询 2 次、合计 3149.479ms；父树执行合计 3038.613ms，执行脚本内部 1098.704ms；首轮退出确认查询 2403.769ms。
- 两实例后端串行合计 11639.747ms，较前次 15173.163ms 减少 3533.416ms（约 23.3%）。CLI 总 17.04 秒还包含模块导入、测试预检等，不等于 FlyEnv 服务停止或退出总耗时。

两实例都只提交一个父根，目标集合各 9 个 PID；未出现独立 capture-identity、第二次孤立 worker kill、退出等待退避或 ServiceProcessExitTimeoutError。残留内存检查分别约 1.0/1.2ms，删除 PID 文件约 0.4/0.2ms。这次采样的正常 PHP 停止链路达到两次全量查询预期，完整后端返回成功；它没有保存实际每条父子边，不能单独作为历史 PPID 特定现场的受控重现证明。

当前主要固定成本仍是 PowerShell 管道准备/动作客户端启动和完整 CIM 查询。普通动作合计 3518.594/3034.758ms，其中脚本执行约 0.94/1.10 秒；剩余启动/传输等成本约 2.58/1.94 秒。PHP 7.3 的最后查询由前次约 0.7 秒增至 2.4 秒，说明查询成本存在波动；没有 poll-delay，不能把这 2.4 秒描述为 worker 不肯退出。查询和动作包含关系不能重复累加，单次数据也不能承诺固定优化百分比。

此复测全程普通权限成功，没有触发 UAC，也不覆盖 Go Helper RPC、main 退出 drain 或 renderer IPC。翻译缺键日志没有阻止后端成功，它属于诊断脚本的日志/语言加载问题，未在本次报告整理中修改翻译或服务逻辑。本轮仅读取用户报告并更新说明，没有执行测试脚本、真实停止、构建或新增代码。
