# Linux 端口查询修复计划

## 证据与目标

Debian ARM64 上 NUMA 53 / Tomcat 80 的最终进程为 UID 1000，持有
CAP_NET_BIND_SERVICE；普通 UID 1000 的 lsof / ss 无法读取其 fd 归属，root
lsof 可查到。端口页还把 IPC 失败当成空列表、查杀失败当成成功。
目标是准确查询端口归属，并保留查询/查杀真实终态。

## 边界与操作契约

- 固定只读 `tools.getPortPids(port)` 由 Linux Helper 查询；参数仅合法端口，
  固定 `/usr/bin/lsof`，沿用已有结构化解析。拒绝附加参数和任意命令。
- fork `fetchProcessPidByPort` 负责使用普通账户完整 ps 表按精确 PID 建树；
  macOS 查询与三端既有停止执行不扩大权限。Linux 查杀仍使用普通 UID 的 signal。
- renderer 操作 owner：`Tools/PortKill/Controller.ts` 模块单例，经 reactiveBind
  暴露查询、查杀、结果、错误；输入/选择/确认框仍属于挂载页面。
- lifetime：请求派发至声明的 IPC 终态，可跨页面卸载；code 200 为进度，
  code 0 为成功，其他 code 为失败；仅终态 IPC.off 并释放 operation。
- 重入：查询序列保留最新端口快照，重复查询复用正在进行的 operation，
  过时查询结果不覆盖最新请求；查杀快照 PID、重复调用复用 operation。
- 必要步骤：Helper 查询、ps 读取、signal；失败仅影响本请求，不能报端口空闲
  或查杀成功。停止的部分成功不重放，失败不自动提升停止权限。
- 查询后的界面刷新是附加动作：其失败不改写已成功的查杀结果。
- 无新 Pinia、共享配置、持久化或额外服务生命周期；无例外授权。

## 执行与验证

- [x] 先验证回归在旧实现失败：Linux 查询隐蔽 fd 的服务、失败不伪装空结果，
  controller 重入/进度/终态清理与最新查询胜出。
- [x] 接入固定 Linux 只读 RPC，沿用完整进程建树；实现 controller 并绑定页面。
- [x] Helper 升 v47、同步契约/发行标记，重建六种平台产物。
- [x] 执行相关 TS / Go / renderer 边界与 Linux 原生端口验证；复核新增失败边界。

当前 VM 正在运行用户的 NUMA / Tomcat；原生验证只读查询其端口，不停止它们。

## 验证与复核记录

- `unix-process-ordinary-test.ts` 先在 Linux 普通 lsof 空结果分支失败，接入 Helper
  后通过；同时验证 macOS 继续普通查询、查询失败与非法端口真实传播。
- 新 `TestLinuxPortOwnershipQuery` 先因 dispatcher 拒绝 RPC 失败，接入后在 Debian
  ARM64 原生通过：固定系统 lsof 不受恶意 PATH 影响；临时 TCP 监听可查询、关闭后
  返回空结果；非法端口、非字符串和附加选项被拒绝。既有任意 root 操作仍被拒绝。
- 原生只读查询实际 Tomcat 80（PID 3587）、NUMA UDP/TCP 53 与 API 5380
  （PID 3885）、root cups IPv4/IPv6 631（PID 882）通过；未结束这些进程。
- controller 回归验证 duplicate、code 200 留存、终态 off/释放、查询失败不发空闲
  提示、查杀失败不发成功提示、最新查询/页面重入和附加刷新失败保留查杀成功。
- 独立 reviewer 发现查杀成功后的刷新可能复用相同端口的旧查询；新增重叠回归先因
  缺少新查询失败。现用查询 revision 丢弃查杀前快照并再次查询，RED→GREEN；
  reviewer 复核确认解决，无其余重要问题。
- Helper contract/version、renderer-operation-boundaries、Unix process list/tree/kill、
  stop snapshot/batch、Linux helper chain 回归通过；变更 TS/Vue lint 通过。
- macOS Go `test ./...` / `vet ./...`、Linux arm64 test 编译与 amd64 vet、fork
  生产配置等效构建通过；六种 Helper 产物已重建，Linux 构建触发号升 85。
- 全项目 vue-tsc 仍为既有 65 条诊断，PortKill / Process 变更文件无诊断。
- 未提交/推送或升级 VM 系统 Helper；完整 UI 查询/选中查杀验收需新包与 v47 Helper。

失败边界复核：root 查询与普通 ps 是同一个查询的必要依赖，错误不会变空结果；
signal 失败保留已完成停止、不重放或自动提高权限；附加刷新独立报告失败。
