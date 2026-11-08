# AI Memory Dual Audit Logs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write simplified AI Memory MCP calls to FlyEnv's persistent audit file and expose detailed, content-redacted in-memory calls in a dedicated AI Memory tab.

**Architecture:** `MCPServer` owns the supplementary file-audit call and delegates persistent writes to `MCPAudit.logPlugin()`. `PluginMCPAudit` remains the bounded in-memory owner and adds whitelisted request plus content-redacted response snapshots. The existing `MemoryController` owns call-record IPC; a new view component renders the records.

**Tech Stack:** TypeScript, Vue 3, Element Plus, Node.js test runner, FlyEnv MCP.

---

## File map

- Modify `src/main/core/PluginMCPAudit.ts`: detailed bounded in-memory request/response projection.
- Modify `src/main/core/MCPAudit.ts`: simplified persistent plugin audit entries.
- Modify `src/main/core/MCPServer.ts`: record every plugin invocation in the file audit without changing tool results.
- Modify `plugins/ai-memory/render/controller.ts`: rename diagnostics state/command to call-record terminology.
- Create `plugins/ai-memory/render/MemoryCalls.vue`: call table and expandable structured details.
- Modify `plugins/ai-memory/render/Index.vue`: add the top-level calls tab.
- Modify `plugins/ai-memory/render/MemorySetup.vue`: remove old maintenance diagnostics.
- Modify `plugins/ai-memory/lang/en.ts` and `zh.ts`: call-record labels and retention help.
- Modify `test/plugin-mcp-audit.test.ts`, `test/plugin-mcp-registry.test.ts`, and `plugins/ai-memory/tests/controller.test.ts`: focused behavior tests.
- Modify `test/fixtures/ai-memory-app-smoke-host.ts` only if the existing smoke host needs the new tab selector.

No new Pinia store, shared configuration, persistent plugin diagnostics, dependencies, or long-running renderer operation are introduced. No exception to module constraints is requested.

### Task 1: Detailed in-memory call snapshots

**Files:**
- Modify: `src/main/core/PluginMCPAudit.ts`
- Test: `test/plugin-mcp-audit.test.ts`
- Test: `test/plugin-mcp-registry.test.ts`

- [ ] **Step 1: Write failing projection tests**

Add a search call containing two queries, filters, two result summaries and a nested `content` marker. Assert that `request.queries`, `request.topic`, `response.data.results[0].summary`, hit count and truncation survive, while the serialized row does not contain the content marker or a `content` property. Add store/update/get cases with private bodies in nested request and response objects. Keep the existing 201-call test and assert the queue remains capped at 200.

```ts
test('detailed calls retain queries and summaries but recursively exclude content', () => {
  const audit = new PluginMCPAudit()
  audit.register('ai-memory', ['flyenv_memory_search'])
  audit.log('flyenv_memory_search', {
    args: {
      scope: 'project', project_path: '/work/FlyEnv', queries: ['没有命中', 'MCP'],
      topic: 'audit', tags: ['mcp'], limit: 8
    },
    result: {
      outcome: 'success',
      data: {
        results: [{ id: '123e4567-e89b-42d3-a456-426614174000', title: 'Hit', summary: '摘要', content: secret }],
        truncated: false
      }
    }
  })
  const row = audit.list('ai-memory')[0]
  assert.deepEqual(row.request?.queries, ['没有命中', 'MCP'])
  assert.equal(row.response?.data?.results?.[0]?.summary, '摘要')
  assert.equal(JSON.stringify(row).includes(secret), false)
  assert.equal(JSON.stringify(row).includes('"content"'), false)
})
```

- [ ] **Step 2: Run the tests and confirm failure**

Run: `npx tsx --test test/plugin-mcp-audit.test.ts test/plugin-mcp-registry.test.ts`
Expected: FAIL because `request` and `response` are not present.

- [ ] **Step 3: Implement bounded whitelisted snapshots**

Extend `PluginAuditEntry` with optional `request` and `response` objects. Build request fields by tool name rather than cloning arbitrary invalid input. For valid structured responses, recursively omit every `content` key, retain summaries and other metadata, and never copy raw thrown error text.

```ts
export type PluginAuditEntry = {
  // existing flat fields remain unchanged
  request?: Record<string, any>
  response?: Record<string, any>
}

const withoutContent = (value: any): any => {
  if (Array.isArray(value)) return value.map(withoutContent)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'content')
      .map(([key, item]) => [key, withoutContent(item)])
  )
}

const requestSnapshot = (tool: string, args: any) => {
  const common = ['scope', 'project_path', 'id', 'request_id', 'expected_revision']
  const fields: Record<string, string[]> = {
    flyenv_memory_search: [...common, 'queries', 'type', 'topic', 'tags', 'include_global', 'status', 'include_expired', 'limit'],
    flyenv_memory_get: [...common, 'revision'],
    flyenv_memory_store: [...common, 'type', 'topic', 'title', 'summary', 'tags', 'source', 'status', 'pinned', 'expires_at', 'occurred_at', 'create_project'],
    flyenv_memory_update: [...common, 'reason', 'changes'],
    flyenv_memory_forget: common
  }
  return Object.fromEntries(
    (fields[tool] ?? ['request_id'])
      .filter((key) => args?.[key] !== undefined)
      .map((key) => [key, withoutContent(args[key])])
  )
}
```

In `log()`, set `request: requestSnapshot(tool, input.args)` and `response: withoutContent({ outcome, error_code, data, warnings })` using only defined fields. Preserve existing UUID, revision, client and error-code validation. Logging remains synchronous and bounded.

- [ ] **Step 4: Run focused tests**

Run: `npx tsx --test test/plugin-mcp-audit.test.ts test/plugin-mcp-registry.test.ts`
Expected: PASS, including all existing terminal-state and audit-failure isolation tests.

- [ ] **Step 5: Commit when git commits are explicitly requested**

```bash
git add src/main/core/PluginMCPAudit.ts test/plugin-mcp-audit.test.ts test/plugin-mcp-registry.test.ts
git commit -m "feat: add detailed AI memory call diagnostics"
```

### Task 2: Simplified persistent MCP audit

**Files:**
- Modify: `src/main/core/MCPAudit.ts`
- Modify: `src/main/core/PluginMCPRegistry.ts`
- Modify: `src/main/core/MCPServer.ts`
- Test: `test/plugin-mcp-audit.test.ts`

- [ ] **Step 1: Write a failing file-audit test**

Set `global.Server.BaseDir` to a temporary directory, call `MCPAudit.logPlugin()` with private query, summary and content markers, and read `mcp/audit.log`. Assert one JSON line includes tool, plugin, outcome, UUID, revision, duration and client but none of the private markers.

```ts
await MCPAudit.logPlugin('flyenv_memory_store', 'ai-memory', {
  args: { request_id: id, queries: [secret], summary: secret, content: secret },
  result: { outcome: 'success', data: { id, revision: 1 } },
  durationMs: 7,
  client: { name: 'Codex', version: '0.167.0' }
})
const row = JSON.parse((await readFile(join(root, 'mcp/audit.log'), 'utf8')).trim())
assert.equal(row.tool, 'flyenv_memory_store')
assert.equal(row.pluginId, 'ai-memory')
assert.equal(row.id, id)
assert.equal(row.revision, 1)
assert.equal(JSON.stringify(row).includes(secret), false)
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `npx tsx --test test/plugin-mcp-audit.test.ts`
Expected: FAIL because `logPlugin` does not exist.

- [ ] **Step 3: Implement simplified persistent entries**

Add optional plugin metadata to `MCPAuditEntry`, extract the common append logic into a private method, and add `logPlugin()`. Only include validated UUIDs, positive integer revisions, known outcomes/error codes, duration and self-reported client metadata. Do not pass raw plugin args or error messages to the file.

```ts
logPlugin(tool: string, pluginId: string, input: {
  args?: any
  result?: any
  durationMs?: number
  client?: { name?: string; version?: string }
}) {
  const result = input.result
  const data = result?.data ?? result
  const entry: MCPAuditEntry = {
    time: new Date().toISOString(), tool, pluginId,
    args: {},
    success: ['success', 'already_deleted'].includes(result?.outcome),
    outcome: outcomes.has(result?.outcome) ? result.outcome : 'failed',
    ...(PLUGIN_ERROR_CODES.has(result?.error_code) ? { error: result.error_code } : {})
  }
  // Copy only validated id/request_id/revision/duration/client metadata.
  this.append(entry)
}
```

The method may remain synchronous like the existing `appendFileSync()` logger; if synchronous, adjust the test to omit `await`. Add `PluginMCPRegistry.pluginId(name)` returning the registered owner or the audit registry's historical owner only when already registered. In the `MCPServer` plugin branch, measure invocation duration, await the original result, call `MCPAudit.logPlugin()` inside its own `try/catch`, then return the unchanged result. Do not move or repeat the registry's detailed audit call.

- [ ] **Step 4: Run audit and registry tests**

Run: `npx tsx --test test/plugin-mcp-audit.test.ts test/plugin-mcp-registry.test.ts test/mcp-http-stop.test.ts`
Expected: PASS; plugin outcomes and server shutdown behavior remain unchanged.

- [ ] **Step 5: Commit when git commits are explicitly requested**

```bash
git add src/main/core/MCPAudit.ts src/main/core/PluginMCPRegistry.ts src/main/core/MCPServer.ts test/plugin-mcp-audit.test.ts
git commit -m "feat: persist simplified plugin MCP audits"
```

### Task 3: AI Memory call-record tab

**Files:**
- Create: `plugins/ai-memory/render/MemoryCalls.vue`
- Modify: `plugins/ai-memory/render/Index.vue`
- Modify: `plugins/ai-memory/render/MemorySetup.vue`
- Modify: `plugins/ai-memory/render/controller.ts`
- Modify: `plugins/ai-memory/lang/en.ts`
- Modify: `plugins/ai-memory/lang/zh.ts`
- Test: `plugins/ai-memory/tests/controller.test.ts`

- [ ] **Step 1: Rename controller state with failing tests**

Change the existing diagnostics test to expect `callsResult` and `loadCalls()` using the same `plugin:diagnostics` IPC. Verify a failed call-record load does not alter a concurrent client-configuration action.

```ts
const calls = f.manager.loadCalls()
await calls
assert.equal(f.manager.callsResult?.outcome, 'failed')
```

Run: `npx tsx --test plugins/ai-memory/tests/controller.test.ts`
Expected: FAIL until the controller rename is implemented.

- [ ] **Step 2: Implement the controller and tab**

Rename `diagnosticsResult` to `callsResult` and `loadDiagnostics()` to `loadCalls()`. Add `calls` to `Index.vue`'s tab union and radio group. Render `<MemoryCalls v-else-if="tab === 'calls'" />`; keep connect and maintenance rendering unchanged.

Create `MemoryCalls.vue` with an `el-scrollbar`, explanation that records are in-memory and cleared on exit, a refresh button calling `MemoryManager.loadCalls()`, and an `el-table` using reversed `callsResult.data`. Columns show time, operation, client, outcome, duration and hits. An expand column presents formatted JSON for `row.request` and `row.response`; no memory content is fetched or reconstructed.

```vue
<el-table-column type="expand">
  <template #default="{ row }">
    <pre class="memory-call-detail">{{ JSON.stringify({ request: row.request, response: row.response }, null, 2) }}</pre>
  </template>
</el-table-column>
```

Load once when the component mounts. Remove the old diagnostics section from `MemorySetup.vue` and its mount-time diagnostics load. Add English and Chinese labels for `calls`, `callsHelp`, `duration`, `request`, and `response`; remove unused old diagnostics labels.

- [ ] **Step 3: Run controller and presentation tests**

Run: `npx tsx --test plugins/ai-memory/tests/controller.test.ts plugins/ai-memory/tests/presentation.test.ts plugins/ai-memory/tests/renderer-ipc.test.ts`
Expected: PASS with no remaining `diagnosticsResult` or `loadDiagnostics` references.

- [ ] **Step 4: Commit when git commits are explicitly requested**

```bash
git add plugins/ai-memory/render plugins/ai-memory/lang plugins/ai-memory/tests/controller.test.ts
git commit -m "feat: add AI memory call records tab"
```

### Task 4: Integrated verification

**Files:**
- Modify only if required by existing smoke selectors: `test/fixtures/ai-memory-app-smoke-host.ts`
- Review: `docs/skills/flyenv-failure-boundaries/SKILL.md`

- [ ] **Step 1: Run static checks**

Run ESLint on every changed TypeScript and Vue file and run `git diff --check`. Expected: no errors. Search for stale `diagnosticsResult`, `loadDiagnostics`, and old diagnostics UI references; only the internal IPC name `plugin:diagnostics` may remain.

- [ ] **Step 2: Run the complete focused suite and plugin build**

```bash
npx tsx --test test/plugin-mcp-audit.test.ts test/plugin-mcp-registry.test.ts test/mcp-http-stop.test.ts plugins/ai-memory/tests/*.test.ts
yarn test:renderer-operation-boundaries
yarn plugin:test ai-memory
```

Expected: all tests pass and the production plugin contract succeeds.

- [ ] **Step 3: Exercise real MCP calls and inspect both logs**

Run the existing AI Memory app smoke/acceptance path against the modified host, or perform a real `flyenv_memory_search` through a configured FlyEnv MCP client. Confirm the simplified file row exists without queries/summary/content and the calls tab shows the same search with queries, filters, hit summaries and no content. Verify a no-hit query has `queries` plus `hit_count: 0` and a successful write retains its receipt metadata.

- [ ] **Step 4: Review failure boundaries and clean artifacts**

Re-read every added `try/catch`: file and memory logging are supplementary and cannot overwrite operation outcomes. Confirm no raw error strings or content fields enter either projection. Remove temporary smoke output created by this task and leave unrelated files untouched. `git status --short` should contain only intended source, test, spec and plan changes.
