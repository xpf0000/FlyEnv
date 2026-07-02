# MCP Create Site Default Auto SSL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make MCP `create_site` default to `useSSL: true` and `autoSSL: true` without changing FlyEnv UI manual site creation defaults.

**Architecture:** Keep the change isolated to the MCP-side site skeleton in `src/main/core/MCPTools.ts`. Prove the behavior with a regression test that inspects the host object sent to `host:handleHost`, then run the existing MCP regression suite and one live MCP call.

**Tech Stack:** TypeScript, tsx regression scripts, MCP HTTP transport, Electron main-process utilities.

---

### Task 1: Lock Down the Desired MCP Default Behavior

**Files:**
- Modify: `scripts/mcp-regression-test.ts`
- Test: `scripts/mcp-regression-test.ts`

- [ ] **Step 1: Write the failing test**

Add assertions inside `testCreateSiteMirrorsUiFollowUpActions()` that inspect the first `host:handleHost` call and require:

```ts
assert.equal(forkManager.calls[0]?.module, 'host')
assert.equal(forkManager.calls[0]?.fn, 'handleHost')
assert.equal(forkManager.calls[0]?.args[0]?.useSSL, true)
assert.equal(forkManager.calls[0]?.args[0]?.autoSSL, true)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/mcp-regression-test.ts`
Expected: FAIL because MCP currently builds the default host with `useSSL: false` and `autoSSL: false`.

- [ ] **Step 3: Write minimal implementation**

Change the MCP-only default host skeleton in `src/main/core/MCPTools.ts`:

```ts
useSSL: true,
autoSSL: true,
```

Do not change UI-side site editor defaults.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/mcp-regression-test.ts`
Expected: PASS with the new assertions and no regression in existing MCP tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/mcp-regression-test.ts src/main/core/MCPTools.ts
git commit -m "fix: default MCP site creation to auto SSL"
```

### Task 2: Verify Real MCP Behavior

**Files:**
- Modify: `none`
- Test: `scripts/mcp-regression-test.ts`

- [ ] **Step 1: Run focused regression verification**

Run: `npx tsx scripts/mcp-regression-test.ts`
Expected: PASS

- [ ] **Step 2: Run a live MCP create_site call**

Run a small MCP client script against `http://127.0.0.1:7682` with the current bearer token and call:

```json
{
  "name": "create_site",
  "arguments": {
    "name": "flyenv-mcp-autossl-check.test",
    "root": "F:\\www\\flyenv-mcp-autossl-check"
  }
}
```

Expected: returned site data includes:

```json
{
  "useSSL": true,
  "autoSSL": true
}
```

- [ ] **Step 3: Clean up the live verification site if needed**

Call:

```json
{
  "name": "delete_site",
  "arguments": {
    "siteName": "flyenv-mcp-autossl-check.test"
  }
}
```

Expected: site removed from MCP `list_sites`.

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "test: verify MCP create_site auto SSL defaults"
```
