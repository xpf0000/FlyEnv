# AI CLI Prompt Page Design

日期：2026-07-07

## 背景

用户需要一个专门用于录制 FlyEnv AI CLI + MCP 演示视频的页面。

这个页面的用途非常明确：

- 只在本机录屏时使用
- 作为视频开场页
- 随后作为逐步执行提示词的控制台
- 帮助用户一条一条复制 prompt 到 AI CLI 中执行

这不是 FlyEnv 产品内的正式模块，也不是对外分享的通用网页，而是一个 `recording control surface`。

用户已经确认以下约束：

1. 页面必须是 `独立单文件 HTML`
2. 不集成到 FlyEnv 渲染层
3. 只服务于本机录屏场景
4. 交互模式采用 `单步演示模式`
5. 页面要展示：
   - 视频目标
   - 各个阶段的提示词
   - 一键复制功能

## 目标

这个页面要做到三件事：

1. 打开后立刻能作为视频开场画面使用
2. 在录制过程中帮助用户快速按阶段复制 prompt
3. 让镜头始终保持干净、聚焦，不像普通文档页或说明站

更具体地说：

- 用户打开页面时，不需要再切换到其他封面页
- 当前阶段必须足够显眼
- 复制 prompt 后，能顺手切到下一步
- 观众能看懂当前在整条链路中的位置

## 非目标

本设计明确不做：

- 不做 FlyEnv 内嵌页面
- 不做可分享给外部用户的通用教程站
- 不做后端服务
- 不做构建流程
- 不做多语言切换
- 不做复杂主题系统
- 不做账号、同步、云端存储

## 推荐方案

采用 `独立单文件 HTML + 单步演示控制台`。

核心判断：

1. 既然只用于本机录屏，就不需要引入 Vue、构建链路或 FlyEnv 渲染层集成。
2. 页面不应该像长文档一样从上往下滚动，而应该像一个 `operator console` 一样，只突出当前步骤。
3. 页面必须同时承担“开场页”和“执行控制台”两个角色，因此不能做成纯 teleprompter，也不能做成过于复杂的文档站。

## 文件落点

最终实现建议输出为一个独立文件：

- `docs/task/ai-cli-mcp-demo-prompt-console.html`

原因：

- 它明显属于录制辅助资产，而不是 FlyEnv 主产品代码
- 位于仓库内，便于版本管理
- 直接双击或在浏览器中打开即可使用

## 信息架构

页面结构固定为四个区域：

### 1. Header

顶部展示：

- 页面标题
- 一句目标说明
- 当前步骤进度，例如 `Step 1 / 7`

Header 既要承担“开场页说明”的职责，也不能占太多垂直空间。

推荐目标文案：

`Use FlyEnv MCP and Codex to turn a local MySQL environment into a working PHP CRUD demo site.`

### 2. Left Rail

左侧固定展示 7 个阶段：

1. Start MySQL
2. Create DB and table
3. Seed rows
4. Generate PHP app
5. Create site and start services
6. Pre-browser summary
7. Browser test checklist

每个阶段展示：

- 编号
- 短标题
- 状态点

状态规则：

- 当前步骤高亮
- 已完成步骤降级显示但仍可读
- 未开始步骤保持基础状态

### 3. Main Stage Card

主内容区只展示当前步骤，包含四块：

1. `step title`
2. `why this step matters`
3. `prompt block`
4. `action buttons`

这里的 prompt block 是页面核心。

### 4. Bottom Utility Strip

底部只展示轻量辅助信息：

- 当前步骤属于哪类操作，例如：
  - `MCP control step`
  - `local shell step`
  - `browser action step`
- 复制成功反馈
- 可选的简短说明切换状态

该区域不能喧宾夺主。

## 交互设计

### 主操作按钮

当前步骤卡片中提供以下按钮：

- `Copy Prompt`
- `Previous`
- `Next`

辅助按钮放在页面次级位置：

- `Reset to Step 1`
- `Show Notes / Hide Notes`

## 按钮行为

### `Copy Prompt`

- 一键复制当前步骤 prompt
- 点击后按钮短暂显示 `Copied`
- 同时把当前步骤标记为已完成
- 不自动跳步，避免误操作

### `Previous`

- 切换到上一步
- 如果当前已经是第一步，则禁用

### `Next`

- 切换到下一步
- 如果当前已经是最后一步，则禁用

### `Reset to Step 1`

- 回到第一步
- 清空“当前步骤”状态
- 是否清空已完成标记可采用保守策略：提示确认后再清空

### `Show Notes / Hide Notes`

- 控制每一步的补充说明是否显示
- 默认显示简短说明
- 用户可以在正式录制时隐藏以保持画面极简

## 视觉方向

页面风格采用：

`graphite operator console`

具体要求：

- 深石墨色背景
- 暖白主文字
- 当前步骤强调色使用琥珀或偏青绿色
- 不使用紫色作为主强调色
- 避免平庸的纯文档布局

## 排版方向

### 标题层

- 页面主标题使用更有存在感的展示型字体
- 副标题与说明文字保持克制

### Prompt 层

- prompt 区域使用等宽字体
- 字号略大于普通正文
- 行高适中，方便录屏时阅读
- 保持完整展开，不做折叠

### 步骤列表层

- 步骤标题要清晰
- 编号与状态点要便于扫视
- 当前步骤和已完成步骤的视觉差异必须明显

## 动效策略

页面只保留两类轻量动效：

1. 首次载入时主区轻微淡入上浮
2. 切换步骤时主卡片短时过渡

明确不做：

- 粒子
- 大面积背景动画
- 复杂滚动特效
- 花哨按钮弹跳

原因是录屏时这些效果会让画面显得噪声过多。

## 内容模型

页面内的 7 个步骤固定写死在内联数据中，不从外部 JSON 拉取。

推荐在 HTML 内的脚本里维护一个步骤数组，每个对象包含：

- `id`
- `title`
- `stageType`
- `why`
- `prompt`
- `note`

这样单文件即可自洽，无需外部依赖。

## 7 个步骤的页面内容

### Step 1

- Title: `Start MySQL Through FlyEnv MCP`
- Stage Type: `MCP control step`
- Why: `Start with environment control so the viewer sees FlyEnv MCP in action immediately.`
- Prompt:

```text
Use FlyEnv MCP to inspect the local MySQL service. If MySQL is not running, start the enabled MySQL service through FlyEnv MCP. Then confirm that MySQL is running and tell me which version is active.
```

### Step 2

- Title: `Create the Demo Database and Table`
- Stage Type: `local shell step`
- Why: `Use FlyEnv-provided context to bootstrap the database structure for the rest of the demo.`
- Prompt:

```text
Use FlyEnv MCP to get the local MySQL connection details and execution hints. Then use the local mysql client on this machine to create a database named flyenv_ai_demo if it does not already exist, and create a table named demo_items with these columns:

- id INT PRIMARY KEY AUTO_INCREMENT
- title VARCHAR(255) NOT NULL
- status VARCHAR(50) NOT NULL DEFAULT 'new'
- created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

After that, show me the exact SQL you ran and confirm the table exists.
```

### Step 3

- Title: `Seed Three Demo Rows`
- Stage Type: `local shell step`
- Why: `Prepare visible initial data for the later browser CRUD flow.`
- Prompt:

```text
Using the same local MySQL connection, insert three rows into flyenv_ai_demo.demo_items with these titles:

- First demo item
- Second demo item
- Third demo item

Set the status to 'new' for all of them. Then query all rows from flyenv_ai_demo.demo_items ordered by id ascending and show the full result.
```

### Step 4

- Title: `Generate a Minimal PHP CRUD App`
- Stage Type: `local file generation step`
- Why: `Generate a small framework-free app so the demo stays fast and easy to understand.`
- Note: `This is intentionally framework-free for recording speed and clarity.`
- Prompt:

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

### Step 5

- Title: `Create the FlyEnv Site and Start PHP / Nginx`
- Stage Type: `MCP provisioning step`
- Why: `Turn the generated local files into an actual FlyEnv-managed site and launch the web stack.`
- Prompt:

```text
Use FlyEnv MCP to create a FlyEnv site for this app with these settings:

- site name: ai-mysql-demo.test
- root: /Users/x/Sites/ai-mysql-demo/public
- phpVersion: 83
- useSSL: false
- autoSSL: false

Then use FlyEnv MCP to start PHP and Nginx if they are not already running. After that, use FlyEnv MCP to resolve the site URLs and tell me the best local URL to open in the browser.
```

### Step 6

- Title: `Summarize the Local Setup`
- Stage Type: `capture summary step`
- Why: `Create one clean on-screen checkpoint before switching to the browser.`
- Prompt:

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

### Step 7

- Title: `Prepare the Browser Test Checklist`
- Stage Type: `browser action step`
- Why: `Prepare a clean script for the browser segment rather than another environment step.`
- Prompt:

```text
Give me a short browser test checklist for this CRUD demo so I can demonstrate it on screen. Include one create action, one update action, one delete action, and one quick visual verification for each.
```

## 开场行为

页面首次打开时：

- 默认直接显示 `Step 1`
- 不再单独提供封面页
- Header 已足够承担开场说明功能

这样做的好处：

- 不需要先切页面
- 开场后能立刻进入操作
- 录制节奏更顺

## 技术实现建议

实现方式保持极简：

- 一个 HTML 文件
- 内联 CSS
- 内联 JavaScript
- 不依赖框架
- 不依赖打包工具

可以使用浏览器原生 API：

- `navigator.clipboard.writeText`
- `localStorage`
- DOM 事件监听

## 状态持久化

因为页面只供本机使用，允许轻量使用 `localStorage` 记录：

- 当前步骤
- 已完成步骤
- notes 是否显示

这会让页面在意外刷新后恢复状态。

## 容错与降级

### 复制失败

若 `navigator.clipboard` 失败：

- 显示一个错误提示
- 自动回退为选中文本模式或手动复制提示

### 无 localStorage

若本地存储不可用：

- 页面仍可使用
- 只是当前步骤和完成状态不持久化

### 小窗口

若窗口宽度偏小：

- 左侧 rail 可以变窄
- 主卡片保持可读
- 仍然优先保证 prompt 可完整展示

但本设计主要优化桌面录屏场景，不需要对手机做深度适配。

## 验证标准

实现完成后，页面应满足：

1. 双击或浏览器打开 HTML 后可直接使用
2. 默认进入 Step 1
3. 能一键复制当前 prompt
4. 切换步骤时左侧高亮和状态正确变化
5. 页面能作为视频开场页使用
6. 页面能在录制过程中作为逐步执行控制台使用
7. 不依赖网络、构建工具或 FlyEnv 主应用运行

## 录屏体验标准

从录屏角度，这个页面还应满足：

1. 打开后 3 秒内足够“可讲”
2. 当前步骤足够醒目
3. prompt 足够大，观众能看清它是“即将复制到 AI CLI 的输入”
4. 鼠标移动路径短，不容易误点
5. 页面整体观感像“操作台”，而不是“文档站”

## 后续实现边界

后续实现只需完成：

- 页面布局
- 7 步数据写入
- 复制逻辑
- 步骤切换逻辑
- 完成状态逻辑
- localStorage 持久化

明确不需要引入：

- Vue
- Tailwind
- Element Plus
- 后端服务
- 构建流程
