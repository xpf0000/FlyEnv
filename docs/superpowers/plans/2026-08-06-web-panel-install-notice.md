# Web Panel First-Install Notice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tell users when pgAdmin 4 or DbGate is being installed for the first time, keep the message visible during the long install, and automatically open the management panel after successful startup.

**Architecture:** The fork process emits a typed `code: 200` progress payload only when it detects a real first-time companion installation. Each renderer page recognizes that payload, shows a persistent Element Plus info message using localized text, closes it on terminal success or error, and preserves automatic URL opening.

**Tech Stack:** TypeScript, Electron fork IPC, Vue 3 `<script setup>`, Element Plus `ElMessage`, Vue I18n, existing focused contract tests.

---

### Task 1: Define and test the progress contract

**Files:**
- Create: `src/shared/WebPanelInstallNotice.ts`
- Modify: `scripts/postgresql-pgadmin4-test.ts`
- Modify: `scripts/mongodb-dbgate-test.ts`

- [ ] **Step 1: Write failing assertions.** Import the shared exports in both focused tests and assert:

```ts
assert.deepEqual(webPanelInstallNotice('pgAdmin 4'), {
  type: 'web-panel-install',
  service: 'pgAdmin 4'
})
assert.equal(isWebPanelInstallNotice(webPanelInstallNotice('DbGate')), true)
assert.equal(isWebPanelInstallNotice({ type: 'other', service: 'DbGate' }), false)
```

In the DbGate runtime test, pass an `on` callback to `runtime.open`, start with a missing entry script, and assert it receives the DbGate notice before the injected installer creates the entry.

- [ ] **Step 2: Run `yarn test:mongodb-dbgate` and `yarn test:postgresql-pgadmin4` and confirm the expected red failure for the missing module/behavior.**

- [ ] **Step 3: Create `src/shared/WebPanelInstallNotice.ts` with:**

```ts
export const WEB_PANEL_INSTALL_NOTICE = 'web-panel-install' as const

export type WebPanelInstallNotice = {
  type: typeof WEB_PANEL_INSTALL_NOTICE
  service: string
}

export const webPanelInstallNotice = (service: string): WebPanelInstallNotice => ({
  type: WEB_PANEL_INSTALL_NOTICE,
  service
})

export const isWebPanelInstallNotice = (value: unknown): value is WebPanelInstallNotice => {
  const notice = value as Partial<WebPanelInstallNotice> | undefined
  return notice?.type === WEB_PANEL_INSTALL_NOTICE && typeof notice.service === 'string'
}
```

- [ ] **Step 4: Re-run the two focused tests.** The shared assertions pass; the DbGate callback assertion remains red until Task 2.

### Task 2: Emit notices from actual first-install branches

**Files:**
- Modify: `src/fork/module/Postgresql/index.ts`
- Modify: `src/fork/module/DbGate/index.ts`
- Modify: `scripts/postgresql-pgadmin4-test.ts`
- Modify: `scripts/mongodb-dbgate-test.ts`

- [ ] **Step 1: Add failing source assertions** requiring `webPanelInstallNotice('pgAdmin 4')` in the PostgreSQL first-start branch and `webPanelInstallNotice('DbGate')` immediately before DbGate invokes its installer.

- [ ] **Step 2: Run both focused tests and confirm those assertions fail.**

- [ ] **Step 3: Import `webPanelInstallNotice` in PostgreSQL and call `on(webPanelInstallNotice('pgAdmin 4'))` after Python validation and before virtual-environment creation, guarded by `firstStart`.

- [ ] **Step 4: Import `webPanelInstallNotice` in DbGate and replace the installer one-liner with a block that calls `on(webPanelInstallNotice('DbGate'))`, then installs only when `paths.entry` is absent.** Reuse and health checks remain unchanged.

- [ ] **Step 5: Re-run both focused tests and confirm the captured DbGate event and PostgreSQL source assertion pass.**

### Task 3: Show and close a persistent renderer message

**Files:**
- Modify: `src/render/components/PostgreSql/Index.vue`
- Modify: `src/render/components/MongoDB/Index.vue`
- Modify: `scripts/postgresql-pgadmin4-test.ts`
- Modify: `scripts/mongodb-dbgate-test.ts`

- [ ] **Step 1: Add failing renderer assertions** requiring both pages to import `ElMessage` and `isWebPanelInstallNotice`, create a closeable install-message handle, render `base.webPanelFirstInstall` for `res.code === 200`, and close the handle before terminal success/error handling.

- [ ] **Step 2: Run both focused tests and confirm the new renderer assertions fail.**

- [ ] **Step 3: Add the PostgreSQL handler.** Keep `pgAdminOpening` unchanged; on a matching progress payload, replace any previous handle with:

```ts
ElMessage({
  message: I18nT('base.webPanelFirstInstall', { service: res.msg.service }),
  type: 'info',
  duration: 0,
  showClose: true
})
```

Return immediately for all `code: 200` messages. For terminal responses, close and clear the handle before existing `IPC.off`, state reset, automatic `shell.openExternal`, and error handling.

- [ ] **Step 4: Apply the same handler to MongoDB around its `IPC.sendSensitive` callback.** Preserve sensitive IPC and automatic URL opening.

- [ ] **Step 5: Re-run both focused tests and confirm the renderer assertions pass.**

### Task 4: Add localized copy

**Files:**
- Modify: `src/lang/zh/base.json`
- Modify: `src/lang/en/base.json`

- [ ] **Step 1: Add `webPanelFirstInstall` to both locales.** Chinese: `首次运行需要安装 {service}，安装过程可能耗时较久，请耐心等待。安装完成后将自动打开管理面板。` English: `{service} needs to be installed the first time it runs. This may take a while, so please be patient. The management panel will open automatically when installation is complete.`

- [ ] **Step 2: Run `yarn test:mongodb-dbgate`, `yarn test:postgresql-pgadmin4`, and `yarn test:language-assets`; expect all to pass.**

### Task 5: Verify and commit

**Files:** Verify all files from Tasks 1-4.

- [ ] **Step 1: Run focused and cross-module tests:**

```bash
yarn test:mongodb-dbgate
yarn test:postgresql-pgadmin4
node node_modules/tsx/dist/cli.mjs scripts/stop-process-list-cache-test.ts
node node_modules/tsx/dist/cli.mjs scripts/service-web-panel-test.ts
```

- [ ] **Step 2: Run `node node_modules/typescript/bin/tsc --noEmit --pretty false`, ESLint on all changed TypeScript/Vue files, Prettier checks on all changed code/locale files, and `git diff --check`.**

- [ ] **Step 3: Inspect the diff, stage only the intended files plus this plan, and commit with `feat: show first-install web panel notice`.** Leave unrelated `docs/task/clickhouse-demo/` untracked.
