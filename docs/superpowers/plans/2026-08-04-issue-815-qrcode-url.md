# Issue 815 Host QR Code URL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encode complete, browser-navigable site URLs in the Hosts and Tomcat Hosts QR codes.

**Architecture:** Reuse each list's existing `siteName()` URL logic rather than changing the generic QR component. The standard Hosts table already returns a complete HTTP/HTTPS URL; the Tomcat table returns its host and configured port, so its QR call site adds the same `http://` prefix used by `openSite`.

**Tech Stack:** Vue 3 SFCs, TypeScript, Node `assert/strict`, `tsx`.

---

### Task 1: Add QR code URL regression coverage

**Files:**
- Create: `scripts/host-qrcode-url-test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/host-qrcode-url-test.ts` with source-level assertions that cover both QR call sites and protect against reintroducing a bare-domain argument:

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const hostList = readFileSync(join(root, 'src/render/components/Host/ListTable.vue'), 'utf8')
const tomcatHostList = readFileSync(
  join(root, 'src/render/components/Host/Tomcat/ListTable.vue'),
  'utf8'
)

assert.match(hostList, /<QrcodePopper :url="siteName\(scope\.row\)">/)
assert.match(tomcatHostList, /<QrcodePopper :url="`http:\/\/\$\{siteName\(scope\.row\)\}`">/)
assert.doesNotMatch(hostList, /<QrcodePopper :url="scope\.row\.name">/)
assert.doesNotMatch(tomcatHostList, /<QrcodePopper :url="scope\.row\.name">/)

console.log('host QR code URL regression tests passed')
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn tsx scripts/host-qrcode-url-test.ts`

Expected: FAIL because both tables currently pass `scope.row.name` to `QrcodePopper`.

- [ ] **Step 3: Commit the red test**

Run:

```bash
git add scripts/host-qrcode-url-test.ts
git commit -m "test: cover host QR code URLs"
```

### Task 2: Pass complete URLs to QR codes

**Files:**
- Modify: `src/render/components/Host/ListTable.vue:38`
- Modify: `src/render/components/Host/Tomcat/ListTable.vue:38`

- [ ] **Step 1: Update the standard Hosts QR code argument**

Replace the bare-name argument with the table's complete URL helper:

```vue
<QrcodePopper :url="siteName(scope.row)">
```

This preserves `https://` for valid SSL sites and any selected non-default service port.

- [ ] **Step 2: Update the Tomcat QR code argument**

Replace the bare-name argument with the same URL shape used by its `openSite` function:

```vue
<QrcodePopper :url="`http://${siteName(scope.row)}`">
```

`siteName()` supplies the configured Tomcat port, so a running site on port `8080` becomes `http://example.test:8080`.

- [ ] **Step 3: Run the focused test to verify it passes**

Run: `yarn tsx scripts/host-qrcode-url-test.ts`

Expected: `host QR code URL regression tests passed`.

- [ ] **Step 4: Run adjacent regression coverage**

Run:

```bash
yarn tsx scripts/tomcat-server-xml-test.ts
yarn tsx scripts/service-web-panel-test.ts
```

Expected: both scripts pass.

- [ ] **Step 5: Check formatting and commit**

Run:

```bash
git diff --check
git add src/render/components/Host/ListTable.vue src/render/components/Host/Tomcat/ListTable.vue
git commit -m "fix: encode full host URLs in QR codes"
```

### Task 3: Final verification

**Files:**
- Verify: `scripts/host-qrcode-url-test.ts`
- Verify: `src/render/components/Host/ListTable.vue`
- Verify: `src/render/components/Host/Tomcat/ListTable.vue`

- [ ] **Step 1: Run all focused regressions**

Run:

```bash
yarn tsx scripts/host-qrcode-url-test.ts
yarn tsx scripts/tomcat-server-xml-test.ts
yarn tsx scripts/service-web-panel-test.ts
yarn test:clickhouse-ch-ui
```

Expected: every command passes.

- [ ] **Step 2: Run TypeScript validation**

Run: `yarn vue-tsc --noEmit`

Expected: if unrelated existing errors remain, the output contains no errors for either Host list or `host-qrcode-url-test.ts`; report those baseline errors separately.

- [ ] **Step 3: Inspect the final changes**

Run:

```bash
git diff --check
git status --short
git diff master...HEAD --stat
```

Expected: no whitespace errors; only the design, plan, two Host list files, and QR regression test are changed.
