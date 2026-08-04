# Tomcat HTTPS Site URL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use correct HTTP or HTTPS URLs, including configured ports, for every Tomcat site link and QR code.

**Architecture:** Make Tomcat `siteName()` return the complete URL using the standard Hosts certificate and port rule. The click action and QR popover directly reuse that value.

**Tech Stack:** Vue 3 SFCs, TypeScript, Node `assert/strict`, `tsx`.

---

### Task 1: Strengthen the Host QR URL regression test

**Files:**

- Modify: `scripts/host-qrcode-url-test.ts`

- [ ] **Step 1: Add failing Tomcat HTTPS assertions**

Replace the Tomcat QR assertion and add these checks:

```ts
assert.match(tomcatHostList, /<QrcodePopper :url="siteName\(scope\.row\)">/)
assert.match(tomcatHostList, /if \(item\.useSSL && item\.ssl\.cert && item\.ssl\.key\)/)
assert.match(tomcatHostList, /item\.port\?\.tomcat_ssl/)
assert.match(tomcatHostList, /return `https:\/\/\$\{host\}\$\{portStr\}`/)
assert.match(tomcatHostList, /const url = siteName\(item\)/)
assert.doesNotMatch(tomcatHostList, /`http:\/\/\$\{siteName\(scope\.row\)\}`/)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn tsx scripts/host-qrcode-url-test.ts`

Expected: FAIL because the Tomcat list still hard-codes HTTP for the QR code and browser action.

- [ ] **Step 3: Commit the red test**

```bash
git add scripts/host-qrcode-url-test.ts
git commit -m "test: cover Tomcat HTTPS site URLs"
```

### Task 2: Centralize complete Tomcat site URLs

**Files:**

- Modify: `src/render/components/Host/Tomcat/ListTable.vue:38,232-250`

- [ ] **Step 1: Make `siteName()` return a complete URL**

Use the standard Hosts eligibility rule: `item.useSSL && item.ssl.cert && item.ssl.key`. For eligible sites return `https://${host}${portStr}` using `item.port?.tomcat_ssl ?? 443`; otherwise return `http://${host}${portStr}` using `item.port?.tomcat ?? 80`. Omit port 443 or 80 respectively.

- [ ] **Step 2: Reuse the complete URL in both consumers**

```vue
<QrcodePopper :url="siteName(scope.row)">
```

```ts
const openSite = (item: AppHost) => {
  shell.openExternal(siteName(item))
}
```

- [ ] **Step 3: Run focused and adjacent coverage**

```bash
yarn tsx scripts/host-qrcode-url-test.ts
yarn tsx scripts/tomcat-server-xml-test.ts
yarn tsx scripts/service-web-panel-test.ts
```

Expected: all scripts pass.

- [ ] **Step 4: Commit the implementation**

```bash
git diff --check
git add src/render/components/Host/Tomcat/ListTable.vue
git commit -m "fix: support HTTPS Tomcat site URLs"
```

### Task 3: Final verification

**Files:**

- Verify: `scripts/host-qrcode-url-test.ts`
- Verify: `src/render/components/Host/Tomcat/ListTable.vue`

- [ ] **Step 1: Run final regressions**

```bash
yarn tsx scripts/host-qrcode-url-test.ts
yarn tsx scripts/tomcat-server-xml-test.ts
yarn tsx scripts/service-web-panel-test.ts
yarn test:clickhouse-ch-ui
```

Expected: all scripts pass.

- [ ] **Step 2: Inspect final changes**

```bash
git diff --check
git status --short
git diff master...HEAD --stat
```

Expected: no whitespace errors and only the design, plan, Tomcat list, and QR regression test are changed.
