# MCP Update Site UI Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make MCP `update_site` support the same editable site fields that FlyEnv UI already supports, while keeping the existing fork edit path unchanged.

**Architecture:** Extend the MCP main-process schema and patch-merging layer so it accepts the same practical edit fields as the UI editors. Keep the final write path unchanged: build the updated host in `MCPTools`, then call `host.handleHost(..., 'edit', old)` and reuse the existing finalize/reload/hosts/UI notification chain.

**Tech Stack:** TypeScript, Electron main process, tsx regression scripts, MCP HTTP transport.

---

### Task 1: Lock Down the Missing MCP Update Behavior

**Files:**
- Modify: `scripts/mcp-regression-test.ts`
- Test: `scripts/mcp-regression-test.ts`

- [ ] **Step 1: Write the failing regression test**

Add a new regression test that creates an old site object, runs:

```ts
await tools.updateSite('old.test', {
  name: 'https://new.test:8443',
  mark: 'renamed by mcp',
  reverseProxy: [{ path: '/', url: 'http://127.0.0.1:3000' }],
  port: {
    frankenphp: 8080,
    frankenphp_ssl: 8443,
    tomcat: 9090,
    tomcat_ssl: 9443
  }
})
```

and asserts the `host:handleHost` call receives:

```ts
assert.equal(forkManager.calls[1]?.module, 'host')
assert.equal(forkManager.calls[1]?.fn, 'handleHost')
assert.equal(forkManager.calls[1]?.args[0]?.name, 'new.test')
assert.equal(forkManager.calls[1]?.args[0]?.mark, 'renamed by mcp')
assert.deepEqual(forkManager.calls[1]?.args[0]?.reverseProxy, [
  { path: '/', url: 'http://127.0.0.1:3000' }
])
assert.equal(forkManager.calls[1]?.args[0]?.port?.frankenphp, 8080)
assert.equal(forkManager.calls[1]?.args[0]?.port?.frankenphp_ssl, 8443)
assert.equal(forkManager.calls[1]?.args[0]?.port?.tomcat, 9090)
assert.equal(forkManager.calls[1]?.args[0]?.port?.tomcat_ssl, 9443)
```

- [ ] **Step 2: Run the regression test to verify it fails**

Run: `npx tsx scripts/mcp-regression-test.ts`

Expected: FAIL because MCP currently drops `name` and some UI-editable fields before calling fork.

- [ ] **Step 3: Commit the failing test checkpoint only if your workflow requires it**

```bash
git add scripts/mcp-regression-test.ts
git commit -m "test: cover MCP update_site UI parity gaps"
```

### Task 2: Extend MCP Update Schema and Patch Merging

**Files:**
- Modify: `src/main/core/MCPServer.ts`
- Modify: `src/main/core/MCPTools.ts`
- Test: `scripts/mcp-regression-test.ts`

- [ ] **Step 1: Expand the `update_site` schema in `MCPServer.ts`**

Update the schema to accept these additional fields:

```ts
name: { type: 'string' },
mark: { type: 'string' },
reverseProxy: { type: 'array' },
port: {
  type: 'object',
  properties: {
    nginx: { type: 'number' },
    nginx_ssl: { type: 'number' },
    apache: { type: 'number' },
    apache_ssl: { type: 'number' },
    caddy: { type: 'number' },
    caddy_ssl: { type: 'number' },
    frankenphp: { type: 'number' },
    frankenphp_ssl: { type: 'number' },
    tomcat: { type: 'number' },
    tomcat_ssl: { type: 'number' }
  }
}
```

- [ ] **Step 2: Add hostname normalization and whitelist support in `MCPTools.ts`**

Implement a small helper equivalent to the UI save logic:

```ts
function normalizeSiteName(name: string): string {
  return new URL(name.includes('http') ? name : `https://${name}`).hostname
}
```

Then:

- allow `name` and `mark` in the patch whitelist
- normalize `patch.name` before merging
- keep nested object merging for `ssl`, `port`, and `nginx`

- [ ] **Step 3: Run the regression test to verify it passes**

Run: `npx tsx scripts/mcp-regression-test.ts`

Expected: PASS with the new `update_site` assertions and no breakage to the existing site-mutation regression coverage.

- [ ] **Step 4: Run the renderer sync regression**

Run: `npx tsx scripts/mcp-render-status-sync-test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/core/MCPServer.ts src/main/core/MCPTools.ts scripts/mcp-regression-test.ts
git commit -m "fix: align MCP update_site with UI editing"
```

### Task 3: Verify the Real MCP Rename/Edit Flow

**Files:**
- Modify: `none`
- Test: `scripts/mcp-regression-test.ts`

- [ ] **Step 1: Prepare a real test site**

Create a small static root such as:

```text
F:\www\mcp-update-site-ui-parity
```

with an `index.html` file for manual inspection.

- [ ] **Step 2: Create the original site via MCP**

Call:

```json
{
  "name": "create_site",
  "arguments": {
    "name": "mcp-ui-parity-old.test",
    "root": "F:\\www\\mcp-update-site-ui-parity",
    "useSSL": false,
    "autoSSL": false
  }
}
```

- [ ] **Step 3: Rename and edit the site via MCP**

Call:

```json
{
  "name": "update_site",
  "arguments": {
    "siteName": "mcp-ui-parity-old.test",
    "name": "https://mcp-ui-parity-new.test:8443",
    "mark": "updated through MCP",
    "useSSL": true,
    "autoSSL": true,
    "reverseProxy": [
      { "path": "/", "url": "http://127.0.0.1:3000" }
    ]
  }
}
```

Expected:

- `list_sites` no longer shows `mcp-ui-parity-old.test`
- `list_sites` shows `mcp-ui-parity-new.test`
- site record includes the new `mark`, `useSSL`, `autoSSL`, and `reverseProxy`

- [ ] **Step 4: Verify hosts and cleanup**

Check that the system `hosts` file contains `mcp-ui-parity-new.test`, then call:

```json
{
  "name": "delete_site",
  "arguments": {
    "siteName": "mcp-ui-parity-new.test"
  }
}
```

Expected: cleanup succeeds and `list_sites` confirms the site is gone.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "test: verify MCP update_site UI parity flow"
```
