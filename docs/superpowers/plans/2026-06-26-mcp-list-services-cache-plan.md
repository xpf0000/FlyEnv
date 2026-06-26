# MCP `list_services` Cache Behavior Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 MCP `list_services` 在无参数时完全只读缓存，在传 `flags` 时仅对缓存 miss 的服务回源补拉。

**Architecture:** 将缓存读取策略集中到 `ServiceVersionManager` 和 `MCPTools`；`MCPServer` 只负责把 MCP 参数透传到 tools。用一个独立的 `tsx` 行为测试锁住“无参数不回源”和“有参数只补 miss”的语义。

**Tech Stack:** TypeScript + Node `assert` + `tsx`

---

## 文件改动概览

| 文件 | 责任 |
|------|------|
| `src/main/core/ServiceVersionManager.ts` | 新增只读缓存批量读取接口 |
| `src/main/core/MCPTools.ts` | 根据 `flags` 是否为空切换缓存策略 |
| `src/main/core/MCPServer.ts` | `list_services` 透传原始 `flags` |
| `scripts/mcp-list-services-cache-test.ts` | 独立行为测试，验证缓存语义 |

### Task 1: 写失败测试锁定目标行为

**Files:**
- Create: `scripts/mcp-list-services-cache-test.ts`

- [ ] **Step 1: 写测试脚本**

覆盖 4 个场景：

```ts
await tools.listServices(undefined)
await tools.listServices([])
await tools.listServices(['nginx', 'mysql'])
await tools.listServices(['mysql'])
```

并断言：

- 无参数/空数组不触发 `version.allInstalledVersions`
- 指定 flags 时只刷新缓存 miss
- 缓存命中的空数组不重复刷新

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npx tsx scripts/mcp-list-services-cache-test.ts
```

Expected:

- 当前实现会在 `listServices(undefined)` 场景失败，说明“无参数只读缓存”尚未实现。

### Task 2: 实现缓存只读与按需补拉

**Files:**
- Modify: `src/main/core/ServiceVersionManager.ts`
- Modify: `src/main/core/MCPTools.ts`
- Modify: `src/main/core/MCPServer.ts`

- [ ] **Step 1: 给 `ServiceVersionManager` 增加只读缓存批量接口**

新增一个不触发 `refresh` 的批量读取方法，返回指定 flags 的缓存快照。

- [ ] **Step 2: 修改 `MCPTools.listServices`**

把 `flags` 改成可选参数：

- `undefined` / `[]` => `getCachedFlags()` + 只读缓存
- 非空数组 => 现有“缓存优先、miss 回源”

- [ ] **Step 3: 修改 `MCPServer` handler**

把：

```ts
const flags = Array.isArray(args?.flags) && args.flags.length ? args.flags : this.tools.getCachedFlags()
return textResult(await this.tools.listServices(flags))
```

改成：

```ts
return textResult(await this.tools.listServices(args?.flags))
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```bash
npx tsx scripts/mcp-list-services-cache-test.ts
```

Expected:

- 输出所有测试通过
- 无参数/空数组场景不出现 fork 刷新调用

- [ ] **Step 5: 做一次类型检查**

Run:

```bash
npx tsc --noEmit
```

Expected:

- 本次改动涉及文件无新增类型错误
