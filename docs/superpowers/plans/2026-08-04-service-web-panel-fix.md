# Service Web Panel Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the missing Consul Web UI entry and make MinIO and R-Nacos Web UI startup/opening honor valid, configurable addresses.

**Architecture:** Add small pure address/config helpers under `src/shared/ServiceWebAddress.ts`, used by both fork startup code and renderer URL actions. Keep module-specific UI behavior in each module's existing `Index.vue` and fork file. Verify pure parsing behavior with a focused `tsx` script plus source-level assertions for the Vue entry points.

**Tech Stack:** TypeScript, Vue 3 SFCs, Electron `shell.openExternal`, Node `child_process.spawn`, `tsx`, Node `assert/strict`.

---

### Task 1: Shared address parsing helpers and red tests

**Files:**
- Create: `scripts/service-web-panel-test.ts`
- Create: `src/shared/ServiceWebAddress.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/service-web-panel-test.ts` with real assertions for the desired pure behavior:

```ts
import assert from 'node:assert/strict'
import {
  httpUrlFromAddress,
  normalizeListenAddress,
  parsePort,
  readConfigValue,
  unquoteConfigValue
} from '../src/shared/ServiceWebAddress'

assert.equal(unquoteConfigValue('"9015"'), '9015')
assert.equal(unquoteConfigValue("'9015'"), '9015')
assert.equal(unquoteConfigValue('  :9015  '), ':9015')
assert.equal(readConfigValue('MINIO_ADDRESS=:9000\nMINIO_CONSOLE_ADDRESS="9015"', 'MINIO_CONSOLE_ADDRESS'), '9015')
assert.equal(readConfigValue('MINIO_ADDRESS=:9000', 'MINIO_CONSOLE_ADDRESS'), '')
assert.equal(normalizeListenAddress('9015'), '127.0.0.1:9015')
assert.equal(normalizeListenAddress(':9015'), ':9015')
assert.equal(normalizeListenAddress('127.0.0.1:9015'), '127.0.0.1:9015')
assert.equal(normalizeListenAddress('bad', '127.0.0.1:9001'), '127.0.0.1:9001')
assert.equal(parsePort('"10999"', 10848), 10999)
assert.equal(parsePort('0', 10848), 10848)
assert.equal(parsePort('not-a-port', 10848), 10848)
assert.equal(httpUrlFromAddress(':9015', '127.0.0.1:9001', '/'), 'http://127.0.0.1:9015/')

console.log('service web panel tests passed')
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn tsx scripts/service-web-panel-test.ts`

Expected: FAIL because `src/shared/ServiceWebAddress.ts` does not exist yet.

- [ ] **Step 3: Implement the minimal shared helper**

Create `src/shared/ServiceWebAddress.ts` with these contracts:

```ts
const validPort = (value: number) => Number.isInteger(value) && value > 0 && value <= 65535

export function unquoteConfigValue(value: string): string {
  const trimmed = value.trim()
  const first = trimmed[0]
  const last = trimmed[trimmed.length - 1]
  return trimmed.length >= 2 && (first === '"' || first === "'") && first === last
    ? trimmed.slice(1, -1).trim()
    : trimmed
}

export function readConfigValue(content: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = content.match(new RegExp(`^\\s*${escaped}\\s*=\\s*(.*?)\\s*$`, 'm'))
  return match ? unquoteConfigValue(match[1]) : ''
}

export function parsePort(value: string, fallback: number): number {
  const parsed = Number(unquoteConfigValue(value))
  return validPort(parsed) ? parsed : fallback
}

export function normalizeListenAddress(value: string, fallback = '127.0.0.1:9001'): string {
  const normalized = unquoteConfigValue(value)
  if (/^\\d+$/.test(normalized)) return `127.0.0.1:${normalized}`
  const match = normalized.match(/^(?:[^:\\s]+|\\[[^\\]]+\\]):(\\d+)$/) ?? normalized.match(/^:(\\d+)$/)
  if (match && validPort(Number(match[1]))) return normalized
  return fallback
}

export function httpUrlFromAddress(value: string, fallback: string, path = '/'): string {
  const address = normalizeListenAddress(value, fallback)
  return `http://${address.startsWith(':') ? `127.0.0.1${address}` : address}${path}`
}
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `yarn tsx scripts/service-web-panel-test.ts`

Expected: `service web panel tests passed`.

- [ ] **Step 5: Commit the shared helper and test scaffold**

Run:

```bash
git add src/shared/ServiceWebAddress.ts scripts/service-web-panel-test.ts
git commit -m "test: add service web address coverage"
```

### Task 2: Add the Consul Web UI entry

**Files:**
- Modify: `src/render/components/Consul/Index.vue`
- Modify: `scripts/service-web-panel-test.ts`

- [ ] **Step 1: Strengthen the failing source assertions**

Extend `scripts/service-web-panel-test.ts` to read `src/render/components/Consul/Index.vue` and require the page to render an HTTP button only while running, import the filesystem helper, read the generated versioned JSON config, and open a URL ending in `/ui/`.

Add `readFileSync` from `node:fs` and `join` from `node:path` to the imports, then add these assertions after the helper assertions:

```ts
const root = join(import.meta.dirname, '..')
const consulPage = readFileSync(join(root, 'src/render/components/Consul/Index.vue'), 'utf8')
assert.match(consulPage, /<template v-if="isRunning" #tool-left>/)
assert.match(consulPage, /openConsulUI/)
assert.match(consulPage, /ports\?\.http/)
assert.match(consulPage, /shell\.openExternal\(`http:\/\/127\.0\.0\.1:\$\{port\}\/ui\/`\)/)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn tsx scripts/service-web-panel-test.ts`

Expected: FAIL because the current Consul page has only the data-directory tool and no `openConsulUI` action.

- [ ] **Step 3: Implement the minimal renderer change**

Add a `#tool-left` button alongside the existing data-directory control. Track `isRunning` using the current Consul installed versions, read `consul-${major}.json` through `fs.readFile`, parse `ports.http` when present (default `8500`), and call `shell.openExternal(`http://127.0.0.1:${port}/ui/`)`.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `yarn tsx scripts/service-web-panel-test.ts`

Expected: `service web panel tests passed`.

- [ ] **Step 5: Commit the Consul entry**

Run: `git add src/render/components/Consul/Index.vue scripts/service-web-panel-test.ts && git commit -m "feat: add Consul web UI entry"`

### Task 3: Normalize MinIO configuration and open its Console

**Files:**
- Modify: `src/fork/module/Minio/index.ts`
- Modify: `src/render/components/Minio/Index.vue`
- Modify: `scripts/service-web-panel-test.ts`

- [ ] **Step 1: Add failing MinIO assertions**

Assert that fork startup uses `readConfigValue`/`normalizeListenAddress` for `MINIO_CONSOLE_ADDRESS`, that the renderer reads `MINIO_CONSOLE_ADDRESS` rather than `MINIO_ADDRESS`, and that its browser action calls `httpUrlFromAddress`.

Add these assertions:

```ts
const minioFork = readFileSync(join(root, 'src/fork/module/Minio/index.ts'), 'utf8')
const minioPage = readFileSync(join(root, 'src/render/components/Minio/Index.vue'), 'utf8')
assert.match(minioFork, /readConfigValue/)
assert.match(minioFork, /normalizeListenAddress\(console_address/)
assert.match(minioPage, /readConfigValue\(content, 'MINIO_CONSOLE_ADDRESS'\)/)
assert.match(minioPage, /httpUrlFromAddress/)
assert.doesNotMatch(minioPage, /find\(\(s: string\) => s\.includes\('MINIO_ADDRESS'\)\)/)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn tsx scripts/service-web-panel-test.ts`

Expected: FAIL because the fork currently preserves quotes and the renderer currently reads `MINIO_ADDRESS` with a `9000` fallback.

- [ ] **Step 3: Implement the minimal MinIO fix**

In the fork parser, use `readConfigValue` for every `MINIO_*` line so matching quotes are removed before populating `execEnv`; normalize only `MINIO_CONSOLE_ADDRESS` with the `127.0.0.1:9001` fallback before passing it to `--console-address`. Keep `MINIO_ADDRESS` behavior intact except for quote removal.

In the renderer, read `MINIO_CONSOLE_ADDRESS`, build the URL with `httpUrlFromAddress(value, '127.0.0.1:9001')`, and preserve the `/` path. This makes `9015`, `:9015`, and `127.0.0.1:9015` valid while avoiding the S3 API port.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `yarn tsx scripts/service-web-panel-test.ts`

Expected: `service web panel tests passed`.

- [ ] **Step 5: Commit the MinIO fix**

Run: `git add src/fork/module/Minio/index.ts src/render/components/Minio/Index.vue scripts/service-web-panel-test.ts && git commit -m "fix: normalize MinIO console address"`

### Task 4: Make the R-Nacos console port configurable

**Files:**
- Modify: `src/render/components/Rnacos/Index.vue`
- Modify: `scripts/service-web-panel-test.ts`

- [ ] **Step 1: Add failing R-Nacos assertions**

Require the page to read `rnacos/rnacos.conf`, call `readConfigValue` and `parsePort` for `RNACOS_HTTP_CONSOLE_PORT`, and construct `http://127.0.0.1:${port}/rnacos/` instead of hardcoding `10848`.

Add these assertions:

```ts
const rnacosPage = readFileSync(join(root, 'src/render/components/Rnacos/Index.vue'), 'utf8')
assert.match(rnacosPage, /rnacos\/rnacos\.conf/)
assert.match(rnacosPage, /readConfigValue\(content, 'RNACOS_HTTP_CONSOLE_PORT'\)/)
assert.match(rnacosPage, /parsePort/)
assert.doesNotMatch(rnacosPage, /127\.0\.0\.1:10848\/rnacos\//)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn tsx scripts/service-web-panel-test.ts`

Expected: FAIL because `openConsole` currently always opens `http://127.0.0.1:10848/rnacos/`.

- [ ] **Step 3: Implement the minimal renderer change**

Import `fs`, `join`, and the shared helpers. Make `openConsole` async, read `window.Server.BaseDir!/rnacos/rnacos.conf` when it exists, parse `RNACOS_HTTP_CONSOLE_PORT` with fallback `10848`, and open the existing `/rnacos/` path.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `yarn tsx scripts/service-web-panel-test.ts`

Expected: `service web panel tests passed`.

- [ ] **Step 5: Commit the R-Nacos fix**

Run: `git add src/render/components/Rnacos/Index.vue scripts/service-web-panel-test.ts && git commit -m "fix: honor R-Nacos console port"`

### Task 5: Full verification and handoff

**Files:**
- Verify: all files changed by Tasks 1–4

- [ ] **Step 1: Run focused regression coverage**

Run: `yarn tsx scripts/service-web-panel-test.ts`

Expected: `service web panel tests passed`.

- [ ] **Step 2: Run existing adjacent regression coverage**

Run: `yarn test:clickhouse-ch-ui`

Expected: `clickhouse CH-UI regression tests passed`.

- [ ] **Step 3: Run TypeScript validation**

Run: `yarn vue-tsc --noEmit`

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 4: Inspect the final diff and worktree**

Run: `git diff --check && git status --short && git diff master...HEAD --stat`

Expected: no whitespace errors, only the design/plan and implementation/test files are present on the feature branch, and no files under the user's external PhpWebStudy directory were modified.

- [ ] **Step 5: Commit any final test-only adjustment**

If the verification steps require a test correction, run the focused test again and commit only that correction with `git add` and `git commit -m "test: stabilize service web panel checks"`; otherwise leave the task commits unchanged.
