# FlyEnv MCP 完整测试方案

> 目标：验证 MCP Server 的启动/停止、鉴权、工具调用、审批策略、审计日志、渲染层 UI 以及客户端配置写入等全流程是否正常工作。

## 一、测试环境准备

1. **构建并启动 FlyEnv**
   ```bash
   yarn build   # 或 yarn dev
   ```
2. 打开 FlyEnv 主界面，进入 **MCP Server** 面板。
3. 确认面板能正常加载（无白屏、无 `global.Server` 相关崩溃）。
4. 记下当前 **Token**（面板里可查看，或点击重新生成）。
5. 确认本机已安装待测试的 AI CLI（可选）：`claude`、`codex`、`opencode`。

---

## 二、启动与停止（冒烟测试）

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 完全退出 FlyEnv 后重新启动 | 应用正常启动，**MCP Server 默认不自动运行** |
| 2 | 进入 MCP 面板，查看状态 | 状态显示为 **Stopped** |
| 3 | 点击 **Start** | 状态变为 **Running**，端口/地址显示正确 |
| 4 | 点击 **Stop** | 状态变回 **Stopped**，再次点击 Start 可恢复 |
| 5 | 关闭 FlyEnv 时若 MCP 正在运行 | 应用退出前 `mcpServer.stop()` 被调用，无端口占用残留 |

> 回归点：启动应用时控制台不应再出现 `Cannot read properties of undefined (reading 'BaseDir')`。

---

## 三、HTTP 接口测试

MCP Server 默认监听 `http://127.0.0.1:7682`（可在面板修改）。

### 3.1 使用 SDK 客户端脚本（推荐）

创建一个临时测试脚本：

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const url = process.argv[2] || 'http://127.0.0.1:7682'
const token = process.argv[3]

const client = new Client({ name: 'test', version: '1.0.0' })
const fetchWithAuth = (target: any, init: any) => {
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return fetch(target, { ...(init || {}), headers })
}
const transport = new StreamableHTTPClientTransport(new URL(url), { fetch: fetchWithAuth })
await client.connect(transport)

console.log('tools:', await client.listTools())
console.log(
  'list_services:',
  await client.callTool({ name: 'list_services', arguments: {} })
)
console.log(
  'service_status:',
  await client.callTool({ name: 'service_status', arguments: { flags: ['nginx'] } })
)

await client.close()
```

运行：

```bash
npx tsx /path/to/test.ts http://127.0.0.1:7682 <token>
```

### 3.2 最小 curl 验证（不带鉴权应被拒绝）

```bash
# 无 token，应返回 401
curl -i -X POST http://127.0.0.1:7682

# 带 token，可拿到工具列表（需符合 StreamableHTTP 的 JSON-RPC 格式）
curl -X POST http://127.0.0.1:7682 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

### 3.3 必测工具清单

按优先级逐个调用，确认返回结构符合 `MCPToolResult`（`{ content: [{ type:'text', text:string }] }`）：

| 工具 | 测试参数示例 | 关注点 |
|------|--------------|--------|
| `list_services` | `{}` 或 `{ flags: ['nginx','mysql'] }` | 返回服务列表与运行状态 |
| `service_status` | `{ flags: ['nginx'] }` | 能正确返回运行/未运行 |
| `list_log_files` | `{ flag: 'nginx', versionBin: '...' }` | 返回真实日志路径及 `exists` 标记 |
| `list_config_files` | `{ flag: 'nginx', versionBin: '...' }` | 返回真实配置路径及 `exists` 标记 |
| `list_online_versions` | `{ flag: 'nginx' }` | 返回可安装版本列表 |
| `list_sites` | `{}` | 返回本地站点列表 |
| `start_service` / `stop_service` / `restart_service` | `{ flag: 'nginx', versionBin: '...' }` | 危险工具，需验证审批弹窗 |
| `create_site` / `update_site` | 见工具 schema | 写操作，需验证审批与回滚 |
| `delete_site` / `install_service` | 默认不在白名单 | 确认默认被拒绝/需手动开启 |

---

## 四、鉴权与安全测试

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 请求不带 `Authorization` 头 | HTTP 401 |
| 2 | 带错误 token | HTTP 401 |
| 3 | 关闭 "Allow remote access" 后，从局域网另一台机器访问 | 连接被拒绝（仅监听 127.0.0.1） |
| 4 | 开启 "Allow remote access" 后，非 127.0.0.1 访问 + 正确 token | 可连通（按需测试） |
| 5 | 工具白名单测试 | 关闭 `list_sites` 后，调用返回 `tool disabled`；开启后恢复 |
| 6 | `maskSecrets` 开关 | 开启后，含 `password`/`token` 的返回值应被掩码（若实现） |

---

## 五、审批策略测试

1. 在 **Tools** 标签页，把 `start_service` 的审批策略设为 **Confirm**。
2. 通过 MCP 客户端调用 `start_service`。
3. 预期 FlyEnv 弹出系统原生确认框：
   - 点击「取消」→ 工具返回失败/拒绝。
   - 点击「确认」→ 服务正常启动，审计日志记录成功。
4. 把策略改回 **Auto**，再次调用，应无弹窗直接执行。

---

## 六、渲染层 UI 测试

| 页面/标签 | 检查项 |
|-----------|--------|
| **Service** | 状态显示、Start/Stop 按钮、token/host/port 展示正确 |
| **Client Config** | HTTP / stdio 两个 radio 按钮在标题右侧；切换后内容正确；Copy 按钮可用；Add to Client 按钮写入配置文件 |
| **Tools** | 列表可滚动；每个工具名称下方有说明；risky 标签显示；开关能保存；审批策略能保存 |
| **Audit Log** | 页面结构与 Nginx 日志一致；无卡片标题和说明；自动刷新；open/refresh/clean 工具栏可用 |

---

## 七、Fork 模块配置/日志路径测试

目的：确认 `getConfigFiles` / `getLogFiles` 返回真实路径。

1. 在 MCP 面板启动服务后，调用 `list_config_files` / `list_log_files`。
2. 抽样检查以下模块：
   - `nginx`、`apache`、`mysql`、`redis`、`php`、`caddy`
   - `tomcat`、`mailpit`、`minio`、`qdrant`、`rabbitmq`、`etcd`、`consul`
3. 确认返回的 `path` 与 FlyEnv 实际使用的路径一致，`exists` 标记准确。
4. 对于无配置/日志的模块（如 `memcached`、`ftp-srv`、`pure-ftpd`），确认返回空数组 `[]`。

---

## 八、客户端配置写入测试

测试前提：本机已安装对应 CLI。

| 客户端 | 点击按钮后检查 | 预期配置文件内容 |
|--------|----------------|------------------|
| **Claude Code** | `~/.claude.json` | `mcpServers.flyenv = { type:'http', url, headers:{Authorization:'Bearer ...'} }` |
| **Codex** | `~/.codex/config.toml` | `[mcp_servers.flyenv] url=... http_headers={Authorization="Bearer ..."}`，且 `[features] rmcp_client = true` |
| **OpenCode** | `~/.config/opencode/opencode.json` 或 `.jsonc` | `mcp.flyenv = { type:'remote', url, headers:{Authorization:'Bearer ...'} }` |

> 注意：直接写配置会覆盖同名的 `flyenv` 条目，其他 server 配置应保持不变。

---

## 九、审计日志测试

1. 每成功或失败调用一次 MCP tool，检查审计日志文件（`MCPAudit.getLogFile()`，即 `BaseDir/mcp/audit.log`）。
2. 日志应为 NDJSON，每行包含：`time`、`tool`、`args`、`success`、`error`。
3. 在面板 **Audit Log** 标签页应能实时看到新增记录。
4. 点击 Clean 按钮后，审计日志被清空。

---

## 十、stdio Bridge 测试

1. 在 MCP 面板切换到 **stdio** 配置。
2. 点击复制 stdio 配置片段。
3. 确认片段包含正确的 `bridgePath`、`FLYENV_MCP_URL`、`FLYENV_MCP_TOKEN`。
4. 手动运行 bridge 脚本测试：
   ```bash
   FLYENV_MCP_URL=http://127.0.0.1:7682 FLYENV_MCP_TOKEN=<token> \
     node "<bridgePath>"
   ```
5. 向 bridge 的 stdin 发送 MCP initialize 请求，确认能正常转发并返回工具列表。

---

## 十一、回归测试

- [ ] 应用启动不再因 `MCPAudit` / `MCPBridgeManager` 访问 `global.Server.BaseDir` 而崩溃。
- [ ] MCP Server 默认不自动启动。
- [ ] 未启用 MCP Server 时，所有 `mcp:*` IPC 调用返回合理错误提示，不阻塞主界面。
- [ ] 关闭 MCP Server 后，端口 7682 被释放。

---

## 十二、通过标准

全部测试项满足以下标准视为通过：

1. 应用正常启动、退出，无 `BaseDir` 相关崩溃。
2. MCP Server 可手动启停，HTTP 接口鉴权有效。
3. `list_services`、`list_log_files`、`list_config_files`、`list_online_versions` 等只读工具返回正确数据。
4. 危险工具在 **Confirm** 策略下弹出确认框，**Auto** 策略下直接执行。
5. 工具白名单、远程访问开关生效。
6. 客户端配置一键写入后，对应 AI CLI 的配置文件格式正确且含 token。
7. 审计日志记录完整，Audit Log 页面能自动刷新。
8. stdio bridge 能正确转发请求。

---

## 十三、自动化冒烟脚本

已提供 `scripts/mcp-smoke-test.ts`，用 `@modelcontextprotocol/sdk/client` 自动完成：

- 错误 token 鉴权测试
- 正确 token 连接
- `tools/list` 与 `resources/list`
- 调用 `list_services`、`service_status`、`list_config_files`、`list_log_files`、`list_online_versions`
- 校验返回结构

运行方式：

```bash
npx tsx scripts/mcp-smoke-test.ts http://127.0.0.1:7682 <token>
```

若全部通过，终端输出 `all checks passed ✓`。
