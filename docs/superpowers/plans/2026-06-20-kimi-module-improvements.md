# Kimi 模块改进实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 Kimi 模块刷新按钮样式，将 Configuration 快捷设置迁移到通用 Conf 框架，并把 Sessions 列表改为按 `workDir` 分组的树形结构。

**Architecture:** 前端组件内直接修复样式；Config.vue 复用项目通用 `ConfVM` + `Common` 组件，通过 `@iarna/toml` 解析/生成 TOML；Sessions 前端按 `workDir` 分组构建树形数据，后端保持扁平列表不变。

**Tech Stack:** Vue 3 + TypeScript + Element Plus + Tailwind CSS + `@iarna/toml`

---

## 文件改动概览

| 文件 | 责任 |
|------|------|
| `src/render/components/Kimi/Config.vue` | 修复刷新按钮样式；移除内联 Quick Settings；接入通用 Conf 框架 |
| `src/render/components/Kimi/Logs.vue` | 修复刷新按钮样式 |
| `src/render/components/Kimi/Sessions.vue` | 修复刷新按钮样式；将 `el-table` 替换为按 `workDir` 分组的 `el-tree` |
| `src/render/components/Kimi/Service.vue` | 修复刷新按钮样式 |
| `src/render/components/Kimi/setup.ts` | 删除 `quickSettings` 相关逻辑；新增 `sessionTree` computed |
| `src/fork/module/Kimi/index.ts` | 删除未使用的 `getQuickSettings` / `setQuickSettings` |

---

### Task 1: 修复 Kimi 模块刷新按钮样式

**Files:**
- Modify: `src/render/components/Kimi/Config.vue:11-17`
- Modify: `src/render/components/Kimi/Logs.vue:11-17`
- Modify: `src/render/components/Kimi/Sessions.vue:6-12`
- Modify: `src/render/components/Kimi/Service.vue`（刷新按钮所在位置）

目标：去掉对 `.refresh-icon` 类的依赖，直接给 `<yb-icon>` 添加 `w-[24px] h-[24px]`。

- [ ] **Step 1: 修改 Config.vue 刷新按钮**

将

```vue
<el-button link :disabled="KimiSetup.loading" @click="KimiSetup.init()">
  <yb-icon
    :svg="import('@/svg/icon_refresh.svg?raw')"
    class="refresh-icon"
    :class="{ 'fa-spin': KimiSetup.loading }"
  ></yb-icon>
</el-button>
```

改为

```vue
<el-button link :disabled="KimiSetup.loading" @click="KimiSetup.init()">
  <yb-icon
    :svg="import('@/svg/icon_refresh.svg?raw')"
    class="w-[24px] h-[24px]"
    :class="{ 'fa-spin': KimiSetup.loading }"
  ></yb-icon>
</el-button>
```

- [ ] **Step 2: 修改 Logs.vue 刷新按钮**

将

```vue
<el-button link :disabled="KimiSetup.loading" @click="init">
  <yb-icon
    :svg="import('@/svg/icon_refresh.svg?raw')"
    class="refresh-icon"
    :class="{ 'fa-spin': KimiSetup.loading }"
  ></yb-icon>
</el-button>
```

改为

```vue
<el-button link :disabled="KimiSetup.loading" @click="init">
  <yb-icon
    :svg="import('@/svg/icon_refresh.svg?raw')"
    class="w-[24px] h-[24px]"
    :class="{ 'fa-spin': KimiSetup.loading }"
  ></yb-icon>
</el-button>
```

- [ ] **Step 3: 修改 Sessions.vue 刷新按钮**

将

```vue
<el-button link :disabled="KimiSetup.loading" @click="KimiSetup.refreshSessions()">
  <yb-icon
    :svg="import('@/svg/icon_refresh.svg?raw')"
    class="refresh-icon"
    :class="{ 'fa-spin': KimiSetup.loading }"
  ></yb-icon>
</el-button>
```

改为

```vue
<el-button link :disabled="KimiSetup.loading" @click="KimiSetup.refreshSessions()">
  <yb-icon
    :svg="import('@/svg/icon_refresh.svg?raw')"
    class="w-[24px] h-[24px]"
    :class="{ 'fa-spin': KimiSetup.loading }"
  ></yb-icon>
</el-button>
```

- [ ] **Step 4: 修改 Service.vue 刷新按钮（如有）**

在 `src/render/components/Kimi/Service.vue` 中找到使用 `refresh-icon` 的 `<yb-icon>`，同样替换为 `class="w-[24px] h-[24px]"`。

- [ ] **Step 5: 验证样式**

运行开发服务器：

```bash
yarn dev
```

打开 Kimi 模块的 Config / Log / Sessions / Service 页，确认右上角刷新按钮大小为 24px × 24px，与 `.version-manager` 下的按钮一致。

- [ ] **Step 6: 提交**

```bash
git add src/render/components/Kimi/Config.vue src/render/components/Kimi/Logs.vue src/render/components/Kimi/Sessions.vue src/render/components/Kimi/Service.vue
git commit -m "style(kimi): use tailwind sizing for refresh buttons"
```

---

### Task 2: 将 Configuration 快捷设置迁移到通用 Conf 框架

**Files:**
- Modify: `src/render/components/Kimi/Config.vue`
- Modify: `src/render/components/Kimi/setup.ts`
- Modify: `src/fork/module/Kimi/index.ts`

目标：移除 Kimi 内联 Quick Settings，改用 `ConfVM` 的 `show-commond` + `Common` 组件；删除 `setup.ts` 和 fork 后端中不再使用的 quick settings 逻辑。

- [ ] **Step 1: 修改 Config.vue 使用 Common 组件**

在 `<script>` 中引入：

```typescript
import { computed, ref, watch, Ref, reactive } from 'vue'
import ConfVM from '@/components/Conf/conf.vue'
import ToolVM from '@/components/Conf/tool.vue'
import Common from '@/components/Conf/common.vue'
import { type CommonSetItem } from '@/components/Conf/setup'
import { I18nT } from '@lang/index'
import { KimiSetup } from '@/components/Kimi/setup'
import { debounce } from 'lodash-es'
import { parse as TOMLParse, stringify as TOMLStringify } from '@iarna/toml'
import { uuid } from '@/util/Index'
```

- [ ] **Step 2: 定义 CommonSetItem 数组**

在 `Config.vue` 的 `setup` 脚本中定义：

```typescript
const names: CommonSetItem[] = [
  {
    name: 'default_permission_mode',
    value: 'manual',
    enable: true,
    options: [
      { value: 'manual', label: 'manual' },
      { value: 'auto', label: 'auto' },
      { value: 'yolo', label: 'yolo' }
    ],
    tips() {
      return I18nT('kimi.permissionMode')
    }
  },
  {
    name: 'default_thinking',
    value: 'false',
    enable: true,
    options: [
      { value: 'true', label: 'true' },
      { value: 'false', label: 'false' }
    ],
    tips() {
      return I18nT('kimi.defaultThinking')
    }
  },
  {
    name: 'default_plan_mode',
    value: 'false',
    enable: true,
    options: [
      { value: 'true', label: 'true' },
      { value: 'false', label: 'false' }
    ],
    tips() {
      return I18nT('kimi.defaultPlanMode')
    }
  },
  {
    name: 'telemetry',
    value: 'true',
    enable: true,
    options: [
      { value: 'true', label: 'true' },
      { value: 'false', label: 'false' }
    ],
    tips() {
      return I18nT('kimi.telemetry')
    }
  }
]
```

- [ ] **Step 3: 实现解析与同步逻辑**

在 `Config.vue` 中：

```typescript
const conf = ref()
const commonSetting: Ref<CommonSetItem[]> = ref([])
let editConfig = ''
let watcher: any

const onSettingUpdate = () => {
  if (!editConfig) {
    return
  }
  const config: any = TOMLParse(editConfig)
  commonSetting.value.forEach((item) => {
    if (item.enable) {
      let value: any = item.value
      if (item.name === 'default_thinking' || item.name === 'default_plan_mode' || item.name === 'telemetry') {
        value = value === 'true'
      }
      config[item.name] = value
    } else {
      delete config[item.name]
    }
  })
  const content = TOMLStringify(config)
  conf.value.setEditValue(content)
  editConfig = content
}

const getCommonSetting = () => {
  if (watcher) {
    watcher()
  }
  const config: any = editConfig ? TOMLParse(editConfig) : {}
  const arr = names.map((item) => {
    const find = config[item.name]
    let value = find ?? item.value
    if (item.name === 'default_thinking' || item.name === 'default_plan_mode' || item.name === 'telemetry') {
      value = String(value === true || value === 'true')
    } else {
      value = String(value)
    }
    item.enable = typeof find !== 'undefined'
    item.value = value
    item.key = uuid()
    return item
  })
  commonSetting.value = reactive(arr) as any
  watcher = watch(commonSetting, debounce(onSettingUpdate, 500), { deep: true })
}

const onTypeChange = (type: 'default' | 'common', config: string) => {
  if (editConfig !== config || commonSetting.value.length === 0) {
    editConfig = config
    getCommonSetting()
  }
}
```

- [ ] **Step 4: 更新 Config.vue 模板**

将模板改为：

```vue
<template>
  <div class="module-config h-full overflow-hidden flex flex-col">
    <el-card class="app-base-el-card flex-1 overflow-hidden">
      <template #header>
        <div class="flex items-center justify-between">
          <el-radio-group v-model="filepath">
            <template v-for="(item, _index) in configs" :key="_index">
              <el-radio-button :value="item.path" :label="item.name"></el-radio-button>
            </template>
          </el-radio-group>
          <el-button link :disabled="KimiSetup.loading" @click="KimiSetup.init()">
            <yb-icon
              :svg="import('@/svg/icon_refresh.svg?raw')"
              class="w-[24px] h-[24px]"
              :class="{ 'fa-spin': KimiSetup.loading }"
            ></yb-icon>
          </el-button>
        </div>
      </template>
      <template #default>
        <ConfVM
          :key="filepath"
          ref="conf"
          class="h-full overflow-hidden"
          :type-flag="'kimi'"
          :show-load-default="false"
          :file="filepath"
          :file-ext="fileExt"
          :config-language="configLanguage"
          :show-commond="true"
          @on-type-change="onTypeChange"
        >
          <template #common>
            <div class="p-4 h-full overflow-auto">
              <Common :setting="commonSetting" />
            </div>
          </template>
        </ConfVM>
      </template>
      <template #footer>
        <ToolVM v-if="conf" :conf="conf"></ToolVM>
      </template>
    </el-card>
  </div>
</template>
```

- [ ] **Step 5: 移除内联 Quick Settings 样式**

删除 `Config.vue` 底部的 `<style scoped>` 块（如果没有其他样式需要保留）。

- [ ] **Step 6: 修改 setup.ts 删除 quickSettings 逻辑**

在 `src/render/components/Kimi/setup.ts` 中：

1. 删除 `QuickSettings` 接口。
2. 删除 `Kimi` 类中的 `quickSettings` 属性。
3. 删除 `init()` 中的 `getQuickSettings()` 调用。
4. 删除 `getQuickSettings()` 和 `setQuickSettings()` 方法。

修改后的 `init()` 大致为：

```typescript
init() {
  this.loading = true
  Promise.all([this.checkInstalled(), this.getConfigPath()]).then(() => {
    this.loading = false
  })
}
```

- [ ] **Step 7: 修改 fork 后端删除 quick settings 方法**

在 `src/fork/module/Kimi/index.ts` 中删除 `getQuickSettings()` 和 `setQuickSettings()` 方法。

- [ ] **Step 8: 验证快捷设置**

运行开发服务器：

```bash
yarn dev
```

打开 Kimi Configuration Tab：
- 确认有 "Raw File" / "Common Setting" 两个切换按钮。
- 在 Common Setting 中修改 `default_permission_mode` 或 `default_thinking`。
- 切回 Raw File，确认 `config.toml` 内容已同步更新。
- 点击保存按钮，确认文件落盘。

- [ ] **Step 9: 提交**

```bash
git add src/render/components/Kimi/Config.vue src/render/components/Kimi/setup.ts src/fork/module/Kimi/index.ts
git commit -m "feat(kimi): migrate quick settings to common conf framework"
```

---

### Task 3: Sessions 列表按 workDir 分组显示成树形

**Files:**
- Modify: `src/render/components/Kimi/Sessions.vue`
- Modify: `src/render/components/Kimi/setup.ts`

目标：后端保持扁平列表，前端按 `workDir` 分组构建树形数据，使用 `el-tree` 展示。

- [ ] **Step 1: 在 setup.ts 中定义树形节点类型并构建树**

在 `src/render/components/Kimi/setup.ts` 中添加：

```typescript
export interface SessionTreeNode {
  id: string
  label: string
  isLeaf: boolean
  session?: SessionItem
  children?: SessionTreeNode[]
}
```

在 `Kimi` 类中添加 `sessionTree` computed：

```typescript
get sessionTree(): SessionTreeNode[] {
  const groupMap: Record<string, SessionItem[]> = {}
  this.sessions.forEach((session) => {
    const dir = session.workDir || 'Unknown'
    if (!groupMap[dir]) {
      groupMap[dir] = []
    }
    groupMap[dir].push(session)
  })
  return Object.entries(groupMap).map(([dir, items]) => {
    return {
      id: dir,
      label: dir,
      isLeaf: false,
      children: items.map((session) => ({
        id: session.id,
        label: session.title || session.id,
        isLeaf: true,
        session
      }))
    }
  })
}
```

- [ ] **Step 2: 修改 Sessions.vue 模板使用 el-tree**

将 `el-table` 区域替换为：

```vue
<el-tree
  :data="filteredSessionTree"
  node-key="id"
  default-expand-all
  :highlight-current="true"
  :expand-on-click-node="false"
  @node-click="onNodeClick"
>
  <template #default="{ node, data }">
    <div class="flex items-center justify-between flex-1 pr-4">
      <span class="truncate">{{ node.label }}</span>
      <div v-if="data.isLeaf" class="flex items-center gap-1">
        <el-button link :icon="VideoPlay" @click.stop="resumeSession(data.session!)" />
        <el-button link :icon="Download" @click.stop="exportSession(data.session!)" />
        <el-button link type="danger" :icon="Delete" @click.stop="deleteSession(data.session!)" />
      </div>
    </div>
  </template>
</el-tree>
```

- [ ] **Step 3: 修改 Sessions.vue 脚本**

在 `<script>` 中：

1. 引入 `SessionTreeNode`：

```typescript
import { KimiSetup, SessionItem, SessionTreeNode } from './setup'
```

2. 将 `filteredSessions` 改为 `filteredSessionTree`：

```typescript
const filteredSessionTree = computed(() => {
  if (!search.value) return KimiSetup.sessionTree
  const keyword = search.value.toLowerCase()
  const filterNode = (node: SessionTreeNode): SessionTreeNode | null => {
    if (node.isLeaf) {
      const session = node.session!
      const match =
        session.title.toLowerCase().includes(keyword) ||
        session.workDir.toLowerCase().includes(keyword) ||
        session.id.toLowerCase().includes(keyword)
      return match ? node : null
    }
    const children = node.children?.map(filterNode).filter((n): n is SessionTreeNode => !!n)
    if (children && children.length > 0) {
      return { ...node, children }
    }
    return node.label.toLowerCase().includes(keyword) ? node : null
  }
  return KimiSetup.sessionTree.map(filterNode).filter((n): n is SessionTreeNode => !!n)
})
```

3. 添加节点点击处理：

```typescript
const onNodeClick = (data: SessionTreeNode) => {
  if (data.isLeaf && data.session) {
    resumeSession(data.session)
  }
}
```

4. 更新 `resumeSession` / `exportSession` / `deleteSession` 接收 `SessionItem`：

```typescript
const resumeSession = (row: SessionItem) => {
  KimiSetup.resumeSession(row.id, xtermDom)
}

const exportSession = (row: SessionItem) => {
  KimiSetup.exportSession(row.id, xtermDom)
}

const deleteSession = (row: SessionItem) => {
  ElMessageBox.confirm(I18nT('base.delAlertContent'), I18nT('base.delAlertTitle'), {
    confirmButtonText: I18nT('base.confirm'),
    cancelButtonText: I18nT('base.cancel'),
    type: 'warning'
  })
    .then(() => {
      KimiSetup.deleteSession(row.id)
    })
    .catch(() => {})
}
```

- [ ] **Step 4: 验证 Sessions 树形列表**

运行开发服务器：

```bash
yarn dev
```

打开 Kimi Sessions Tab：
- 确认会话按 `workDir` 分组显示。
- 确认可以展开/折叠文件夹节点。
- 确认搜索框能同时过滤文件夹和会话。
- 确认恢复、导出、删除按钮在叶子节点上可用。

- [ ] **Step 5: 提交**

```bash
git add src/render/components/Kimi/Sessions.vue src/render/components/Kimi/setup.ts
git commit -m "feat(kimi): group sessions by workDir in tree view"
```

---

### Task 4: 构建与类型检查

- [ ] **Step 1: 运行 TypeScript 检查**

```bash
npx vue-tsc --noEmit
```

预期：无新增类型错误。

- [ ] **Step 2: 运行 ESLint**

```bash
npx eslint src/render/components/Kimi src/fork/module/Kimi/index.ts
```

预期：无新增错误。

- [ ] **Step 3: 运行生产构建**

```bash
yarn build
```

预期：构建成功。

- [ ] **Step 4: 提交（如需要）**

```bash
git add -A
git commit -m "chore(kimi): pass type check and build"
```

---

## 自我审查

### Spec 覆盖检查

| Spec 需求 | 对应任务 |
|-----------|----------|
| 刷新按钮样式修复 | Task 1 |
| 快捷设置迁移到通用 Conf 框架 | Task 2 |
| 会话列表按 workDir 树形显示 | Task 3 |
| 构建与类型检查 | Task 4 |

### Placeholder 检查

- 无 TBD/TODO。
- 所有步骤包含具体代码或命令。
- 文件路径均为绝对项目路径。

### 类型一致性检查

- `SessionTreeNode` 在 Task 3 Step 1 定义，Step 2/3 中使用一致。
- `CommonSetItem` 引用自 `@/components/Conf/setup`。
- `TOMLParse` / `TOMLStringify` 引用自 `@iarna/toml`。
