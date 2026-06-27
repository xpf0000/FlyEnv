# FlyEnv MCP Update Site UI Parity Design

日期：2026-06-27

## 背景

FlyEnv UI 编辑站点时，前端会把编辑后的完整 `AppHost` 直接传给 fork 进程的 `host.handleHost(..., 'edit', old)`，因此 UI 已支持修改主域名、备注、端口、SSL、反向代理等字段。

FlyEnv MCP 的 `update_site` 最终也会调用相同的 fork 编辑能力，但在主进程先经过一层 MCP 专用的 schema 与 patch 合并逻辑。当前这层仅允许修改部分字段，因此出现了和 UI 不一致的问题：

- UI 可以修改主域名 `name`，MCP 不行
- UI 可以修改 `mark`、`reverseProxy`、`frankenphp` 端口、`tomcat` 端口，MCP 不行
- MCP 的编辑能力不是 fork 不支持，而是主进程这一层提前把字段挡掉了

用户要求本次变更把 MCP `update_site` 的可编辑字段尽量对齐到 UI 编辑器能力，但不重做 fork 编辑逻辑。

## 目标

1. 让 MCP `update_site` 支持 UI 编辑器中已支持的主要站点字段。
2. 保持 MCP 最终仍走 fork 的 `host.handleHost(..., 'edit', old)`，与 UI 编辑路径对齐。
3. 保持现有 `siteName` 语义不变，仍作为“旧主域名 / 查找键”使用。
4. 当调用方提供新的 `name` 时，按 UI 相同逻辑规范化为 hostname 后再提交。

## 非目标

- 不重构 fork 侧 `Host` 模块编辑逻辑。
- 不把 MCP `update_site` 改成无约束透传完整 host 对象。
- 不新增独立的 `rename_site` 工具。
- 不修改 UI 编辑器本身。
- 不处理 UI 尚未暴露的内部字段。

## UI 对齐范围

本次 MCP `update_site` 需要对齐的 UI 可编辑字段如下。

### PHP 站点

- `name`
- `alias`
- `mark`
- `root`
- `phpVersion`
- `useSSL`
- `autoSSL`
- `ssl.cert`
- `ssl.key`
- `port.nginx`
- `port.apache`
- `port.caddy`
- `port.frankenphp`
- `port.nginx_ssl`
- `port.apache_ssl`
- `port.caddy_ssl`
- `port.frankenphp_ssl`
- `nginx.rewrite`
- `reverseProxy`

### Tomcat 站点

- `name`
- `mark`
- `root`
- `useSSL`
- `autoSSL`
- `ssl.cert`
- `ssl.key`
- `port.tomcat`
- `port.tomcat_ssl`

说明：

- MCP 现有已支持字段继续保留。
- 本次不强行限制“PHP 字段只能用于 PHP 站点 / Tomcat 字段只能用于 Tomcat 站点”，仍沿用现有 patch 合并风格，把约束交给现有 host 校验与配置生成逻辑。

## 推荐方案

采用最小改动方案：只修改 MCP 主进程层，不改 fork 编辑能力。

具体包括：

1. 扩展 `src/main/core/MCPServer.ts` 中 `update_site` 的 `inputSchema`
   - 增加 `name`
   - 增加 `mark`
   - 扩展 `port`，纳入 `frankenphp`、`frankenphp_ssl`、`tomcat`、`tomcat_ssl`
   - 增加 `reverseProxy`

2. 扩展 `src/main/core/MCPTools.ts` 中的 patch 合并白名单
   - 把 `name`、`mark` 纳入可编辑字段
   - 保留 `reverseProxy`
   - 允许更完整的 `port` 子字段透传

3. 在 MCP 主进程层补一层与 UI 一致的主域名规范化
   - 若 patch 中有 `name`，把它规范化为 hostname
   - 例如 `https://demo.test:8443` 最终写入 `demo.test`

4. 保持后续链路不变
   - `findSiteByName(siteName)`
   - `mergeHostPatch(site, patch)`
   - `callFork(..., 'host', 'handleHost', updated, 'edit', site)`
   - `finalizeHostMutation(...)`

这样可以保证：

- MCP 和 UI 最终走相同 fork 编辑入口
- hosts 写入、Web 服务重载、UI 刷新继续复用现有逻辑
- 调整范围集中在 MCP 主进程层，回归风险最小

## 风险与兼容性

### 风险

1. `name` 改名后会影响 hosts、证书和 vhost 生成结果，这是预期行为，但必须靠真实 MCP 测试确认链路无回归。
2. 增加更多 `port` 字段后，MCP 调用方更容易传出与站点类型不匹配的端口字段，但这与 UI 当前“完整 host 编辑”模式本质一致，风险可接受。

### 兼容性

- 旧的 `update_site` 调用保持兼容，因为 `siteName` 和既有字段都不变。
- 新增字段全部为可选字段。
- 不影响 `create_site`、`delete_site`、`list_sites` 或 UI 编辑器本身。

## 验证

1. 回归测试覆盖 MCP `update_site` 能修改 `name`，并把新主域名传给 fork 的 `handleHost`。
2. 回归测试覆盖 `mark`、`reverseProxy`、`port.frankenphp`、`port.frankenphp_ssl`、`port.tomcat`、`port.tomcat_ssl` 能透传。
3. 运行现有 MCP 回归测试，确认站点后续收尾链路无回归。
4. 真实调用一次 MCP：
   - 创建旧域名站点
   - `update_site` 修改为新主域名并启用 SSL
   - 确认 `list_sites`、hosts、站点访问入口与 UI 刷新链路一致
