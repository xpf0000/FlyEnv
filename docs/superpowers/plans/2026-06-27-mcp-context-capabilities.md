# MCP Context Capabilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add five read-only MCP context tools that expose FlyEnv-managed site, service, database, URL, and managed-file facts in a stable agent-friendly shape.

**Architecture:** Keep MCP protocol wiring in `src/main/core/MCPServer.ts` and `src/main/core/MCPTools.ts`, but move aggregation and parsing into a new main-process resolver. Put reusable site/runtime and tool payload types in `src/shared` so the main process and tests share the same field contracts.

**Tech Stack:** TypeScript, Electron main process, existing FlyEnv fork modules, `ini`, Node `fs/path`, MCP SDK.

---

### Task 1: Add Red Tests For Context Parsing

**Files:**
- Create: `scripts/mcp-context-parser-test.ts`
- Test: `scripts/mcp-context-parser-test.ts`

- [ ] **Step 1: Write the failing parser tests**

```ts
import {
  parseMySqlStyleConfigText,
  parsePostgresqlConfigText,
  parseRedisConfigText
} from '../src/main/core/MCPContextResolver'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/mcp-context-parser-test.ts`
Expected: FAIL because `MCPContextResolver` and the exported parser helpers do not exist yet.

- [ ] **Step 3: Implement the minimal parser exports**

```ts
export function parseMySqlStyleConfigText(text: string) {}
export function parsePostgresqlConfigText(text: string) {}
export function parseRedisConfigText(text: string) {}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/mcp-context-parser-test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/mcp-context-parser-test.ts src/main/core/MCPContextResolver.ts
git commit -m "test: add mcp context parser coverage"
```

### Task 2: Add Red Tests For MCP Context Tool Behavior

**Files:**
- Create: `scripts/mcp-context-regression-test.ts`
- Modify: `src/main/core/MCPTools.ts`
- Test: `scripts/mcp-context-regression-test.ts`

- [ ] **Step 1: Write the failing tool regression tests**

```ts
const runtime = await tools.resolveSiteRuntime('demo.test')
const urls = await tools.resolveSiteUrls('demo.test')
const execInfo = await tools.getServiceExecInfo('php', '8.4.0')
const db = await tools.getDatabaseConnectionInfo('mysql', '8.4.0')
const files = await tools.getManagedFileMap({ scope: 'site', name: 'demo.test' })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/mcp-context-regression-test.ts`
Expected: FAIL because the new MCPTools methods and resolver are not implemented yet.

- [ ] **Step 3: Implement the minimal public MCPTools methods**

```ts
async resolveSiteRuntime(siteName: string) {}
async resolveSiteUrls(siteName: string) {}
async getServiceExecInfo(flag: string, version?: string) {}
async getDatabaseConnectionInfo(flag: string, version?: string) {}
async getManagedFileMap(input: GetManagedFileMapInput) {}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/mcp-context-regression-test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/mcp-context-regression-test.ts src/main/core/MCPTools.ts src/main/core/MCPContextResolver.ts
git commit -m "test: add mcp context regression coverage"
```

### Task 3: Add Shared Types And Site Runtime Helpers

**Files:**
- Create: `src/shared/mcpContext.ts`
- Create: `src/shared/siteRuntime.ts`
- Modify: `scripts/mcp-context-regression-test.ts`

- [ ] **Step 1: Write the failing type/helper usage in production code**

```ts
import type { GetManagedFileMapInput } from '@shared/mcpContext'
import { resolveSitePhpVersion, splitHostAliases } from '@shared/siteRuntime'
```

- [ ] **Step 2: Run the regression test to verify it fails**

Run: `npx tsx scripts/mcp-context-regression-test.ts`
Expected: FAIL because the new shared contracts/helpers are missing.

- [ ] **Step 3: Write minimal shared types and pure helpers**

```ts
export interface ManagedPathItem {
  name: string
  path: string
  exists: boolean
}
```

- [ ] **Step 4: Run the parser and regression tests**

Run: `npx tsx scripts/mcp-context-parser-test.ts`
Expected: PASS

Run: `npx tsx scripts/mcp-context-regression-test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/mcpContext.ts src/shared/siteRuntime.ts
git commit -m "refactor: add shared mcp context contracts"
```

### Task 4: Implement Main-Process Context Resolver

**Files:**
- Create: `src/main/core/MCPContextResolver.ts`
- Modify: `src/main/core/MCPTools.ts`
- Test: `scripts/mcp-context-parser-test.ts`
- Test: `scripts/mcp-context-regression-test.ts`

- [ ] **Step 1: Write the failing resolver integration**

```ts
this.contextResolver = new MCPContextResolver(forkManager, mcpConfig)
```

- [ ] **Step 2: Run tests to verify they fail for missing resolver behavior**

Run: `npx tsx scripts/mcp-context-regression-test.ts`
Expected: FAIL with missing or incomplete context field assertions.

- [ ] **Step 3: Implement minimal resolver behavior for all five tool payloads**

```ts
class MCPContextResolver {
  async resolveSiteRuntime(siteName: string) {}
  async resolveSiteUrls(siteName: string) {}
  async getServiceExecInfo(flag: string, version?: string) {}
  async getDatabaseConnectionInfo(flag: string, version?: string) {}
  async getManagedFileMap(input: GetManagedFileMapInput) {}
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx scripts/mcp-context-parser-test.ts`
Expected: PASS

Run: `npx tsx scripts/mcp-context-regression-test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/core/MCPContextResolver.ts src/main/core/MCPTools.ts
git commit -m "feat: add mcp context resolver"
```

### Task 5: Register The Five MCP Tools

**Files:**
- Modify: `src/main/core/MCPServer.ts`
- Modify: `src/main/core/MCPConfigManager.ts`
- Create: `scripts/mcp-context-smoke-test.ts`
- Test: `scripts/mcp-context-smoke-test.ts`

- [ ] **Step 1: Write the failing tool registration checks**

```ts
assert(toolNames.includes('get_database_connection_info'))
assert(toolNames.includes('resolve_site_runtime'))
assert(toolNames.includes('get_service_exec_info'))
assert(toolNames.includes('resolve_site_urls'))
assert(toolNames.includes('get_managed_file_map'))
```

- [ ] **Step 2: Run smoke test against a running MCP server to verify it fails**

Run: `npx tsx scripts/mcp-context-smoke-test.ts http://127.0.0.1:7682 <token>`
Expected: FAIL because the new tool names are not registered yet.

- [ ] **Step 3: Add schemas, handlers, and default-enabled entries**

```ts
name: 'get_database_connection_info'
name: 'resolve_site_runtime'
name: 'get_service_exec_info'
name: 'resolve_site_urls'
name: 'get_managed_file_map'
```

- [ ] **Step 4: Run all MCP context tests**

Run: `npx tsx scripts/mcp-context-parser-test.ts`
Expected: PASS

Run: `npx tsx scripts/mcp-context-regression-test.ts`
Expected: PASS

Run: `npx tsx scripts/mcp-context-smoke-test.ts http://127.0.0.1:7682 <token>`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/core/MCPServer.ts src/main/core/MCPConfigManager.ts scripts/mcp-context-smoke-test.ts
git commit -m "feat: register mcp context tools"
```
