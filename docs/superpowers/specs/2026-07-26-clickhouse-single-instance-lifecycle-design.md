# ClickHouse 单实例生命周期修复设计

- 日期：2026-07-26
- 状态：已确认，待实施

## 目标

修复 ClickHouse 多版本安装时的服务状态串扰。FlyEnv 在任意时刻只运行一个
ClickHouse 版本；服务列表、侧边栏和主进程的进程登记必须始终指向同一个实际运行的版本。

## 根因

ClickHouse 的所有版本当前共用模块级 `clickhouse.pid`、配置目录、数据目录和默认端口。
通用 `Base._stopServer()` 同时会按模块进程名扫描 FlyEnv 目录下的所有 ClickHouse 进程。
因此，以版本 A 发起的停止可能终止版本 B；返回的 PID 集合又会使主进程和渲染端的版本状态
与实际进程失去对应关系。

## 范围与约束

- 保持现有产品语义：ClickHouse 是单实例服务，启动版本 B 会替换正在运行的版本 A。
- 保持共享的 `config.xml`、`users.xml`、数据目录及 8123/9000 默认端口；不支持并行运行多个版本。
- 不修改其他模块的通用生命周期行为。
- 保留停止 ClickHouse 时清理 CH-UI 的现有行为。

## 方案

ClickHouse 模块实现专属生命周期管理，而不是调用通用的按模块扫描停止逻辑。

1. 为每个 ClickHouse 二进制生成稳定且文件名安全的版本 PID 文件，位于 FlyEnv 的 PID 目录。
2. 启动版本 B 时，模块先有意识地停止所有由 FlyEnv 管理的 ClickHouse 服务进程，清理陈旧的
   ClickHouse PID 记录，再以 B 的版本级 PID 文件启动进程。
3. 直接停止版本 A 时，只读取 A 的版本级 PID，并要求该根进程的命令行仍包含 A 的二进制路径；
   不匹配则只清理陈旧 PID 记录，绝不停止其他版本。
4. 启动与停止均返回准确的 PID 集合。主进程继续按 PID 登记/删除服务实例，渲染端继续按实例
   `bin` 匹配版本行；这使服务表和侧边栏只反映真实运行版本。

## 数据流

```text
启动 B
Renderer B.start
  -> ClickHouse.startService(B)
  -> 停止受 FlyEnv 管理的当前 ClickHouse 进程（返回 A 的 PID）
  -> 以 B 的版本 PID 启动（返回 B 的 PID）
  -> Main ServiceProcess: 删除 A、登记 B
  -> Renderer: 仅 B.run = true，侧边栏当前版本为 B

停止 A
Renderer A.stop
  -> ClickHouse.stopService(A)
  -> 仅验证并终止属于 A.bin 的 PID
  -> Main ServiceProcess: 仅删除实际终止的 PID
  -> Renderer: 不会改写其他版本的运行状态
```

## 错误处理与兼容性

- 陈旧 PID、PID 复用或命令行不匹配时，不发信号给该 PID，并删除对应 PID 文件。
- 切换版本时，遗留的旧模块级 `clickhouse.pid` 会被一并清理，避免旧版本安装留下的记录继续影响操作。
- 启动失败时不登记新 PID，保留主进程和渲染端已有的失败处理路径。

## 验收与回归测试

新增独立 ClickHouse 生命周期回归脚本，验证：

1. 版本 PID 文件按二进制路径隔离且稳定；
2. 切换版本返回旧版本的停止 PID 与新版本的启动 PID；
3. 停止非当前版本不会匹配或终止当前版本；
4. 生命周期实现不再依赖 ClickHouse 的通用宽匹配停止路径；
5. 既有 ClickHouse 配置页和 CH-UI 回归脚本继续通过。
