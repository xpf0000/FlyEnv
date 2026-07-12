# Caddy Vhost ID Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent Caddy startup from recreating legacy name-based vhost files after the ID migration.

**Architecture:** Reuse the existing `makeCaddyConf()` ID-based generator from the Caddy startup repair path. Once the ID config exists, remove only the known host's legacy config and log paths so already-migrated installations self-heal.

**Tech Stack:** TypeScript, Node.js assertions, tsx, Electron fork modules

---

### Task 1: Add the regression check

**Files:**

- Create: `scripts/caddy-vhost-id-repair-test.ts`
- Modify: `package.json`

- [ ] Add assertions proving the startup repair imports and calls `makeCaddyConf`, uses `vhostName(host)`, removes legacy config and log paths, and does not retain the duplicated name-based generator.
- [ ] Add `test:caddy-vhost-id-repair` to `package.json`.
- [ ] Run `yarn test:caddy-vhost-id-repair` and confirm it fails against the current legacy implementation.

### Task 2: Repair the Caddy startup path

**Files:**

- Modify: `src/fork/module/Caddy/index.ts:68-136`

- [ ] Replace the duplicated template generator with an ID-path existence check followed by `makeCaddyConf(host)`.
- [ ] Remove the exact `${host.name}.conf` and `${host.name}.caddy.log` legacy paths after the ID config exists.
- [ ] Guard legacy deletion when a legacy path equals its corresponding ID path.
- [ ] Run `yarn test:caddy-vhost-id-repair` and confirm it passes.

### Task 3: Verify the change

**Files:**

- Test: `scripts/caddy-vhost-id-repair-test.ts`
- Test: `src/fork/module/Caddy/index.ts`

- [ ] Run the regression script again from a clean command invocation.
- [ ] Run ESLint on the changed TypeScript files.
- [ ] Inspect `git diff` and confirm no runtime vhost files or unrelated user changes were modified.
