# Windows NVM and Tray Issues Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix FlyEnv issues #831 and #583 without changing non-Windows NVM/FNM behavior.

**Architecture:** The Windows Node fork owns the policy that external Node version managers are unsupported, while the renderer reflects that policy by hiding both selectors and avoiding eager manager fetches. TrayManager owns event routing, so only its modern right-click listener opens the popup.

**Tech Stack:** Electron TrayManager, Vue 3 renderer, TypeScript source-level regression script.

---

### Task 1: Add regression assertions

**Files:**

- Create: `scripts/node-tray-issues-test.ts`

- [x] Assert the Windows Node fork guards NVM/FNM detection/version enumeration and installed-version scanning.
- [x] Assert the renderer hides both selectors on Windows and does not eagerly fetch either manager there.
- [x] Assert TrayManager registers `handleTrayClick` only for `right-click`.

### Task 2: Apply Windows NVM policy

**Files:**

- Modify: `src/fork/module/Node.win/index.ts`
- Modify: `src/render/components/Nodejs/node.ts`
- Modify: `src/render/components/Nodejs/setup.ts`
- Modify: `src/render/components/Nodejs/List.vue`
- Modify: `src/render/components/Nodejs/nvm/setup.ts`

- [x] Return an empty unsupported result before invoking any NVM/FNM executable on Windows.
- [x] Exclude NVM/FNM from Windows startup installed-version discovery and tool checks.
- [x] Hide both selectors, normalize stale persisted selections, and skip eager Windows manager fetches.

### Task 3: Correct modern tray event routing

**Files:**

- Modify: `src/main/ui/TrayManager.ts`

- [x] Keep the custom popup on `right-click` only and retain the existing double-click main-window action.

### Task 4: Verify

- [x] Run `npx tsx scripts/node-tray-issues-test.ts`.
- [x] Run TypeScript validation; the repository-wide check still reports unrelated pre-existing errors.
