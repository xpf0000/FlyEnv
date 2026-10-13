# Redis Commander 按钮修复

原因：按钮用 `currentVersion('node')` 判断是否可点击，但该查询不负责加载安装列表；NodeJS 隐藏或尚未完成扫描时，即使 Redis 已运行，按钮也会被禁用。没有 NodeJS 时同样没有可操作的提示。

实施计划：移除按钮的 NodeJS 可用性门禁，在既有 `RedisCommanderPanel` 内先加载 NodeJS 安装列表，再读取所选版本并发送请求；缺少版本或扫描失败显示带 NodeJS 名称的错误。复用现有扫描与服务生命周期，不添加共享配置、Pinia 或公共类型，无例外授权。

操作契约：所有者仍为模块单例 `RedisCommanderPanel`，生命周期跨页面挂载；点击即设置 opening，包含 NodeJS 扫描、安装及启动等待；重复点击忽略；200 为进度，0 或错误为终态；终态关闭通知、解绑请求、清除 opening。NodeJS 扫描及可执行文件是必要依赖，失败仅阻断 Commander 打开，不影响已运行 Redis；Redis 状态在扫描完成后重新读取。fork 继续拥有 Commander 进程及 Redis 停止时的伴随关闭。

验证计划：先以未加载 NodeJS 列表复现失败，再覆盖扫描中重入、进度保留、终态清理、缺少 NodeJS、扫描失败及重试、扫描期间 Redis 停止；更新 renderer-operation-boundaries 按钮契约并运行定向检查。

验证结果：新增 `yarn -s tsx scripts/redis-commander-panel-test.ts` 在修复前因未发起 NodeJS 扫描失败，修复后上述生命周期场景全部通过；`yarn -s test:renderer-operation-boundaries` 通过，Redis 页面、控制器和新增测试的 ESLint 及 `git diff --check` 通过。未做 GUI 实测。

既有检查问题：`test:redis-commander` 在未修改的后端测试第 347 行失败，预期停止错误 `Redis Commander did not stop before restart`，实际为 `process still running`；该测试及 Redis fork 文件与 HEAD 一致。公共 renderer-operation-boundaries 测试文件的未修改 llamaRuntimePage 行已有 Prettier 报错。本次不扩大修复范围。
