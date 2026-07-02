# FlyEnv MCP Create Site Default Auto SSL Design

日期：2026-06-27

## 背景

当前 FlyEnv 的 MCP `create_site` 会在未显式传入 SSL 字段时，按 `useSSL: false`、`autoSSL: false` 创建站点。

这与本轮 MCP 使用目标不一致：通过 MCP 新建本地站点时，默认应直接启用 SSL，并使用 Auto SSL 自动签发与写入证书材料。

同时，用户明确要求本次调整只影响 MCP 创建站点默认值，不修改 FlyEnv UI 手动新建站点的默认行为。

## 目标

1. MCP `create_site` 在未显式传入 `useSSL` / `autoSSL` 时，默认创建为 `true`。
2. 调用方如果显式传入 `useSSL: false` 或 `autoSSL: false`，仍然按传入值生效。
3. UI 手动创建站点默认值保持现状，不受本次改动影响。

## 非目标

- 不修改 [src/render/components/Host/Edit.vue](E:/Github/FlyEnv/src/render/components/Host/Edit.vue) 的默认值。
- 不修改 Tomcat 站点编辑器默认值。
- 不修改现有 `update_site`、`delete_site`、站点列表刷新、hosts 写入或 Web 服务重载逻辑。

## 方案

采用最小改动方案：只修改 [src/main/core/MCPTools.ts](E:/Github/FlyEnv/src/main/core/MCPTools.ts) 中 MCP 创建站点使用的默认骨架 `defaultHost()`。

具体行为：

- 把 `defaultHost()` 中的 `useSSL` 默认值改为 `true`
- 把 `defaultHost()` 中的 `autoSSL` 默认值改为 `true`
- 保留 `buildHostFromInput()` 里对显式输入的覆盖逻辑不变

这样 MCP `create_site`：

- 未传 SSL 字段时，得到默认开启 SSL + Auto SSL
- 显式传入字段时，仍然尊重调用参数
- 不会影响 UI 侧手动建站入口，因为 UI 并不走这套 MCP 默认骨架

## 风险与兼容性

主要风险是默认行为变化后，MCP 新建站点会立即触发 Auto SSL 证书生成流程。该行为本身符合预期，但会比原来多一次证书材料落盘。

兼容性上，本次改动仅作用于 MCP `create_site` 的“未传字段默认值”，对显式传参调用和非 MCP 路径保持兼容。

## 验证

1. 回归测试覆盖 `tools.createSite({ name, root })` 传给 `host:handleHost` 的对象默认包含 `useSSL: true`、`autoSSL: true`。
2. 验证显式传入 `useSSL: false` / `autoSSL: false` 的覆盖逻辑未被破坏。
3. 运行现有 MCP 回归测试，确认站点后续收尾链路未回归。
4. 真实调用一次 MCP `create_site`，确认返回站点数据默认启用 SSL 与 Auto SSL。
