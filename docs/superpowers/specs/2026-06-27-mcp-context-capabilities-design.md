# FlyEnv MCP Context Capabilities Design

日期：2026-06-27

## 背景

当前 FlyEnv MCP 已经具备一组基础控制与信息查询能力：

- 服务查询：`list_services`、`service_status`
- 站点查询：`list_sites`
- 文件清单：`list_config_files`、`list_log_files`
- 控制操作：`start_service`、`stop_service`、`restart_service`
- 站点管理：`create_site`、`update_site`、`delete_site`

这套能力已经能让 AI Agent 看到 FlyEnv 管理的服务与站点，并触发基础控制操作，但还存在一个明显缺口：

- Agent 能拿到“原始列表”，但拿不到“可直接消费的本地开发上下文”
- Agent 仍然需要自行猜测 PHP 版本对应关系、数据库连接方式、站点 URL 集合、vhost 与证书文件路径
- 这些信息在 FlyEnv 内部其实已经存在，只是还没有以结构化、稳定、Agent 友好的形态暴露出来

因此，本设计新增一层只读的 `context tools`，把 FlyEnv 已知的本地环境事实整理成稳定接口，供 Codex、Claude Code、OpenCode、Kimi 等 AI CLI 直接消费。

## 目标

1. 让 Agent 可以准确解析某个站点实际绑定的 PHP、Web Server、env 文件、项目入口与关键托管文件。
2. 让 Agent 可以准确拿到本地数据库/缓存服务的连接材料，包括 `host`、`port`、`socket`、`user`、`password`、`bin`。
3. 让 Agent 可以准确拿到某个服务或运行时的执行材料，包括 `bin`、`path`、`phpBin`、`phpConfig`、配置文件与日志文件。
4. 让 Agent 可以准确拿到某个站点的规范访问入口集合，而不是只依赖单一 `url` 字段。
5. 保持 FlyEnv MCP 的职责边界，新增能力只提供环境事实，不提供通用执行入口。

## 非目标

本设计明确不引入下列 MCP 能力：

- `run_php`
- `run_mysql_query`
- `run_shell_command`
- `read_any_file`
- `tail_any_log`
- `exec_sql_file`
- `open_terminal_session`

原因如下：

1. AI CLI 本身已经具备本地 shell 与文件访问能力。
2. FlyEnv 的差异化价值是“环境管理”和“环境事实”，不是再包装一层通用执行平台。
3. 一旦引入执行层，权限模型、审计模型、超时控制、交互式进程管理与跨平台兼容复杂度会明显膨胀。

## 设计原则

1. `只提供 FlyEnv 已知事实`，不扩展为泛化 OS 能力。
2. `优先返回结构化数据`，避免让 Agent 解析长文本。
3. `能给路径就不给内容`，文件内容由 Agent 自行读取。
4. `能给执行材料就不给执行入口`，例如返回 `phpBin`、`socket`、`rootPassword`，但不提供 `run_php` 或 `run_sql`。
5. `默认只读、默认启用、默认无需审批`，与现有控制类高风险工具分层。
6. `来源可解释`，能区分字段来自运行态、配置文件、默认值还是推导值。

## 方案对比

### 方案 A：极简补强

新增 3 个工具：

- `resolve_site_runtime`
- `get_database_connection_info`
- `get_service_exec_info`

优点：

- 改动最小
- 首期实现最快

缺点：

- URL 与托管文件仍需 Agent 自行拼装
- 后续仍会追加新的上下文工具，接口族不完整

### 方案 B：完整上下文层

新增 5 个工具：

- `get_database_connection_info`
- `resolve_site_runtime`
- `get_service_exec_info`
- `resolve_site_urls`
- `get_managed_file_map`

优点：

- 形成完整的环境上下文层
- 仍然保持 FlyEnv MCP 作为环境控制面与环境事实来源，不向执行层漂移
- 足够覆盖本地开发中的高频 Agent 场景

缺点：

- 首期设计与测试面比方案 A 更大

### 方案 C：上下文层加少量文件读取助手

在方案 B 基础上，再补 `read_config_file`、`read_log_file` 这类受限读取工具。

优点：

- Agent 使用时更顺手

缺点：

- 边界开始向通用文件读取漂移
- 后续容易继续增长为半个执行层

## 推荐方案

采用方案 B。

原因：

1. FlyEnv 的 MCP 更适合作为环境上下文权威来源，而不是执行代理。
2. 当前代码已经默认向本地 Agent 暴露 `bin`、`path`、`phpBin`、`phpConfig`、`rootPassword`、`root`、`envFile`、`startCommand` 等关键执行材料，新工具主要是结构化重组，不是新开权限。
3. 这 5 个工具补齐后，Agent 基本可以稳定覆盖以下场景：
   - 用特定 PHP 版本执行某个文件
   - 用本地数据库连接材料执行 CRUD
   - 找到站点或服务相关配置、日志、证书与数据目录
   - 判断站点有效 URL、SSL 入口与反向代理入口

## 能力清单

本设计新增 5 个只读 `context tools`：

1. `get_database_connection_info`
2. `resolve_site_runtime`
3. `get_service_exec_info`
4. `resolve_site_urls`
5. `get_managed_file_map`

它们与当前已有控制类工具并列注册，不替代 `list_services`、`list_sites`、`start_service` 等现有能力。

## 详细设计

### 1. `get_database_connection_info`

#### 1.1 目的

一次性返回某个本地数据库或缓存服务的推荐连接材料，避免 Agent 猜测连接方式。

#### 1.2 支持范围

- `mysql`
- `mariadb`
- `postgresql`
- `redis`
- `mongodb`
- `memcached`

首期实现优先级：

1. `mysql`
2. `mariadb`
3. `postgresql`
4. `redis`
5. `mongodb`
6. `memcached`

其中 `mongodb` 与 `memcached` 首期允许以默认连接参数为主，若当前代码无法稳定解析模块级配置，则返回默认值并标注来源。

#### 1.3 输入

```json
{
  "type": "object",
  "properties": {
    "flag": {
      "type": "string",
      "enum": ["mysql", "mariadb", "postgresql", "redis", "mongodb", "memcached"]
    },
    "version": {
      "type": "string",
      "description": "Optional installed version. If omitted, prefer the running version, otherwise the enabled version."
    }
  },
  "required": ["flag"]
}
```

#### 1.4 输出

```json
{
  "flag": "mysql",
  "version": "8.4.0",
  "running": true,
  "host": "127.0.0.1",
  "port": 3306,
  "socket": "/tmp/mysql.8.4.0.sock",
  "user": "root",
  "password": "root001",
  "bin": "/path/to/mysqld",
  "path": "/path/to/mysql-8.4.0",
  "configFiles": [{ "name": "main", "path": "...", "exists": true }],
  "logFiles": [{ "name": "error", "path": "...", "exists": true }],
  "notes": ["Use socket on macOS/Linux when available."],
  "warnings": [],
  "sourceHints": {
    "port": "config",
    "socket": "derived",
    "password": "runtime"
  }
}
```

#### 1.5 字段规则

- `host`
  - 默认返回 `127.0.0.1`
  - 首期不解析多地址监听
- `port`
  - 优先从模块配置文件解析
  - 解析不到时返回模块默认端口
- `socket`
  - MySQL/MariaDB 按现有启动规则推导：
    - 多版本优先 `/tmp/mysql.<version>.sock`
    - 通用退化为 `/tmp/mysql.sock`
  - PostgreSQL、Redis 若当前配置或平台约定存在稳定 socket，再返回；否则可省略
- `user`
  - MySQL/MariaDB 默认 `root`
  - PostgreSQL 默认 `postgres`
  - Redis/Memcached/MongoDB 首期可返回空字符串或 `null`
- `password`
  - 仅在当前版本对象或稳定配置中可得时返回
  - `maskSecrets=true` 时返回 `******`
- `configFiles` / `logFiles`
  - 直接复用现有 `listConfigFiles` / `listLogFiles`
- `warnings`
  - 例如“configured port not found, fallback to default”
- `sourceHints`
  - 每个关键字段标明来源：
    - `runtime`
    - `config`
    - `default`
    - `derived`

#### 1.6 数据来源

- 版本对象：`SoftInstalled.bin`、`SoftInstalled.path`、`SoftInstalled.rootPassword`
- 运行态：`ServiceProcessManager`
- 配置文件清单：各服务模块已有 `getConfigFiles()`
- 日志文件清单：各服务模块已有 `getLogFiles()`
- 端口与 socket 解析依据：
  - `src/fork/module/Mysql/index.ts`
  - `src/fork/module/Mariadb/index.ts`
  - `src/fork/module/Postgresql/index.ts`
  - `src/fork/module/Redis/index.ts`

#### 1.7 行为边界

- 不执行 SQL
- 不验证账号实际登录是否成功
- 不探测网络连通性
- 只返回 FlyEnv 管理上下文里的推荐连接材料

### 2. `resolve_site_runtime`

#### 2.1 目的

把“站点”和“实际运行时”解构给 Agent，让它知道该站点真正依赖什么。

#### 2.2 输入

```json
{
  "type": "object",
  "properties": {
    "siteName": {
      "type": "string"
    }
  },
  "required": ["siteName"]
}
```

#### 2.3 输出

```json
{
  "site": {
    "name": "demo.test",
    "root": "/project/demo/public",
    "url": "http://demo.test",
    "alias": "www.demo.test",
    "envFile": "/project/demo/.env",
    "projectName": "demo",
    "projectPort": 5173,
    "startCommand": "yarn dev",
    "useSSL": true
  },
  "php": {
    "configuredVersion": 84,
    "resolvedVersion": "8.4.0",
    "bin": "/path/to/php-fpm",
    "phpBin": "/path/to/php",
    "phpConfig": "/path/to/php.ini",
    "running": true
  },
  "webServer": {
    "preferred": "nginx",
    "running": true,
    "version": "1.27.0",
    "port": 80,
    "sslPort": 443
  },
  "projectRuntime": {
    "projectName": "demo",
    "projectPort": 5173,
    "startCommand": "yarn dev"
  },
  "managedFiles": {
    "env": [{ "name": ".env", "path": "/project/demo/.env", "exists": true }],
    "config": [{ "name": "nginx-vhost", "path": "...", "exists": true }],
    "log": [{ "name": "nginx-access", "path": "...", "exists": true }],
    "cert": [{ "name": "ssl-cert", "path": "...", "exists": true }]
  },
  "warnings": []
}
```

#### 2.4 字段规则

- `site`
  - 直接基于当前 `AppHost` 可稳定暴露的字段
- `php.configuredVersion`
  - 来自 `AppHost.phpVersion`
- `php.resolvedVersion`
  - 从已安装 PHP 列表里按 `phpVersion` 匹配
- `php.running`
  - 基于 `ServiceProcessManager` 的 PHP 运行态映射
- `webServer.preferred`
  - 先按站点显式类型与当前可用服务判定
  - 若无法唯一确定，再按当前默认顺序回退：
    - `caddy`
    - `nginx`
    - `apache`
    - `frankenphp`
    - `tomcat`
- `projectRuntime`
  - 只有在 `projectPort`、`startCommand`、`projectName` 任一存在时返回
- `managedFiles`
  - 直接内嵌最关键的文件摘要，避免 Agent 为同一站点多调一次 `get_managed_file_map`

#### 2.5 数据来源

- 站点列表：`host.hostList()`
- PHP 版本匹配规则：渲染层当前站点解析逻辑，需抽到共享 helper
- Web Server 运行态：`ServiceProcessManager`
- 关键文件映射：`get_managed_file_map(site)`

#### 2.6 行为边界

- 不启动项目命令
- 不识别框架类型
- 不判断项目是否健康运行
- 只回答“FlyEnv 中此站点被怎样托管”

### 3. `get_service_exec_info`

#### 3.1 目的

给 Agent 一个服务或运行时的“执行材料总览”，适合后续在自身 CLI 中调用。

#### 3.2 输入

```json
{
  "type": "object",
  "properties": {
    "flag": { "type": "string" },
    "version": { "type": "string" }
  },
  "required": ["flag"]
}
```

#### 3.3 输出

```json
{
  "flag": "php",
  "version": "8.4.0",
  "running": true,
  "bin": "/path/to/php-fpm",
  "path": "/path/to/php-8.4.0",
  "phpBin": "/path/to/php",
  "phpConfig": "/path/to/php.ini",
  "rootPassword": null,
  "configFiles": [{ "name": "main", "path": "...", "exists": true }],
  "logFiles": [{ "name": "error", "path": "...", "exists": true }],
  "execHints": [
    "Use phpBin to execute CLI scripts directly.",
    "Use phpConfig to inspect the active php.ini."
  ],
  "warnings": []
}
```

#### 3.4 字段规则

- `bin` / `path` / `phpBin` / `phpConfig`
  - 基于当前 `serializeVersion()` 已可稳定拿到的字段
- `rootPassword`
  - 仅数据库类服务有意义
  - `maskSecrets=true` 时返回 `******`
- `configFiles` / `logFiles`
  - 直接复用现有接口
- `execHints`
  - 只提供建议性说明，不返回可直接执行的最终命令行字符串

#### 3.5 典型适配

- `php`
  - 重点返回 `phpBin`、`phpConfig`
- `mysql` / `mariadb`
  - 提示同目录通常可推导 `mysql`、`mysqldump`、`mysqladmin` 或 `mariadb`、`mariadb-dump`
- `postgresql`
  - 提示同目录可推导 `psql`、`pg_ctl`
- `redis`
  - 提示可推导 `redis-cli`

#### 3.6 行为边界

- 不直接执行命令
- 不保证 `execHints` 覆盖所有平台差异
- 只给出 FlyEnv 能确定的材料与建议

### 4. `resolve_site_urls`

#### 4.1 目的

返回站点在 FlyEnv 配置视角下的规范访问入口集合。

#### 4.2 输入

```json
{
  "type": "object",
  "properties": {
    "siteName": { "type": "string" }
  },
  "required": ["siteName"]
}
```

#### 4.3 输出

```json
{
  "primaryUrl": "https://demo.test",
  "urls": [
    "http://demo.test",
    "https://demo.test",
    "http://www.demo.test",
    "https://www.demo.test"
  ],
  "ssl": {
    "enabled": true,
    "autoSSL": true,
    "cert": "/path/to/demo.crt",
    "keyMasked": "******"
  },
  "aliases": ["www.demo.test"],
  "ports": {
    "nginx": 80,
    "nginx_ssl": 443,
    "apache": 80,
    "apache_ssl": 443,
    "caddy": 80,
    "caddy_ssl": 443
  },
  "reverseProxy": [
    { "path": "/api", "url": "http://127.0.0.1:3000" }
  ],
  "warnings": []
}
```

#### 4.4 字段规则

- `primaryUrl`
  - 若启用 SSL，优先 HTTPS 主域名
  - 否则返回 `site.url` 或按主域名生成的 HTTP URL
- `urls`
  - 至少包含主域名 HTTP URL
  - 启用 SSL 时附加 HTTPS URL
  - `alias` 按行拆分，展开 HTTP/HTTPS URL
- `ssl.keyMasked`
  - 永远输出掩码值，不直接输出私钥路径内容
  - 私钥路径仍可通过 `get_managed_file_map` 获取
- `ports`
  - 摘要返回当前站点 port 配置
- `reverseProxy`
  - 直接复用 `AppHost.reverseProxy`

#### 4.5 行为边界

- 不发 HTTP 请求
- 不探测 URL 可达性
- 不推断 DNS 是否已生效
- 只返回 FlyEnv 配置层面上的入口集合

### 5. `get_managed_file_map`

#### 5.1 目的

告诉 Agent 某个站点或服务在 FlyEnv 体系内对应哪些关键托管文件。

#### 5.2 输入

```json
{
  "type": "object",
  "properties": {
    "scope": {
      "type": "string",
      "enum": ["site", "service"]
    },
    "name": {
      "type": "string",
      "description": "Required when scope=site"
    },
    "flag": {
      "type": "string",
      "description": "Required when scope=service"
    },
    "version": {
      "type": "string",
      "description": "Optional when scope=service"
    }
  },
  "required": ["scope"]
}
```

#### 5.3 输出

```json
{
  "scope": "site",
  "identity": {
    "name": "demo.test",
    "id": 1234567890
  },
  "files": {
    "env": [{ "name": ".env", "path": "/project/demo/.env", "exists": true }],
    "config": [{ "name": "nginx-vhost", "path": "...", "exists": true }],
    "log": [{ "name": "nginx-access", "path": "...", "exists": true }],
    "cert": [{ "name": "ssl-cert", "path": "...", "exists": true }],
    "runtime": [{ "name": "root", "path": "/project/demo/public", "exists": true }],
    "data": []
  },
  "warnings": []
}
```

#### 5.4 站点场景规则

`scope=site` 时：

- `env`
  - `envFile`
- `config`
  - `vhost/nginx/<id>.conf`
  - `vhost/apache/<id>.conf`
  - `vhost/caddy/<id>.conf`
  - `vhost/frankenphp/<id>.conf`
  - 如存在 rewrite 文件，也纳入
- `log`
  - `vhost/logs` 下与 `<id>` 对应的 access/error/site log
- `cert`
  - `ssl.cert`
  - `ssl.key`
- `runtime`
  - `root`
  - 如有 `startCommand`，追加项目根目录与命令说明项
- `data`
  - 站点场景通常为空

#### 5.5 服务场景规则

`scope=service` 时：

- `config`
  - 复用模块现有 `listConfigFiles`
- `log`
  - 复用模块现有 `listLogFiles`
- `runtime`
  - `bin`
  - `path`
  - `socket`（若适用）
  - `pid` 路径（若稳定可得）
- `data`
  - 数据目录仅在 FlyEnv 可稳定推导时返回
  - 例如：
    - MySQL/MariaDB `datadir`
    - PostgreSQL 版本目录
    - Redis `db-<major>`
- `env` / `cert`
  - 默认为空，除非服务天然存在此类文件

#### 5.6 行为边界

- 不读取文件内容
- 不递归遍历整个目录树
- 只返回 FlyEnv 已知、稳定、有语义的文件集

## 数据来源与代码结构

### 1. 现有能力复用

- 服务基础信息：
  - `src/main/core/MCPTools.ts`
  - `serializeVersion()`
  - `resolveVersionObj()`
- 站点基础信息：
  - `host.hostList()`
  - `serializeSite()`
- 运行态：
  - `ServiceProcessManager`
- 配置/日志清单：
  - 各服务模块的 `getConfigFiles()` / `getLogFiles()`
- 站点 vhost、rewrite、log、SSL 路径规则：
  - `src/fork/module/Host/*`
  - `src/fork/module/Nginx/Host.ts`
  - `src/fork/module/Apache/Host.ts`
  - `src/fork/module/Caddy/Host.ts`
  - `src/fork/module/Frankenphp/Host.ts`

### 2. 新增文件

建议新增以下文件：

- `src/main/core/MCPContextResolver.ts`
  - main 进程专用聚合器
  - 负责配置解析、站点运行时解析、文件映射聚合
- `src/shared/siteRuntime.ts`
  - 纯函数
  - 抽出当前按站点解析 PHP 版本的共享逻辑
- `src/shared/mcpContext.ts`
  - 定义 5 个工具的入参与返回类型

### 3. 改动文件

- `src/main/core/MCPServer.ts`
  - 注册 5 个新工具与 schema
- `src/main/core/MCPTools.ts`
  - 增加 5 个公开方法
  - 调用 `MCPContextResolver`
- `src/main/core/MCPConfigManager.ts`
  - 把 5 个工具加入 `MCP_DEFAULT_ENABLED_TOOLS`
- `src/main/core/MCPAudit.ts`
  - 无需协议变更，沿用当前审计格式
- `src/shared/mcpResourcePolicy.ts`
  - 不改

## 资源与工具策略

这 5 个能力首期全部以 `tool` 形式暴露，不新增 `resource`。

原因：

1. 它们都属于“按对象定点查询”，天然带参数。
2. `tool` 更适合承载 `siteName`、`flag`、`version`、`scope` 等输入。
3. 当前 `resource` 只适合 `services`、`sites` 这类全量快照。

后续如果某类查询演变成稳定的全量快照，再考虑参数化资源。

## 权限、脱敏与审计

### 1. 默认权限

这 5 个工具全部属于：

- 只读
- 默认启用
- 默认审批策略 `auto`

不弹确认框。

### 2. 脱敏规则

沿用当前 MCP 语义：

- 默认不屏蔽：
  - `bin`
  - `path`
  - `phpBin`
  - `phpConfig`
  - `rootPassword`
  - `root`
  - `envFile`
- `maskSecrets=true` 时：
  - `password` 返回 `******`
  - SSL 私钥相关字段返回掩码
  - 其余路径仍保留

### 3. 审计规则

继续沿用 `audit.log` 当前格式：

- `tool`
- `args`
- `success`
- `error`

不记录完整返回结果，避免将路径、密码或上下文快照写入日志。

## 错误模型

### 1. 硬失败

下列情况直接返回 MCP error：

- `siteName` 不存在
- `flag` 不存在
- `scope` 非法
- 指定 `version` 不存在
- 调用的 `flag` 不在工具支持范围内

### 2. 软失败

下列情况工具成功返回，但在响应里附带 `warnings` 与 `sourceHints`：

- 配置文件存在，但关键字段缺失
- 无法从配置文件解析端口，回退到默认端口
- 站点配置了 PHP 版本，但对应版本未安装
- 某些 vhost 或日志文件尚未生成

### 3. 来源标记

关键字段统一使用以下来源标记：

- `runtime`
- `config`
- `default`
- `derived`

这能让 Agent 判断字段可信度，并决定是否继续做本地探测。

## 测试策略

### 1. 纯解析测试

新增：

- `scripts/mcp-context-parser-test.ts`

覆盖：

- MySQL 配置解析
- MariaDB 配置解析
- PostgreSQL 配置解析
- Redis 配置解析
- 缺省值回退逻辑
- `warnings` 与 `sourceHints` 生成

此类测试不依赖正在运行的 MCP 服务。

### 2. 在线 MCP 集成测试

新增：

- `scripts/mcp-context-smoke-test.ts`

覆盖调用：

- `get_database_connection_info`
- `resolve_site_runtime`
- `get_service_exec_info`
- `resolve_site_urls`
- `get_managed_file_map`

断言重点：

- 返回 shape 稳定
- 关键字段存在
- 单个字段缺失不会导致整体失败
- 调用会写入 `audit.log`

### 3. 人工验证

至少选取以下真实对象进行联调：

1. 一个带 `useSSL` 的 PHP 站点
2. 一个带 `projectPort` 与 `startCommand` 的前后端项目站点
3. 一个已运行 MySQL 或 MariaDB 版本
4. 一个已运行 Redis 或 PostgreSQL 版本

人工确认：

- `resolve_site_runtime`
- `resolve_site_urls`
- `get_managed_file_map`

三者之间字段不冲突、不互相打架。

## 实施顺序

建议按以下顺序落地：

1. `get_service_exec_info`
2. `resolve_site_urls`
3. `resolve_site_runtime`
4. `get_managed_file_map`
5. `get_database_connection_info`

原因：

1. 前 3 个几乎都是现有信息重组，风险最低。
2. `get_managed_file_map` 需要补一层站点文件聚合。
3. `get_database_connection_info` 解析器最多，放最后更容易控制风险。

## 风险与控制

### 1. 风险

- main 进程新增过多解析逻辑，可能让 `MCPTools.ts` 持续膨胀
- 站点运行时解析如果继续只放在渲染层和 main 层两份实现，后续会漂移
- 数据库配置解析过于依赖当前模块实现细节，未来模块变动后容易失配

### 2. 控制方式

- 用 `MCPContextResolver.ts` 承接解析逻辑，不继续堆入 `MCPTools.ts`
- 把站点 PHP 解析规则抽到 `src/shared/siteRuntime.ts`
- 配置解析只覆盖 FlyEnv 当前明确依赖的关键字段，不做通用配置解释器
- 通过 `sourceHints` 暴露“字段是默认值还是解析值”，降低误导风险

## 与当前 MCP 定位的一致性

这 5 个工具不会改变 FlyEnv MCP 的基本定位：

- 它仍然是本地开发环境的控制面与上下文面
- 它仍然不承担通用命令执行职责
- 它通过提供结构化事实，帮助 AI CLI 更稳定地使用自身已有的 shell 与文件能力

因此，本设计既补齐了 Agent 使用 FlyEnv 的关键上下文缺口，也避免让 MCP 模块失控扩张为本地执行平台。
