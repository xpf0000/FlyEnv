# AI Memory MCP Tabs and 3D Universe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group MCP tools by active plugin, remove AI Memory's separate sidebar MCP switch, and add an interactive 3D memory universe without losing existing management workflows.

**Architecture:** The main process remains the source of truth for active plugin tools and supplies display names. The renderer groups that catalog into tabs. AI Memory renders the current search page through a dependency-free Canvas 3D projection; pure layout/projection functions are separated from Vue canvas lifecycle and all memory IPC remains in `MemoryManager`.

**Tech Stack:** TypeScript, Vue 3 Composition API, Element Plus, Canvas 2D, node:test, tsx.

---

## File map

- `src/shared/mcpRuntimeCatalog.ts`: add optional plugin display metadata to runtime tools/registrations.
- `src/main/plugins/PluginManager.ts`: pass manifest plugin name into active MCP registrations.
- `src/main/core/PluginMCPRegistry.ts`: expose plugin name with each listed tool.
- `src/render/components/MCP/toolGroups.ts`: pure built-in/plugin grouping and active-tab fallback.
- `src/render/components/MCP/Tools.vue`: tabbed tool enablement and approval UI.
- `src/lang/{en,zh}/mcp.json`: built-in group label.
- `test/mcp-tool-groups.test.ts`: grouping tests.
- `test/plugin-mcp-registry.test.ts`: plugin display metadata contract.
- `plugins/ai-memory/render/aside.vue`: navigation-only enabled plugin entry.
- `plugins/ai-memory/render/{controller.ts,manager.ts}`: remove sidebar-only MCP mutation path.
- `plugins/ai-memory/tests/controller.test.ts`: remove obsolete switch behavior tests.
- `plugins/ai-memory/lang/{en,zh}.ts`: remove switch copy and add universe copy.
- `plugins/ai-memory/render/universe.ts`: stable graph layout, edges, camera projection, picking.
- `plugins/ai-memory/tests/universe.test.ts`: graph math tests.
- `plugins/ai-memory/render/MemoryUniverse.vue`: canvas rendering and interaction.
- `plugins/ai-memory/render/Index.vue`: universe/list switch and existing detail integration.

No new Pinia store, shared setup key, dependency, IPC command, or service lifecycle is introduced. No git commit is created unless the user explicitly requests one.

### Task 1: MCP plugin metadata and tab grouping

**Files:**
- Modify: `src/shared/mcpRuntimeCatalog.ts`
- Modify: `src/main/plugins/PluginManager.ts:671-683`
- Modify: `src/main/core/PluginMCPRegistry.ts:41-46`
- Create: `src/render/components/MCP/toolGroups.ts`
- Create: `test/mcp-tool-groups.test.ts`
- Modify: `test/plugin-mcp-registry.test.ts`
- Modify: `src/render/components/MCP/Tools.vue`
- Modify: `src/lang/en/mcp.json`, `src/lang/zh/mcp.json`

- [ ] **Step 1: Write failing grouping and metadata tests**

```ts
// test/mcp-tool-groups.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { groupMcpTools, resolveMcpToolGroup } from '../src/render/components/MCP/toolGroups'

test('groups built-in and plugin tools with display names and stable order', () => {
  const groups = groupMcpTools([
    { name: 'flyenv_service', description: '', risky: false, readOnly: true },
    { name: 'memory_get', description: '', risky: false, readOnly: true, pluginId: 'ai-memory', pluginName: 'AI Memory' },
    { name: 'memory_store', description: '', risky: true, readOnly: false, pluginId: 'ai-memory', pluginName: 'AI Memory' },
    { name: 'other_run', description: '', risky: true, readOnly: false, pluginId: 'other' }
  ])
  assert.deepEqual(groups.map((group) => group.id), ['builtin', 'plugin:ai-memory', 'plugin:other'])
  assert.equal(groups[1].label, 'AI Memory')
  assert.equal(groups[2].label, 'other')
  assert.equal(groups[1].tools.length, 2)
  assert.equal(resolveMcpToolGroup(groups, 'plugin:missing'), 'builtin')
})
```

Add to the first registry test:

```ts
assert.equal(runtime.listTools().find((tool) => tool.name === 'fixture_write')?.pluginName, 'Fixture')
```

The fixture registration must include `pluginName: 'Fixture'`.

- [ ] **Step 2: Run tests and confirm the new API is absent**

Run: `npx tsx --test test/mcp-tool-groups.test.ts test/plugin-mcp-registry.test.ts`
Expected: FAIL because `toolGroups.ts` does not exist and `pluginName` is not returned.

- [ ] **Step 3: Add metadata propagation and pure grouping**

Add `pluginName?: string` to `MCPRuntimeTool` and `PluginMCPRegistration`. In `getMCPRegistrations()`, add `pluginName: record.manifest.name`. In `listTools()`, destructure and return both `pluginId` and `pluginName`.

```ts
// src/render/components/MCP/toolGroups.ts
import type { MCPRuntimeTool } from '@shared/mcpRuntimeCatalog'

export type MCPToolGroup = { id: string; label: string; tools: MCPRuntimeTool[] }

export function groupMcpTools(tools: MCPRuntimeTool[]): MCPToolGroup[] {
  const groups: MCPToolGroup[] = [{ id: 'builtin', label: 'FlyEnv', tools: [] }]
  const plugins = new Map<string, MCPToolGroup>()
  for (const tool of tools) {
    if (!tool.pluginId) {
      groups[0].tools.push(tool)
      continue
    }
    const id = `plugin:${tool.pluginId}`
    if (!plugins.has(id)) {
      plugins.set(id, { id, label: tool.pluginName || tool.pluginId, tools: [] })
    }
    plugins.get(id)!.tools.push(tool)
  }
  return [...groups, ...plugins.values()]
}

export function resolveMcpToolGroup(groups: MCPToolGroup[], current: string) {
  return groups.some((group) => group.id === current) ? current : 'builtin'
}
```

- [ ] **Step 4: Replace the mixed tool list with tabs**

Create `activeGroup = ref('builtin')`, compute `groups = computed(() => groupMcpTools(MCPSetup.tools))`, localize the built-in label with `I18nT('mcp.builtinTools')`, and watch `groups` to apply `resolveMcpToolGroup`. Wrap the two existing cards in:

```vue
<el-tabs v-model="activeGroup" class="mcp-tool-tabs">
  <el-tab-pane v-for="group in groups" :key="group.id" :name="group.id">
    <template #label>{{ group.id === 'builtin' ? I18nT('mcp.builtinTools') : group.label }}
      <span class="mcp-tool-count">{{ group.tools.length }}</span>
    </template>
    <div v-for="tool in group.tools" :key="tool.name" class="memory-tool-row">
      <span>{{ tool.name }}</span>
      <el-switch
        :model-value="MCPSetup.config.enabledTools.includes(tool.name)"
        @change="(value: any) => MCPSetup.toggleTool(tool.name, !!value)"
      />
    </div>
    <div
      v-for="tool in group.tools.filter((item) => item.risky || !item.readOnly)"
      :key="tool.name"
      class="memory-tool-row"
    >
      <span>{{ tool.name }}</span>
      <el-radio-group
        :model-value="MCPSetup.config.approval[tool.name] || (tool.pluginId ? 'confirm' : 'auto')"
        @change="(value: any) => MCPSetup.setApproval(tool.name, value)"
      >
        <el-radio-button value="auto">{{ I18nT('mcp.approvalAuto') }}</el-radio-button>
        <el-radio-button value="confirm">{{ I18nT('mcp.approvalConfirm') }}</el-radio-button>
      </el-radio-group>
    </div>
  </el-tab-pane>
</el-tabs>
```

Both existing loops use `group.tools`; approval retains `.filter((item) => item.risky || !item.readOnly)`. Add `builtinTools` translations: `Built-in` / `内置工具`.

- [ ] **Step 5: Run focused checks**

Run: `npx tsx --test test/mcp-tool-groups.test.ts test/plugin-mcp-registry.test.ts`
Expected: PASS.

### Task 2: Remove AI Memory's independent sidebar switch

**Files:**
- Modify: `plugins/ai-memory/render/aside.vue`
- Modify: `plugins/ai-memory/render/controller.ts`
- Modify: `plugins/ai-memory/render/manager.ts`
- Modify: `plugins/ai-memory/tests/controller.test.ts`
- Modify: `plugins/ai-memory/lang/en.ts`, `plugins/ai-memory/lang/zh.ts`

- [ ] **Step 1: Remove obsolete switch tests**

Delete the three tests covering `setMcpEnabled`: serialized toggle/shared gateway, failed startup/HTTP grants, and read-only subset grants. Retain `loadConnection` tests because Agent setup still reads shared MCP state.

- [ ] **Step 2: Simplify the sidebar**

The icon block uses `:class="{ run: true }"` (or the static `run` class). Remove the tooltip, switch, all MCP/MemoryManager imports, computed values and `onMounted`; retain `AsideSetup`, `memoryIcon`, `MemoryT`, and navigation.

- [ ] **Step 3: Delete the controller mutation path**

Remove `MemoryController.setMcpEnabled()` and the `startGateway`/`setMemoryTools` dependency fields and fixture stubs. Keep `readConnection`, `loadConnection`, client configuration and status copy unchanged. Remove `startGateway`, `setMemoryTools`, and the now-unused `memoryTools` enablement helper from `manager.ts`; `readConnection` can use a local constant for counting the five tools.

- [ ] **Step 4: Remove unused copy**

Delete `memoryMcpSwitch`, `mcpSwitchHelp`, `upgradeHost`, `mcpHttpRequired`, `mcpStartFailed`, `mcpToolsFailed`, and `mcpStatusUnknown` from both language files.

- [ ] **Step 5: Run controller and boundary tests**

Run: `npx tsx --test plugins/ai-memory/tests/controller.test.ts && yarn test:renderer-operation-boundaries`
Expected: PASS; no page owns IPC and manager still uses `reactiveBind`/module storage.

### Task 3: Build and test the universe graph math

**Files:**
- Create: `plugins/ai-memory/render/universe.ts`
- Create: `plugins/ai-memory/tests/universe.test.ts`

- [ ] **Step 1: Write failing graph tests**

```ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildUniverse, projectNode, pickUniverseNode } from '../render/universe'
import memories from './fixtures/memories.json'

test('layout is stable and connects only shared topics or tags', () => {
  const hits = memories.slice(0, 6) as any
  const first = buildUniverse(hits)
  assert.deepEqual(buildUniverse(hits), first)
  assert.equal(first.nodes.length, hits.length)
  assert.ok(first.edges.every((edge) => edge.source !== edge.target))
  assert.ok(first.edges.some((edge) => edge.reason === 'topic' || edge.reason === 'tag'))
})

test('projection preserves node identity and picking respects screen radius', () => {
  const graph = buildUniverse(memories.slice(0, 3) as any)
  const point = projectNode(graph.nodes[0], { yaw: 0.4, pitch: -0.2, zoom: 1 }, 800, 500)
  assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y) && point.depth > 0)
  assert.equal(pickUniverseNode([point], point.x, point.y)?.id, point.id)
  assert.equal(pickUniverseNode([point], point.x + 100, point.y + 100), undefined)
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx tsx --test plugins/ai-memory/tests/universe.test.ts`
Expected: FAIL because `universe.ts` does not exist.

- [ ] **Step 3: Implement stable graph and camera math**

Export these concrete types and functions:

```ts
import type { MemoryType, SearchHit } from '../shared'

export type UniverseNode = {
  hit: SearchHit
  id: string
  x: number
  y: number
  z: number
  color: string
  radius: number
}
export type UniverseEdge = { source: string; target: string; reason: 'topic' | 'tag' }
export type UniverseGraph = { nodes: UniverseNode[]; edges: UniverseEdge[] }
export type UniverseCamera = { yaw: number; pitch: number; zoom: number }
export type ProjectedNode = UniverseNode & { x: number; y: number; depth: number; screenRadius: number }
```

Use a 32-bit FNV-style string hash for deterministic values. Map `MEMORY_TYPES` to eight distinct colors. Assign each type an evenly spaced cluster center on a sphere; hash the ID for local offsets and keep coordinates in roughly `[-1, 1]`. Radius is `7` normally and `10` for pinned nodes.

Build each unordered node pair at most once. Use `reason: 'topic'` when normalized non-empty topics match; otherwise use `reason: 'tag'` when lowercased tags intersect. Do not connect nodes without shared metadata.

`projectNode` rotates yaw around Y then pitch around X, translates Z by `4 / zoom`, computes `scale = Math.min(width, height) * 0.32`, perspective `scale / depth`, and returns screen coordinates plus positive depth and scaled radius. `pickUniverseNode` iterates nearest projected nodes first and returns the first whose pointer distance is within `Math.max(12, screenRadius + 5)`.

- [ ] **Step 4: Run graph tests**

Run: `npx tsx --test plugins/ai-memory/tests/universe.test.ts`
Expected: PASS.

### Task 4: Add the interactive universe and preserve management flows

**Files:**
- Create: `plugins/ai-memory/render/MemoryUniverse.vue`
- Modify: `plugins/ai-memory/render/Index.vue`
- Modify: `plugins/ai-memory/lang/en.ts`, `plugins/ai-memory/lang/zh.ts`

- [ ] **Step 1: Add localized interface copy**

Add keys for `universe`, `list`, `memoriesCount`, `connectionsCount`, `autoRotate`, `resetView`, `zoomIn`, `zoomOut`, `universeHelp`, and `universeUnavailable` in English and Chinese. Help explicitly says shared topics/tags create connections and describes drag/scroll/click.

- [ ] **Step 2: Implement the canvas component**

`MemoryUniverse.vue` accepts `{ memories: SearchHit[]; busy?: boolean }` and emits `select: [hit: SearchHit]`. It contains a dark space panel, stats, type legend, camera controls, canvas, and hover card.

Setup owns only view state:

```ts
const props = defineProps<{ memories: SearchHit[]; busy?: boolean }>()
const emit = defineEmits<{ select: [hit: SearchHit] }>()
const canvas = ref<HTMLCanvasElement>()
const camera = reactive<UniverseCamera>({ yaw: 0.35, pitch: -0.18, zoom: 1 })
const autoRotate = ref(false)
const graph = computed(() => buildUniverse(props.memories))
```

On mount, observe the container with `ResizeObserver`, resize for device pixel ratio, and start one animation loop. On unmount, cancel the frame and disconnect observers/listeners. Render edges before nodes, sort nodes far-to-near, draw radial glows, core circles and short labels, and keep the current hover/selection visible. Use the existing `displayDate` and `MemoryT` in the hover card.

Pointer down/move/up handles drag rotation and distinguishes movement from clicks; wheel prevents page scrolling and clamps zoom to `[0.65, 2.4]`. Hover uses `pickUniverseNode`; click emits the picked node's original `SearchHit`. Buttons reset the camera and adjust zoom. Canvas failure sets an unavailable message rather than affecting search state.

- [ ] **Step 3: Integrate universe/list switching**

In `Index.vue`, add `view = ref<'universe' | 'list'>('universe')` and an `el-radio-group` in the memory toolbar. Render:

```vue
<MemoryUniverse
  v-if="view === 'universe' && manager.searchResult?.data?.results.length"
  :memories="manager.searchResult.data.results"
  :busy="manager.searchBusy"
  @select="select"
/>
```

Keep the table in `v-else` with its existing empty template. For an empty universe, render the same empty state/actions rather than a blank canvas. Keep all alerts, project notices, operations, pagination, drawer, editor and archive dialogs unchanged. Update `.memory-table-wrap` and universe container flex sizing so both fill available height.

- [ ] **Step 4: Format and run static checks**

Run: `npx prettier --check src/render/components/MCP/Tools.vue src/render/components/MCP/toolGroups.ts plugins/ai-memory/render plugins/ai-memory/tests/universe.test.ts`
Expected: PASS after formatting only the changed files with the project's Prettier configuration.

Run: `npx vue-tsc --noEmit -p tsconfig.json`
Expected: PASS, or record pre-existing errors separately without changing unrelated code.

### Task 5: Full verification and cleanup

**Files:**
- Verify all files above; no generated artifacts are retained.

- [ ] **Step 1: Run focused and plugin suites**

Run: `npx tsx --test test/mcp-tool-groups.test.ts test/plugin-mcp-registry.test.ts plugins/ai-memory/tests/*.test.ts`
Expected: PASS for all focused and AI Memory tests.

- [ ] **Step 2: Run plugin package contract and renderer boundaries**

Run: `yarn plugin:test ai-memory && yarn test:renderer-operation-boundaries`
Expected: `plugin contract passed: ai-memory@0.1.0` and boundary checks PASS.

- [ ] **Step 3: Exercise application integration**

Run the existing `npx tsx scripts/ai-memory-app-smoke.ts` application smoke if the host supports it. Verify actual plugin packaging/host loading and real memory calls, not only imports. For UI verification, launch the normal development app and inspect MCP tabs and the universe with real fixture/current memories: rotate, zoom, click a node into details, switch to list, and confirm no sidebar switch. If a visual host cannot be driven in this environment, state that limitation explicitly.

- [ ] **Step 4: Review failure boundaries and workspace**

Review every changed early return/catch: graph rendering cannot mutate search results; MCP tool operations retain existing independent behavior; removed switch cannot stop the shared gateway. Run `git status --short` and remove only artifacts created by verification that are not deliverables. Do not modify or delete pre-existing user files.
