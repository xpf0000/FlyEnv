# MCP Timeout And Audit Cleanup Design

日期：2026-06-27

## 背景

本次 MCP 全量测试发现两个相关问题：

1. `service_status git` 会超时，进一步导致包含 `git` 的 `list_services(flags)` 和 `flyenv://services` 读取超时。
2. `audit.log` 里存在失败记录，但当前失败项来自测试时故意调用默认未启用工具，属于“应审计的失败”，不是产品行为错误。

根因已经定位为两层：

- `Version.allInstalledVersions()` 会在 `git` 分支调用 `this.Git.allInstalledVersions(setup)`，但 `Git` 模块没有实现该方法。
- `ForkPromise` 没有把 async executor 的 rejected promise 转成外层 reject。调用不存在的方法后，fork 侧请求会卡住而不是快速失败。

因此，这次修复的重点不是“隐藏失败审计”，而是修复真实挂起问题，并在修复后清空审计日志重新生成一份干净结果。

## 目标

1. `service_status git` 不再超时。
2. `list_services` 在传入全量 flags 且包含 `git` 时可正常返回。
3. `flyenv://services` 资源可正常读取。
4. fork 侧未来再出现类似 async executor 异常时，调用方能收到失败，而不是一直 pending。
5. `audit.log` 继续记录成功和失败两类事件，不改变当前审计语义。
6. 修复完成后清空现有 `audit.log`，重新执行 MCP 测试，只保留新的验证记录。

## 非目标

1. 不修改“未启用工具调用要记失败审计”的产品语义。
2. 不调整 `delete_site`、`install_service` 的默认白名单策略。
3. 不扩展新的 MCP tool 或 resource。
4. 不在本次修复里处理 GUI 层交互优化。

## 方案对比

### 方案 A：只给 `Git` 模块补 `allInstalledVersions()`

优点：

- 改动最小。
- 能直接消除当前 `git` 分支缺方法的问题。

缺点：

- `ForkPromise` 的异步异常吞掉问题仍然存在。
- 未来其它模块再出现同类错误时，仍然会表现为客户端超时。

### 方案 B：同时修 `Git.allInstalledVersions()` 和 `ForkPromise` 异常传播

优点：

- 既修当前缺陷，也补上异步异常传播的通用防线。
- 更符合“失败快速返回、不要挂起”的 MCP 服务要求。

缺点：

- 比方案 A 多一个底层改动，需要补一条针对 `ForkPromise` 的回归测试。

### 方案 C：在 `ServiceVersionManager` 或 `MCPServer` 层给全量查询加超时兜底

优点：

- 可以避免客户端一直等待。

缺点：

- 这是症状修复，不是根因修复。
- 会掩盖 fork 模块缺方法和 Promise 异常传播问题。
- 可能把真实模块错误错误地包装成缓存或协议层问题。

## 推荐方案

采用方案 B。

原因：

- 当前挂起是由 `Git` 模块缺方法直接触发的，必须在源头修掉。
- `ForkPromise` 传播异步异常是基础能力问题，不修的话同类问题会在别的模块重复出现。
- 审计语义本身没有错，不应通过“减少失败记录”来掩盖测试期间暴露出的真实异常。

## 详细设计

### 1. 为 `Git` 模块补齐 `allInstalledVersions()`

对齐 `Codex`、`ClaudeCode`、`Kimi`、`OpenCode`、`Hermes` 等非服务型模块的实现方式，在 `Git` 模块新增：

- `fetchAllOnlineVersion()` 返回空数组
- `allInstalledVersions()` 返回空数组

这表示：

- `git` 模块可以参与版本聚合流程
- 但它不向 MCP 暴露“FlyEnv 管理的已安装版本列表”
- `service_status git` 仍然可以工作，只是 `installed` 为 `0`，`versions` 为空数组

这和当前模块职责一致，因为 `Git` 在 FlyEnv 中更接近环境检查模块，而不是版本化服务模块。

### 2. 修复 `ForkPromise` 对 async executor 的异常传播

当前 `ForkPromise` 直接调用 `executor(...)`，如果 executor 是 async 函数并抛出异常，会产生一个未被接住的 rejected promise，外层 `this.promise` 既不 resolve 也不 reject。

修复方式：

- 包裹 `executor(...)` 的返回值
- 如果返回的是 thenable，给它补 `.catch(reject)`
- 同时保留同步 `throw` 到 `reject` 的路径

修复后，无论 executor 是同步抛错还是异步 rejected，调用方都能收到失败结果。

### 3. 审计日志处理方式

不修改 `MCPAudit` 的成功/失败记录语义。

修复完成后的审计验证流程为：

1. 停止当前人工测试。
2. 清空 [/Users/x/Library/PhpWebStudy/server/mcp/audit.log](/Users/x/Library/PhpWebStudy/server/mcp/audit.log)。
3. 重新执行回归与在线测试。
4. 检查新生成日志，只确认：
   - 不再出现本次已知超时链路产生的脏结果
   - 成功调用继续记录为 `success: true`
   - 预期失败继续记录为 `success: false`

### 4. MCP 验证边界

修复后的重点验证项：

- `service_status git`
- `list_services` 全量 flags
- `flyenv://services`
- 默认未启用工具的失败审计行为

本次不把高风险工具的确认弹窗测试纳入自动验证，因为那需要人工 GUI 交互，不影响这次根因修复闭环。

## 测试策略

### 代码级回归

1. 为 `ForkPromise` 增加一个最小脚本测试：
   - async executor 主动抛错
   - 断言调用方能收到 reject，而不是无限等待
2. 扩展现有 MCP 回归脚本或新增小测试，覆盖：
   - `Git` 模块具备 `allInstalledVersions()` 后不会再让版本聚合挂起

### 在线验证

1. `npx tsx scripts/mcp-regression-test.ts`
2. `npx tsx scripts/mcp-list-services-cache-test.ts`
3. `npx tsx scripts/toml-unification-test.ts`
4. `npx tsx scripts/mcp-smoke-test.ts http://127.0.0.1:7682 <token>`
5. `npx tsx scripts/mcp-diagnose-flags.ts http://127.0.0.1:7682 <token>`
6. 额外调用：
   - `service_status git`
   - `list_services` with all flags including `git`
   - `readResource(flyenv://services)`
   - `readResource(flyenv://sites)`

### 审计日志验证

1. 清空现有审计日志。
2. 重新执行在线验证。
3. 检查新日志确认：
   - 有新的 `service_status`、`list_services`、`read_resource` 成功记录
   - 不再出现由本次 `git` 挂起问题间接导致的异常测试结论
   - 若再次手动调用未启用工具，仍会记录失败审计

## 风险与回滚

### 风险

1. `ForkPromise` 是基础设施类，改动过宽会影响 fork 侧其它模块。
2. `git` 返回空版本列表后，少数依赖“必须有版本数组”的渲染逻辑可能暴露已有假设。

### 控制方式

1. `ForkPromise` 只补异常传播，不改 `on()`、`then()`、`catch()` 现有接口。
2. `Git` 的返回值与其它 AI/CLI 模块保持一致，降低兼容性风险。
3. 修复后优先跑现有 MCP 回归和在线脚本，不做额外大范围行为改动。

### 回滚方式

如果 `ForkPromise` 底层修改引发连锁问题，可先保留 `Git.allInstalledVersions()` 修复，单独回退 `ForkPromise` 改动，再针对异常传播做更小范围补丁。
