# Web Panel Renderer Controllers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move pgAdmin, DbGate, and CH-UI renderer opening workflows into three module-local controller classes.

**Architecture:** Each controller is an exported singleton in its owning module directory. It owns its reactive opening state, IPC request, intermediate installation notice, terminal cleanup, URL launch, and user-facing error. The Vue pages retain only view-specific setup and bind directly to controller state and `open()`. The generic `WebPanelOpening` map is removed because there is no longer shared state ownership.

**Tech Stack:** Vue 3 refs, Electron renderer IPC, Element Plus messages, TypeScript contract scripts.

---

### Task 1: Lock the Renderer Ownership Contract

**Files:**

- Modify: `scripts/postgresql-pgadmin4-test.ts`
- Modify: `scripts/mongodb-dbgate-test.ts`
- Modify: `scripts/clickhouse-ch-ui-test.ts`
- Delete: `scripts/web-panel-opening-state-test.ts`
- Modify: `package.json`

- [x] **Step 1: Write failing renderer-controller assertions**

Require each existing contract test to find a module-local controller import and assert that the page no longer directly imports IPC, shell, Element Plus notices, or `WebPanelOpening`.

- [x] **Step 2: Run the contract scripts and verify failure**

Run: `tsx scripts/postgresql-pgadmin4-test.ts`, `tsx scripts/mongodb-dbgate-test.ts`, `tsx scripts/clickhouse-ch-ui-test.ts`

Expected: FAIL because the three controller files and page imports do not exist yet.

### Task 2: Implement Three Controller Classes

**Files:**

- Create: `src/render/components/PostgreSql/PgAdminPanel.ts`
- Create: `src/render/components/MongoDB/DbGatePanel.ts`
- Create: `src/render/components/ClickHouse/ChUiPanel.ts`
- Delete: `src/render/util/WebPanelOpening.ts`

- [x] **Step 1: Implement `PgAdminPanel`**

Own a `ref(false)`, obtain the running PostgreSQL and selected Python versions from `BrewStore`, initialize `PostgreSqlSetup`, resolve the active data directory, send `openPGAdmin`, retain loading for `code: 200`, display the first-install notice, and clear state only on `code: 0/1`.

- [x] **Step 2: Implement `DbGatePanel`**

Own a `ref(false)`, obtain the selected Node version from `BrewStore`, send sensitive `openDbGate`, retain loading for `code: 200`, display the first-install notice, and clear state only on `code: 0/1`.

- [x] **Step 3: Implement `ChUiPanel`**

Own a `ref(false)`, send `openCHUI`, retain loading for `code: 200`, and clear state only on `code: 0/1`.

### Task 3: Bind Pages to Controllers

**Files:**

- Modify: `src/render/components/PostgreSql/Index.vue`
- Modify: `src/render/components/MongoDB/Index.vue`
- Modify: `src/render/components/ClickHouse/Index.vue`

- [x] **Step 1: Replace page-local opening and IPC logic**

Import each module-local singleton, expose its `opening` ref to the template, and call its `open()` method. Remove direct IPC, shell, message, first-install notice, and generic opening-state dependencies from the pages.

- [x] **Step 2: Verify the full behavior set**

Run: `yarn test:postgresql-pgadmin4`, `yarn test:mongodb-dbgate`, `yarn test:clickhouse-ch-ui`, `node node_modules/typescript/bin/tsc --noEmit --pretty false`.

Expected: all commands exit with code 0.
