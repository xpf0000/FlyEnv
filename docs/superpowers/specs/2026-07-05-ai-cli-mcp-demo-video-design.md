# FlyEnv AI CLI + MCP Demo Video Design

日期：2026-07-07

## 背景

用户希望把原先偏“读取本地上下文”的演示，升级成一条更完整的 agent workflow：

1. AI CLI 通过 FlyEnv MCP 启动 MySQL
2. AI CLI 创建演示数据库与演示表
3. AI CLI 插入 3 条数据并查询展示
4. AI CLI 创建一个简单的 CRUD 页面，再通过 MCP 创建站点并启动 Nginx、PHP，给出访问链接
5. 在浏览器中实际操作页面

这个方向是成立的，而且比旧方案更有说服力，因为它从“环境控制”一路走到“应用生成”和“浏览器验证”，更像真实开发者会关心的闭环。

但必须明确一个能力边界：

- `FlyEnv MCP` 负责环境控制和环境事实
- `AI CLI` 负责本地 shell、SQL 客户端调用、文件生成和应用代码编写

当前仓库里的 MCP tools 已确认支持：

- `start_service`
- `stop_service`
- `restart_service`
- `create_site`
- `update_site`
- `list_services`
- `list_sites`
- `get_database_connection_info`
- `resolve_site_runtime`
- `resolve_site_urls`
- `get_service_exec_info`

当前仓库里没有直接执行 SQL 的 MCP tool，例如：

- `run_mysql_query`
- `exec_sql`

因此演示的正确链路不是“FlyEnv MCP 直接执行 SQL”，而是：

1. AI CLI 通过 FlyEnv MCP 启动/读取 MySQL、Nginx、PHP 和站点上下文
2. AI CLI 再基于这些上下文，在本地使用 `mysql` client 和文件系统完成数据库与页面生成

## 目标

这条视频需要让观众在一次演示里看懂：

`FlyEnv 不只是管理本地服务，它还能通过 MCP 把本地环境接给 AI CLI，让 AI CLI 真正搭起一个可访问、可操作的本地 MySQL + PHP 演示站点。`

具体目标：

1. 明确展示 AI CLI 可以通过 FlyEnv MCP 启动本地服务。
2. 明确展示 AI CLI 可以基于 FlyEnv 暴露的连接信息完成 MySQL 建库、建表、插数、查数。
3. 明确展示 AI CLI 可以在本地直接生成一个极简 CRUD 页面。
4. 明确展示 AI CLI 可以通过 FlyEnv MCP 创建站点、启动 Nginx/PHP，并拿到访问链接。
5. 最终必须在浏览器中实际操作页面，形成可见的闭环。

## 非目标

本视频不追求覆盖：

- 多个 AI CLI 客户端对比
- FlyEnv、Codex、MySQL、PHP 的从零安装教学
- Laravel / Symfony / ThinkPHP 等完整框架搭建
- 复杂认证、路由、ORM、模板引擎
- 复杂多表业务逻辑
- HTTPS / Auto SSL / 证书信任流程

## 方案对比

### 方案 A：现成项目优先

先使用一个已有站点和已有数据库，再让 AI CLI 做查询、插入、页面生成。

优点：

- 风险最低
- 演示最稳定

缺点：

- “AI 自己搭起来” 的震撼感不够强
- 浏览器页面与数据库之间的因果关系没那么直接

### 方案 B：从零到可访问闭环

从启动 MySQL 开始，AI CLI 逐步建库、建表、插数、生成页面、创建站点、启动服务、返回链接，最后在浏览器操作。

优点：

- 故事最完整
- 传播力最强
- 最能体现 `FlyEnv MCP + AI CLI` 的配合关系

缺点：

- 流程更长
- 需要更强的录制控制

### 方案 C：环境控制优先，应用生成次之

前半段重点拍 FlyEnv MCP 控服务和建站，后半段快速带过数据库和页面。

优点：

- 更像 FlyEnv 产品演示

缺点：

- 浏览器结果会显得像附带内容
- AI CLI 价值不够突出

## 推荐方案

采用 `方案 B：从零到可访问闭环`。

原因：

1. 用户已经明确希望视频的主流程包含服务控制、数据库创建、页面生成、站点创建和浏览器操作。
2. 这条链路最能展示 FlyEnv 和 AI CLI 的分工，而不是只展示设置界面。
3. 对外表达会更强：观众看到的是 “AI CLI 在 FlyEnv 管理的本地环境里搭出一个真正可访问的小应用”。

## 视频定位

- 平台：`macOS`
- 受众：`新用户 + 现有用户`
- 语言：`English`
- 主角客户端：`Codex`
- 页面技术路线：`plain PHP + PDO`
- Web 服务路线：`Nginx + PHP`
- 数据库：`MySQL`

## 关键设计决策

### 1. 页面不要用框架

推荐使用 `plain PHP + PDO`，而不是 Laravel / Symfony。

原因：

- 这样最快
- 页面文件数量少
- 录屏时更容易解释
- 不会把视频重心带偏到框架安装

### 2. 站点建议走 HTTP，不走 HTTPS

本视频建议显式使用：

- `useSSL: false`
- `autoSSL: false`

原因：

- HTTPS 不是这条片子的核心卖点
- SSL 证书信任、自动签发和浏览器提示会增加不必要噪音
- HTTP 更利于一次录制成功

### 3. 数据库动作走本地 mysql client

这条视频必须明确讲清楚：

- FlyEnv MCP 启动 MySQL、提供连接上下文
- Codex 再用本地 `mysql` client 完成真实 SQL

这与当前仓库的 MCP 边界完全一致。

### 4. 片长建议从 2-4 分钟调整为 3-5 分钟

旧方案是 `2-4 分钟`。

新方案加入了：

- 启服务
- 建库建表
- 插入 3 条数据
- 生成页面
- 建站并启动 PHP/Nginx
- 浏览器操作

如果全部镜头都清晰展示，`3-5 分钟` 更合理。

如果必须压到 `2-4 分钟`，则需要：

- 用 jump cut 压缩命令执行过程
- 让 AI CLI prompt 更短更准
- 只保留最关键结果画面

## 推荐演示对象

为降低录制复杂度，建议固定以下演示资源：

- 站点名：`ai-mysql-demo.test`
- 项目目录：`/Users/x/Sites/ai-mysql-demo`
- 站点根目录：`/Users/x/Sites/ai-mysql-demo/public`
- 数据库名：`flyenv_ai_demo`
- 表名：`demo_items`
- PHP 版本：`83`

表结构建议：

```sql
CREATE TABLE demo_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'new',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

这样浏览器里的 CRUD 足够直观，而且 SQL 简单。

## 主流程设计

### Phase 1：通过 MCP 启动 MySQL

目标：

- 证明 AI CLI 可以通过 FlyEnv MCP 控制本地服务
- 给后续数据库操作铺路

推荐动作：

1. 让 Codex 检查 MySQL 是否已安装、是否在运行
2. 如未运行，则通过 FlyEnv MCP 启动 MySQL
3. 再确认 MySQL running

视频表达重点：

- 这里的控制动作来自 FlyEnv MCP
- 不是 AI CLI 自己随便猜命令起服务

### Phase 2：创建数据库和演示表

目标：

- 证明 AI CLI 能基于 FlyEnv 提供的连接上下文完成数据库初始化

推荐动作：

1. 通过 FlyEnv MCP 获取 MySQL connection info
2. 让 Codex 使用本地 `mysql` client 创建 `flyenv_ai_demo`
3. 创建 `demo_items` 表

视频表达重点：

- FlyEnv MCP 提供“连接事实”
- AI CLI 负责“执行数据库动作”

### Phase 3：插入 3 条数据并查询展示

目标：

- 证明这个数据库不是空壳
- 给后续浏览器 CRUD 页面提供初始内容

推荐动作：

1. 插入 3 条演示数据
2. `SELECT * FROM demo_items`
3. 让结果停留 1-2 秒，方便观众看清

建议初始数据：

- `First demo item`
- `Second demo item`
- `Third demo item`

### Phase 4：创建页面、建站、启动 PHP/Nginx、给出链接

目标：

- 证明 AI CLI 可以在本地直接生成一个可运行的小应用
- 证明 FlyEnv MCP 可以把这个小应用挂到 FlyEnv 管理的站点里

推荐动作：

1. 让 Codex 在 `/Users/x/Sites/ai-mysql-demo` 下创建极简 PHP CRUD 页面
2. 页面直接用 PDO 连接 `flyenv_ai_demo.demo_items`
3. 页面至少支持：
   - list
   - create
   - update
   - delete
4. 然后让 Codex 通过 FlyEnv MCP `create_site`
5. 再通过 FlyEnv MCP 启动 `php` 和 `nginx`
6. 最后通过 FlyEnv MCP `resolve_site_urls` 给出最佳访问链接

页面建议保持极简：

- 一个列表区
- 一个新增表单
- 每行一个编辑入口
- 每行一个删除按钮

不需要用户登录，不需要 CSS 框架，不需要分页。

### Phase 5：在浏览器中操作

目标：

- 给观众一个清晰的成功画面

推荐动作：

1. 打开 AI CLI 返回的站点链接
2. 在页面中新增一条记录
3. 编辑其中一条记录
4. 删除其中一条记录
5. 页面刷新后确认结果正确

这一段是整条视频的闭环证明，不能省。

## 分镜与时长

### 1. Cold Open（10-15 秒）

直接在 Codex 抛出完整任务：

`Start MySQL through FlyEnv MCP, create a demo database and table, insert sample rows, generate a simple PHP CRUD app, create a FlyEnv site for it, start PHP and Nginx, then give me the URL so I can test it in the browser.`

作用：

- 一句话讲清整条片子的 promise
- 观众从一开始就知道这不是纯设置视频

### 2. Service Control + DB Init（45-70 秒）

快速展示：

- MySQL 启动
- 连接信息获取
- 建库建表
- 插入 3 条数据并查询

### 3. App Generation + Site Setup（60-90 秒）

快速展示：

- 生成 PHP 页面文件
- 通过 MCP 创建站点
- 启动 PHP
- 启动 Nginx
- 解析访问 URL

### 4. Browser Proof（30-50 秒）

展示：

- 打开页面
- 新增
- 编辑
- 删除

### 5. Close（10-20 秒）

一句收尾：

`FlyEnv handled the local environment, MCP exposed it to Codex, and Codex turned it into a working local app.`

## 阶段提示词

以下提示词面向 `Codex`，默认当前机器是 macOS，且 FlyEnv MCP 已经接入成功。

### Prompt 1：启动 MySQL

```text
Use FlyEnv MCP to inspect the local MySQL service. If MySQL is not running, start the enabled MySQL service through FlyEnv MCP. Then confirm that MySQL is running and tell me which version is active.
```

### Prompt 2：创建数据库和演示表

```text
Use FlyEnv MCP to get the local MySQL connection details and execution hints. Then use the local mysql client on this machine to create a database named flyenv_ai_demo if it does not already exist, and create a table named demo_items with these columns:

- id INT PRIMARY KEY AUTO_INCREMENT
- title VARCHAR(255) NOT NULL
- status VARCHAR(50) NOT NULL DEFAULT 'new'
- created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

After that, show me the exact SQL you ran and confirm the table exists.
```

### Prompt 3：插入 3 条数据并查询

```text
Using the same local MySQL connection, insert three rows into flyenv_ai_demo.demo_items with these titles:

- First demo item
- Second demo item
- Third demo item

Set the status to 'new' for all of them. Then query all rows from flyenv_ai_demo.demo_items ordered by id ascending and show the full result.
```

### Prompt 4：生成 PHP CRUD 页面

```text
Create a minimal plain PHP CRUD demo app under /Users/x/Sites/ai-mysql-demo.

Requirements:
- use plain PHP, not a framework
- use PDO to connect to the local MySQL database flyenv_ai_demo
- keep the web root at /Users/x/Sites/ai-mysql-demo/public
- support listing all rows from demo_items
- support creating a new row
- support updating an existing row
- support deleting an existing row
- keep the UI simple and readable
- do not add authentication
- do not add external dependencies unless absolutely necessary

Create the required directories and files, and briefly summarize the file structure when done.
```

### Prompt 5：通过 MCP 创建站点并启动 PHP/Nginx

```text
Use FlyEnv MCP to create a FlyEnv site for this app with these settings:

- site name: ai-mysql-demo.test
- root: /Users/x/Sites/ai-mysql-demo/public
- phpVersion: 83
- useSSL: false
- autoSSL: false

Then use FlyEnv MCP to start PHP and Nginx if they are not already running. After that, use FlyEnv MCP to resolve the site URLs and tell me the best local URL to open in the browser.
```

### Prompt 6：浏览器验证前的收束

```text
Before I open the site in the browser, summarize the current local setup in one short checklist:

- MySQL status
- database name
- table name
- app root
- site URL
- whether PHP is running
- whether Nginx is running

Keep it concise and ready for on-screen capture.
```

### Prompt 7：浏览器操作后的验证提示

这一段不是必须交给 AI CLI，但如果你希望 Codex 给出操作清单，可以用：

```text
Give me a short browser test checklist for this CRUD demo so I can demonstrate it on screen. Include one create action, one update action, one delete action, and one quick visual verification for each.
```

## 录前准备

正式录制前应确保：

1. FlyEnv 已启动
2. FlyEnv MCP 已启动并已接入 Codex
3. MySQL、PHP、Nginx 至少已安装可用
4. `phpVersion: 83` 在当前 FlyEnv 环境中可用；如果不可用，提前改成实际版本
5. `/Users/x/Sites/` 路径可写
6. 演示目录若已存在，提前清理到可控状态
7. 至少完整预演一次，确认每条 prompt 的输出路径和行为稳定

## 风险与规避

### 风险 1：PHP 或 Nginx 未安装

规避：

- 录制前手动确认已安装
- 不在这条视频里临时加入 `install_service`，否则节奏会被拉长

### 风险 2：站点创建成功但 PHP 版本不匹配

规避：

- 录制前确认 FlyEnv 中真实可用的 PHP 版本号
- 若不是 `83`，直接改 prompt 和站点参数

### 风险 3：AI CLI 生成的 PHP 页面过于复杂

规避：

- prompt 明确要求 `plain PHP`、`no framework`、`no external dependencies`
- 如果预演发现生成过满，再把页面收敛成单页或 2 文件结构

### 风险 4：数据库凭据暴露

规避：

- 录制时尽量避免长时间停留在敏感输出
- 必要时后期打码

### 风险 5：流程太长

规避：

- 正片只保留关键结果
- 命令执行中间过程用 jump cut
- 浏览器操作只做最短闭环，不做重复演示

## 验收标准

如果成片满足以下条件，则本方案成功：

1. 观众能看见 AI CLI 通过 FlyEnv MCP 启动 MySQL。
2. 观众能看见 AI CLI 创建数据库和演示表。
3. 观众能看见 AI CLI 插入 3 条数据并查询结果。
4. 观众能看见 AI CLI 生成一个最小可用的 PHP CRUD 页面。
5. 观众能看见 AI CLI 通过 FlyEnv MCP 创建站点并启动 PHP/Nginx。
6. 观众能得到一个明确可访问的本地 URL。
7. 观众能在浏览器里实际完成至少一次增删改查中的核心操作。
8. 视频没有把 FlyEnv MCP 错讲成直接执行 SQL 的数据库代理。

## 推荐执行顺序

1. 预确认 MySQL、PHP、Nginx 已安装
2. 预连 Codex 与 FlyEnv MCP
3. 逐条预演 Prompt 1-6
4. 清理演示目录与数据库状态
5. 正式录屏
6. 浏览器补拍
7. 后期用英文标题卡和步骤字幕压缩节奏
