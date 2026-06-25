# Kimi 模块改进设计

## 背景

Kimi 模块已初步完成集成，包含 Service、Configuration、Log、Sessions 四个 Tab。本次改进针对以下三点：

1. Configuration / Log 页右上角刷新按钮样式异常（尺寸未生效）。
2. Configuration 的快捷设置需要参照 PHP/Nginx，迁移到项目通用的 `Conf` 组件框架。
3. Sessions 列表需要按 `workDir` 文件夹显示成树形结构。

## 目标

1. 修复 Kimi 模块刷新按钮尺寸，统一使用 Tailwind 的 `w-[24px] h-[24px]`。
2. 将 Kimi Configuration 的快捷设置迁移到通用 `Conf` 框架，使用 `CommonSetItem` + `Common` 组件。
3. 把 Sessions 平铺表格改为按 `workDir` 分组的树形列表。

## 设计方案

### 1. 刷新按钮样式修复

#### 现状

- `Config.vue`、`Logs.vue`、`Sessions.vue`、`Service.vue` 的刷新按钮都使用 `<yb-icon class="refresh-icon">`。
- `.refresh-icon` 的全局样式在 `.version-manager` 命名空间下才生效，而 Kimi 页面使用的是 `app-base-el-card`，导致样式未命中，按钮显示为 SVG 默认尺寸。

#### 修改方案

- 不在 Kimi 组件中依赖 `.refresh-icon` 类。
- 直接给 `<yb-icon>` 添加 Tailwind 类 `w-[24px] h-[24px]`。
- 涉及的 Kimi 页面全部同步处理：
  - `src/render/components/Kimi/Config.vue`
  - `src/render/components/Kimi/Logs.vue`
  - `src/render/components/Kimi/Sessions.vue`
  - `src/render/components/Kimi/Service.vue`

#### 示例

```vue
<yb-icon
  :svg="import('@/svg/icon_refresh.svg?raw')"
  class="w-[24px] h-[24px]"
  :class="{ 'fa-spin': KimiSetup.loading }"
/>
```

### 2. 配置文件快捷设置迁移到通用 Conf 框架

#### 现状

- `Config.vue` 内联实现了一个 Quick Settings 区域，使用 `el-form-item` + `el-select` / `el-switch`。
- 通过 `KimiSetup.getQuickSettings()` / `setQuickSettings()` 调用 fork 后端，单独读写 `config.toml` 顶层字段。

#### 修改方案

- `Config.vue` 改用 `ConfVM` 组件，设置 `:show-commond="true"`。
- 在 `<template #common>` 中插入通用 `Common` 组件，传入 `commonSetting`。
- 移除现有内联 Quick Settings 表单。
- 移除 `KimiSetup` 中的 `quickSettings`、`getQuickSettings()`、`setQuickSettings()`。
- 移除 fork 后端 `src/fork/module/Kimi/index.ts` 中的 `getQuickSettings` / `setQuickSettings`（或保留但不再调用）。

#### CommonSetItem 定义

针对 `config.toml` 顶层字段定义以下 `CommonSetItem`：

| name | type | 说明 |
|------|------|------|
| `default_permission_mode` | select | options: `manual / auto / yolo` |
| `default_thinking` | select | options: `true / false` |
| `default_plan_mode` | select | options: `true / false` |
| `telemetry` | select | options: `true / false` |

#### 读写逻辑

- 在 `onTypeChange` 中通过 `ConfVM` 获取当前配置文件文本。
- 使用 `@iarna/toml`（项目已依赖）的 `TOMLParse` 解析配置。
- 将解析出的值填充到 `commonSetting` 数组。
- 监听 `commonSetting` 变化（`debounce 500ms`），通过 `TOMLStringify` 生成新文本，调用 `conf.value.setEditValue()` 写回编辑器。
- 用户点击 Conf 组件的保存按钮后统一落盘。

> 注意：迁移到通用框架后，`@iarna/toml` 的 `stringify` 会重新格式化文件，注释和空行会丢失。这是通用框架迁移的已知代价。

#### 涉及文件

- `src/render/components/Kimi/Config.vue`（主要改动）
- `src/render/components/Kimi/setup.ts`（删除 quickSettings 相关逻辑）
- `src/fork/module/Kimi/index.ts`（删除未使用的 getQuickSettings / setQuickSettings）

### 3. 会话列表按文件夹显示成树形结构

#### 现状

- `Sessions.vue` 使用平铺 `el-table`。
- 后端 `listSessions()` 返回扁平 `KimiSessionItem[]`。

#### 修改方案

- 后端 `listSessions()` 保持返回扁平列表，最小化 fork 改动。
- 前端在 `setup.ts` 中新增 `sessionTree` computed，按 `workDir` 分组：
  - 每个不同 `workDir` 作为一级节点（文件夹节点），label 为工作目录路径。
  - 该 `workDir` 下的会话作为二级节点（叶子节点），label 为会话标题。
  - `workDir` 为空时归入 `Unknown` 或 `Default` 分组。
  - 每个节点携带原始 `SessionItem` 数据，用于点击和操作。
- `Sessions.vue` 中将 `el-table` 替换为 `el-tree`：
  - `default-expand-all`
  - `:highlight-current="true"`
  - `@node-click` 恢复会话（仅对叶子节点）
  - 节点右侧显示操作按钮：resume / export / delete
  - 搜索框同时过滤父节点和子节点

#### 树形数据结构示例

```typescript
interface SessionTreeNode {
  id: string
  label: string
  isLeaf: boolean
  session?: SessionItem
  children?: SessionTreeNode[]
}
```

#### 涉及文件

- `src/render/components/Kimi/Sessions.vue`
- `src/render/components/Kimi/setup.ts`

## 文件改动清单

### 修改

```
src/render/components/Kimi/Config.vue
src/render/components/Kimi/Logs.vue
src/render/components/Kimi/Sessions.vue
src/render/components/Kimi/Service.vue
src/render/components/Kimi/setup.ts
src/fork/module/Kimi/index.ts
```

### 删除/弃用

- `KimiSetup.quickSettings` 状态及相关方法
- fork 后端 `getQuickSettings` / `setQuickSettings`
- `Config.vue` 中的内联 Quick Settings 表单

## 验收标准

- [ ] Kimi Config / Log / Sessions / Service 页右上角刷新按钮显示为 24px × 24px。
- [ ] Configuration Tab 使用通用 `Conf` 框架的 Common Setting，能正确读取和修改 `config.toml` 的四个顶层字段。
- [ ] 保存配置后，Kimi CLI 能正常读取新配置。
- [ ] Sessions Tab 以树形结构按 `workDir` 分组显示会话。
- [ ] 树形会话支持搜索、恢复、导出、删除操作。
- [ ] 项目可正常构建，无新增 ESLint/TypeScript 错误。
