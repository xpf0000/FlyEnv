# MCP `list_services` 缓存读取设计

日期：2026-06-26

## 背景

当前 MCP `list_services` 最终走 `ServiceVersionManager.getVersionsBatch(flags)`。这条路径会对任意缓存 miss 的 flag 直接回源刷新，因此即使调用方没有传 `flags`，也可能触发重新拉取版本信息。

这和本次需求不一致：

1. 不传参数时，`list_services` 必须完全从主进程缓存返回。
2. 传了 `flags` 时，优先读缓存；只有缓存没有的 flag 才允许回源补拉。

## 目标

1. `list_services({})` 或 `list_services({ flags: [] })` 只返回当前缓存里已有的服务。
2. 上述场景不触发 `version.allInstalledVersions`。
3. `list_services({ flags: [...] })` 继续支持缓存 miss 时按需补拉。
4. 已缓存为空数组的 flag 视为“缓存里已有结果”，不重复回源。

## 方案对比

### 方案 A：只在 MCPServer 判断

无参数时改成 `getCachedFlags()` + 手工读 cache，有参数时保持当前逻辑。

优点：

- 改动小。

缺点：

- 缓存策略散落在调用层。
- 后续其它调用方如果也要区分“只读缓存”和“允许回源”，容易重复实现。

### 方案 B：在 `MCPTools` 和 `ServiceVersionManager` 明确两种读取模式

新增“只读缓存批量读取”能力；`MCPTools.listServices` 根据 `flags` 是否为空决定是否允许回源。

优点：

- 语义集中。
- MCPServer 只保留协议层转发，行为在 tools/cache 层统一。
- 更容易写行为测试。

缺点：

- 比方案 A 多一个辅助接口。

## 推荐方案

采用方案 B。

## 详细设计

### 1. `ServiceVersionManager`

新增只读缓存批量接口，按给定 flags 返回缓存快照，不触发 `refresh`。

保留现有 `getVersionsBatch(flags)` 行为：

- 先命中缓存
- 只对缺失 flag 批量 `refresh(missing)`

### 2. `MCPTools.listServices`

把 `flags` 改成可选参数：

- `undefined` 或 `[]`：
  - 取 `getCachedFlags()`
  - 走“只读缓存”批量接口
- 非空数组：
  - 走“缓存优先、miss 回源”批量接口

### 3. `MCPServer`

`list_services` handler 直接把 `args?.flags` 透传给 `MCPTools.listServices()`，不再自己拼接默认 flags。

### 4. 保持不变的部分

- `flyenv://services` resource 继续传完整 `MODULE_FLAGS`，保留全量视图能力。
- `service_status` 继续允许单个 flag 缓存 miss 时回源。

## 测试策略

补一个独立 TypeScript 行为测试，覆盖：

1. `listServices(undefined)` 不回源，只返回缓存内容。
2. `listServices([])` 与无参数等价。
3. `listServices(['a', 'b'])` 只刷新 miss 的 flag。
4. 缓存里已有空数组时，不重复刷新。
