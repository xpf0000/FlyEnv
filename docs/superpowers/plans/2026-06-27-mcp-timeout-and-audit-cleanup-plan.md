# MCP Timeout And Audit Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the MCP `git` timeout chain, make fork-side async failures reject instead of hanging, and regenerate a clean `audit.log` from fresh MCP verification runs.

**Architecture:** Lock the two bugs with separate regressions before changing implementation: a local `ForkPromise` rejection test and a live MCP full-services regression script. Then apply minimal fixes in `ForkPromise` and the `Git` fork module, rerun MCP smoke/diagnostic coverage, clear the audit log, and verify only fresh audit records remain.

**Tech Stack:** TypeScript, Node `assert`, `tsx`, MCP SDK client, Electron/FlyEnv live MCP server

---

## File Structure

| File | Responsibility |
|------|------|
| `src/shared/ForkPromise.ts` | Propagate sync and async executor failures to callers instead of leaving promises pending |
| `src/fork/module/Git/index.ts` | Expose the no-op version discovery methods expected by `Version.allInstalledVersions()` |
| `scripts/fork-promise-async-rejection-test.ts` | Fast local regression for async executor rejection behavior |
| `scripts/mcp-full-services-test.ts` | Live MCP regression for `service_status git`, all-flags `list_services`, and `flyenv://services` |
| `/Users/x/Library/PhpWebStudy/server/mcp/audit.log` | Audit artifact to clear and repopulate after fixes |

### Task 1: Lock `ForkPromise` Async Rejection Behavior

**Files:**
- Create: `scripts/fork-promise-async-rejection-test.ts`
- Modify: `src/shared/ForkPromise.ts`

- [ ] **Step 1: Write the failing regression script**

Create a small `tsx` script that fails fast if a rejected async executor leaves the outer promise pending:

```ts
import assert from 'node:assert/strict'
import { ForkPromise } from '../src/shared/ForkPromise'

async function main() {
  const result = await Promise.race([
    new ForkPromise(async () => {
      throw new Error('boom')
    }).then(
      () => 'resolved',
      (error) => `rejected:${error instanceof Error ? error.message : String(error)}`
    ),
    new Promise<string>((resolve) => setTimeout(() => resolve('timeout'), 200))
  ])

  assert.equal(result, 'rejected:boom')
  console.log('fork promise async rejection test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
```

- [ ] **Step 2: Run the script to confirm the current bug**

Run:

```bash
npx tsx scripts/fork-promise-async-rejection-test.ts
```

Expected:

- The script fails because the current `ForkPromise` implementation times out instead of rejecting with `boom`.

- [ ] **Step 3: Implement the minimal `ForkPromise` fix**

Update the constructor so both sync throws and async rejected promises hit the outer `reject`:

```ts
constructor(
  executor: (resolve: ResolveType<T>, reject: RejectType, on: OnType) => void | PromiseLike<void>
) {
  this.promise = new Promise<T>((resolve, reject) => {
    this.res = resolve
    this.rej = reject
    try {
      const maybePromise = executor(resolve, reject, (...args: any) => {
        if (!this?._cbOn) {
          this.onData.push(args)
        } else {
          this?._cbOn?.(...args)
        }
      })
      if (maybePromise && typeof (maybePromise as PromiseLike<void>).then === 'function') {
        Promise.resolve(maybePromise).catch(reject)
      }
    } catch (error) {
      reject(error)
    }
  })
}
```

- [ ] **Step 4: Re-run the regression**

Run:

```bash
npx tsx scripts/fork-promise-async-rejection-test.ts
```

Expected:

- Output includes `fork promise async rejection test passed`.

### Task 2: Lock and Fix the `git` MCP Timeout Chain

**Files:**
- Create: `scripts/mcp-full-services-test.ts`
- Modify: `src/fork/module/Git/index.ts`

- [ ] **Step 1: Write the live MCP regression script**

Create a dedicated live-service check that exercises the failing path directly:

```ts
import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { AppModuleEnum } from '../src/render/core/type'

const url = process.argv[2] || 'http://127.0.0.1:7682'
const token = process.argv[3]

function withTimeout<T>(label: string, promise: Promise<T>, timeoutMs = 5000) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout after ${timeoutMs}ms`)), timeoutMs)
    )
  ])
}

async function main() {
  assert(token, 'Usage: npx tsx scripts/mcp-full-services-test.ts <url> <token>')
  const fetchWithAuth = (target: any, init: any) => {
    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${token}`)
    return fetch(target, { ...(init || {}), headers })
  }

  const client = new Client({ name: 'flyenv-mcp-full-services-test', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(url), { fetch: fetchWithAuth })
  await client.connect(transport)

  try {
    const gitStatus = await withTimeout(
      'service_status git',
      client.callTool({ name: 'service_status', arguments: { flag: 'git' } })
    )
    assert.equal(gitStatus.isError, false)

    const allServices = await withTimeout(
      'list_services all flags',
      client.callTool({
        name: 'list_services',
        arguments: { flags: Object.values(AppModuleEnum) }
      })
    )
    assert.equal(allServices.isError, false)

    const resource = await withTimeout(
      'read_resource flyenv://services',
      client.readResource({ uri: 'flyenv://services' })
    )
    assert.equal(resource.contents?.[0]?.uri, 'flyenv://services')

    console.log('mcp full services test passed')
  } finally {
    await client.close().catch(() => {})
    await transport.close().catch(() => {})
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
```

- [ ] **Step 2: Run the live regression before fixing `Git`**

Run:

```bash
MCP_URL=http://127.0.0.1:7682
npx tsx scripts/mcp-full-services-test.ts "$MCP_URL" "$MCP_TOKEN"
```

Expected:

- The script fails on `service_status git`, `list_services`, or `read_resource flyenv://services`, proving the `git` path is still broken.

- [ ] **Step 3: Add the missing no-op version discovery methods**

Mirror the other non-service CLI modules by adding the two missing methods to `Git`:

```ts
fetchAllOnlineVersion() {
  return new ForkPromise(async (resolve) => {
    resolve([])
  })
}

allInstalledVersions() {
  return new ForkPromise(async (resolve) => {
    resolve([])
  })
}
```

Place them near `checkInstalled()` / `check()` so the module layout stays consistent with `Codex`, `Kimi`, and `OpenCode`.

- [ ] **Step 4: Re-run the live regression**

Run:

```bash
MCP_URL=http://127.0.0.1:7682
npx tsx scripts/mcp-full-services-test.ts "$MCP_URL" "$MCP_TOKEN"
```

Expected:

- Output includes `mcp full services test passed`.

### Task 3: Regenerate Audit Log From Fresh MCP Verification

**Files:**
- Reference: `scripts/mcp-smoke-test.ts`
- Reference: `scripts/mcp-diagnose-flags.ts`
- Reference: `scripts/mcp-full-services-test.ts`
- Reference: `/Users/x/Library/PhpWebStudy/server/mcp/audit.log`

- [ ] **Step 1: Clear the old audit artifact**

Run:

```bash
: > /Users/x/Library/PhpWebStudy/server/mcp/audit.log
```

Expected:

- The file exists and becomes empty without deleting the directory structure.

- [ ] **Step 2: Re-run the fresh MCP verification set**

Run:

```bash
MCP_URL=http://127.0.0.1:7682
npx tsx scripts/mcp-smoke-test.ts "$MCP_URL" "$MCP_TOKEN"
npx tsx scripts/mcp-diagnose-flags.ts "$MCP_URL" "$MCP_TOKEN"
npx tsx scripts/mcp-full-services-test.ts "$MCP_URL" "$MCP_TOKEN"
```

Expected:

- `mcp-smoke-test.ts` ends with `all checks passed`
- `mcp-diagnose-flags.ts` reports zero failed/timeout flags
- `mcp-full-services-test.ts` ends with `mcp full services test passed`

- [ ] **Step 3: Inspect the new audit log**

Run:

```bash
python3 - <<'PY'
import json
from collections import Counter
path = '/Users/x/Library/PhpWebStudy/server/mcp/audit.log'
entries = []
with open(path, 'r', encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if line:
            entries.append(json.loads(line))
print('total', len(entries))
print('failed', sum(1 for item in entries if not item.get('success')))
print('by_tool', Counter(item['tool'] for item in entries))
PY
```

Expected:

- The log contains only records from the fresh verification run.
- Successful `service_status`, `list_services`, and `read_resource` records are present.
- There are no new timeout-driven failures from the `git` path.
