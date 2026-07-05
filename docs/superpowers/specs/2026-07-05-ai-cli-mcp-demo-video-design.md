# FlyEnv AI CLI + MCP Demo Video Design

日期：2026-07-05

## 背景

FlyEnv 当前已经具备这条完整链路：

- FlyEnv 本身管理本地服务、站点与开发环境
- README 已把 `AI coding CLIs + built-in FlyEnv MCP Server` 作为 4.16 之后的核心卖点
- MCP 模块在 UI 中已经具备 `Service`、`Client Config`、`Tools`、`Audit Log`
- Codex 模块在 UI 中已经具备 `Service`、`Config`、`Sessions`、`Plugins`、`MCP`
- MCP 工具目录已包含：
  - `list_services`
  - `list_sites`
  - `get_database_connection_info`
  - `resolve_site_runtime`
  - `get_service_exec_info`
  - `resolve_site_urls`
  - `get_managed_file_map`

这意味着 FlyEnv 已经可以把本地开发环境中的关键事实稳定暴露给 Codex。

同时，这个仓库当前并没有提供 `run_mysql_query` 这一类直接执行 SQL 的 MCP tool。数据库读写更适合设计为：

1. 先通过 FlyEnv MCP 让 Codex 获取本地 MySQL 与站点上下文
2. 再由 Codex 使用本地 `mysql` client 完成一次真实的 `SELECT + INSERT/UPDATE + verification`

这不是妥协，而是更准确地体现 FlyEnv MCP 的定位：`环境事实层`，不是数据库代理。

## 目标

本视频需要在 2-4 分钟内让观众理解并相信这件事：

`FlyEnv 不只是本地环境管理器，它还能把本地 MySQL 与站点上下文通过 MCP 暴露给 Codex，让 Codex 在真实本地项目环境里完成任务。`

具体目标：

1. 让新用户一眼理解 FlyEnv 的 AI CLI + MCP 价值。
2. 让现有用户知道 FlyEnv 里这条工作流的实际使用方式。
3. 必须出现一次真实 Codex 调用，不做纯设置演示。
4. 必须包含 MySQL 读操作和写操作各一次。
5. 必须带出现成站点/项目上下文，而不是只演示裸数据库。

## 非目标

本视频不追求覆盖以下内容：

- 多个 AI CLI 客户端对比
- 从零安装 FlyEnv、Codex、MySQL 的完整教学
- 逐个讲完所有 MCP tools
- 深入数据库建模或 SQL 教学
- 复杂多表业务操作
- 远程 MCP、团队协作、权限模型的完整展开

## 方案对比

### 方案 A：环境上下文优先

先讲 FlyEnv，再切到 Codex 做数据库任务。

优点：

- 初看最容易理解
- 教程感强

缺点：

- 前 30 秒容易像设置教程
- 数据库爽点出现偏晚

### 方案 B：任务驱动优先

先在 Codex 抛出真实任务，再快速回到 FlyEnv 解释桥怎么搭，最后回 Codex 完整执行。

优点：

- 更像真实 agent workflow
- 更适合英文受众和传播场景
- MySQL 读写会自然成为“证明段”

缺点：

- 录制节奏要求更高

### 方案 C：FlyEnv 操作台优先

大部分时长停留在 FlyEnv UI，Codex 调用作为结尾证明。

优点：

- 设置路径最清楚

缺点：

- 容易像产品设置演示
- 不够突出 “Codex actually uses it”

## 推荐方案

采用 `方案 B：任务驱动优先`。

原因：

1. 这条视频真正要卖的是 `FlyEnv turns Codex into a real local agent`，不是 `FlyEnv has an MCP settings page`。
2. 用户已经明确要求必须有真实调用和 MySQL 实操，任务驱动结构更适合承载这一点。
3. README 与当前 UI 已经足够支撑一个简洁 rewind：只需要证明 `MySQL running`、`MCP enabled`、`Add to Codex` 即可，不需要长篇设置说明。

## 视频定位

- 受众：`新用户 + 现有用户`
- 平台：`macOS`
- 语言：`English`
- 形式：`2-4 分钟实操片`
- 主角客户端：`Codex`
- 证明对象：`现成站点/项目 + MySQL 服务 + 一次读 + 一次写 + 一次验证`

建议成片定位：

`How FlyEnv turns Codex into a real local agent for your MySQL-backed project`

## 叙事主线

推荐叙事：

`先给结果，再解释桥怎么搭起来，最后把结果验证完整`

镜头主线：

1. 冷开场：直接在 Codex 抛出任务
2. Rewind：切回 FlyEnv，用最短路径证明本地环境、MCP、Codex 注册都已就位
3. 真实执行：回到 Codex 完成一次基于 FlyEnv MCP 上下文的 MySQL 任务
4. 收尾：总结 FlyEnv 的角色边界与实际价值

## 分镜与时长

### 1. Cold Open（10-15 秒）

开场画面：`Codex terminal`

建议固定英文 prompt：

```text
Use FlyEnv MCP to inspect my local MySQL-backed site, confirm the MySQL connection details, read one row from the demo table, insert a new demo row, and verify the result.
```

目的：

- 让观众一开始就知道这不是静态设置片
- 直接把 `MCP context + MySQL read + MySQL write + verification` 一次讲清

### 2. Rewind to FlyEnv（35-45 秒）

只拍 3 个必要镜头：

1. `MySQL module`
   - 证明 MySQL 正在运行
   - 最好能看到版本和 running 状态
2. `MCP > Service`
   - 证明 FlyEnv MCP Server 已启动
3. `MCP > Client Config`
   - 展示 `Add to Codex` 或已注册到 Codex 的状态

可选补镜头：

- `MCP > Tools`
  - 只快速扫一眼
  - 用于证明这是一组受控工具，而不是黑盒桥接

这一段不要展开所有 tab，不要讲安装细节。

### 3. Back to Codex for the Real Run（70-100 秒）

按 4 步走：

1. 让 Codex 读取 FlyEnv MCP 里的服务与站点上下文
2. 让 Codex 获取 MySQL connection info
3. 让 Codex 使用本地 `mysql` client 先执行一次 `SELECT`
4. 让 Codex 写入一条 demo 数据，再执行一次 `SELECT` 验证

观众应看到的核心逻辑：

- FlyEnv MCP 告诉 Codex：`这个站点是什么、MySQL 在哪、连接方式是什么`
- Codex 再在本机用真实工具完成数据库动作

### 4. Close（15-20 秒）

建议收尾句：

`FlyEnv manages the local environment, exposes it through MCP, and lets Codex act on real local project context instead of guessing.`

收尾画面优先级：

1. 回 FlyEnv `Audit Log` 看一眼
2. 或回 FlyEnv MySQL / 站点视图做收束
3. 最差也要让 Codex 输出一句总结，而不是硬切结束

## MySQL 演示设计

用户要求同时包含：

- 现成站点/现成项目
- MySQL 只读查询
- MySQL 写操作

最稳的做法：

1. 使用一个已经存在的本地站点或项目，确保 FlyEnv 能识别其站点上下文
2. 不直接操作正式业务表
3. 在该数据库内准备一个极小的独立演示表

推荐小表：

- `demo_notes`
- `todos`

示例结构：

```sql
CREATE TABLE demo_notes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

录制前状态：

- 表里预置 `1` 条记录

录制中动作：

1. `SELECT` 查出当前 1 条记录
2. `INSERT` 一条演示数据，例如：
   - `Inserted from Codex via FlyEnv MCP demo`
3. 再 `SELECT` 一次，确认现在变成 2 条

这样做的优点：

- 读写都真实
- 结果可见
- 风险小
- 不污染正式业务表

## FlyEnv 与 Codex 的职责表达

本视频必须明确表达下面这条边界，否则观众会误解 FlyEnv MCP 的能力形态：

- FlyEnv 负责：
  - 管理本地 MySQL、站点、服务与运行时
  - 通过 MCP 提供结构化本地环境事实
- Codex 负责：
  - 消费 FlyEnv MCP 上下文
  - 在本地终端中调用真实工具，例如 `mysql`

因此视频中的正确说法不是：

- `FlyEnv MCP directly runs SQL`

而是：

- `FlyEnv MCP gives Codex the exact local context it needs to safely act`

## 录前准备

正式录制前应确保：

1. `FlyEnv` 已启动
2. `MySQL` 已 running
3. `FlyEnv MCP Server` 已 running
4. `Codex` 已能看到 FlyEnv MCP
5. `现成站点/项目` 已可在 FlyEnv 中被识别
6. `demo 小表` 已存在，且表内已有 1 条记录
7. 录制 prompt 已固定，不在现场改写
8. 至少完整预演一遍，确认 Codex 不会明显绕路

## 风险与规避

### 风险 1：MCP 没连上

规避：

- 录制前先完整跑一遍
- 确认 Codex 中 FlyEnv MCP 已可见
- 必要时让 Codex 先列出 MCP server 或先做一次只读探测

### 风险 2：MySQL 敏感信息暴露

规避：

- 尽量避免把敏感值长时间停在屏幕中央
- 必要时后期打码
- 优先用演示库与演示数据

### 风险 3：Codex 首次执行太慢或绕路

规避：

- Prompt 固定
- 预演一次，观察常见行动路径
- 尽量让任务目标明确且单步可验证

### 风险 4：写操作结果不够直观

规避：

- 使用极小 demo 表
- 保证初始数据只有 1 条
- 写后立刻 `SELECT` 验证

## 后期结构

建议后期结构：

1. `3 秒 title card`
2. `10-15 秒 cold open`
3. `35-45 秒 FlyEnv rewind/setup`
4. `70-100 秒 Codex real task`
5. `15-20 秒 closing summary`

如果不做完整英文配音，也可以做成英文步骤字幕：

1. `Connect Codex to FlyEnv MCP`
2. `Inspect local MySQL and site context`
3. `Read one row`
4. `Insert one row`
5. `Verify the result`

## 建议成片文案方向

可用于标题或开场句的方向：

- `FlyEnv + Codex: Use MCP to work with a real local MySQL project`
- `How FlyEnv gives Codex real local MySQL context through MCP`
- `From local stack to real agent workflow: FlyEnv MCP with Codex`

## 验收标准

如果成片满足以下条件，则本方案算成功：

1. 观众能在前 20 秒内理解视频主题不是设置教学，而是真实任务演示。
2. 视频明确出现 FlyEnv、Codex、MCP 三者关系。
3. 视频明确出现一个现成站点/项目上下文。
4. 视频明确出现 MySQL 读操作。
5. 视频明确出现 MySQL 写操作。
6. 视频明确出现写后验证。
7. 视频没有把 FlyEnv MCP 误讲成通用 SQL 执行代理。

## 推荐执行顺序

按下面顺序准备并录制：

1. 准备现成站点与演示库
2. 准备独立 demo 表和 1 条初始记录
3. 预连 FlyEnv MCP 与 Codex
4. 预演完整 prompt 一次
5. 正式录屏
6. 后期加标题卡与英文步骤字幕
