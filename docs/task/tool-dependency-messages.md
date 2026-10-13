# 工具依赖提示修复

原因：Redis Commander 将 NodeJS 通用版本提示直接显示在 Redis 页面；DbGate、pgAdmin 的部分必要依赖提示也缺少工具名称或具体操作指引。

实施计划：增加带工具名称、运行时、模块入口的本地化依赖提示，另区分运行时扫描失败和数据库未启动；覆盖 Redis Commander、DbGate、pgAdmin 和 Neo4j 的无上下文依赖错误，并同步 fork 的缺失 NodeJS/Python/npm 提示。所有内置语言直接翻译。

操作契约：RedisCommanderPanel、DbGatePanel、PgAdminPanel 仍为模块单例，跨页面持有操作；沿用现有点击入口、重入保护、200 进度、0/错误终态及通知/监听/opening 清理。扫描失败、缺少运行时或运行中的数据库均为必要依赖失败，仅阻断当前面板打开；不停止数据库、不新增查询或重试。fork 继续拥有面板进程及伴随停止。Neo4j 仅替换绑定校验错误文字。

约束：仅修改错误文案与语言资源，不新增状态、持久化、Pinia、IPC 或生命周期流程；无需例外授权。保留原失败传播与清理边界，检查各 throw/return 不改变已完成操作结果。

验证计划：更新已有 Redis 面板用例，使用真实中英文语言资源核验工具名称、依赖名称及操作指引；运行现有面板生命周期、模块边界和定向依赖回归检查，检查语言占位符一致性及改动文件 lint。

验证结果：Redis Commander 面板用例先复现原提示 `NodeJS: Please select a version first` 缺少工具上下文，修改后中英文依赖提示、扫描失败、数据库未启动、重入、进度及终态清理全部通过。renderer-operation-boundaries、mongodb-dbgate、language-assets、neo4j-module-contract、postgresql-pgadmin-pip 检查通过；33 种语言 JSON、占位符、Prettier、改动 TS 文件 ESLint、git diff --check 通过。使用 devFork 同等 esbuild 参数、write:false 完成 fork 编译。独立只读审查无可操作问题；失败边界复查确认所有改动仅替换现有 throw/reject/提示的文字，不改变操作结果、前置条件或清理流程。未做 GUI 实测。

既有检查问题：

- `redis-commander-test.ts:347` 预期 `Redis Commander did not stop before restart`，实际为 `process still running`，与既有 `docs/task/redis-commander-button.md` 已记录的失败一致；本轮未改停止逻辑。
- `postgresql-pgadmin4-test.ts:1144` 断言源码存在 `pgAdminCommandOwned(command, paths, packageRoot, isWindows())`，HEAD 同样没有该调用形式；本轮未改相关停止逻辑。
- `neo4j-renderer-test.ts:78` 预期列宽 220，未改动的 Index.vue 与 HEAD 均为 160。

以上失败保留原状，不扩大文案修复范围；没有提交或发布。
