# Tray Platform Click Behavior Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the modern tray popup right-click-only on Windows while restoring left- and right-click activation on macOS and Linux.

**Architecture:** `TrayManager` remains the sole owner of Electron `Tray` listener registration. It will conditionally add the left-click listener only outside Windows, while keeping the existing right-click and double-click event forwarding untouched. The existing lightweight Node regression script will inspect the source contract without booting Electron.

**Tech Stack:** TypeScript, Electron `Tray`, Node.js/tsx regression script, Yarn.

---

### Task 1: Define the platform listener contract in the regression script

**Files:**
- Modify: `scripts/node-tray-issues-test.ts:45-49`
- Test: `scripts/node-tray-issues-test.ts`

- [x] **Step 1: Replace the current right-click-only assertion with a failing platform-specific contract**

```ts
assert(
  /if \(!isWindows\(\)\) \{\s*this\.tray\.on\('click', this\.handleTrayClick\)\s*\}/.test(
    tray
  ) && /this\.tray\.on\('right-click', this\.handleTrayClick\)/.test(tray),
  'Modern tray popup must use right-click only on Windows and both mouse buttons elsewhere'
)
```

- [x] **Step 2: Run the regression test and verify that it fails because the non-Windows left-click registration is missing**

Run: `yarn test:node-tray-issues`

Expected: process exits non-zero with `Modern tray popup must use right-click only on Windows and both mouse buttons elsewhere`.

### Task 2: Restore non-Windows left-click registration

**Files:**
- Modify: `src/main/ui/TrayManager.ts:40-45`
- Test: `scripts/node-tray-issues-test.ts`

- [x] **Step 1: Add the minimal platform guard to `addModernStyleListener()`**

```ts
addModernStyleListener() {
  if (!isWindows()) {
    this.tray.on('click', this.handleTrayClick)
  }
  this.tray.on('right-click', this.handleTrayClick)
  this.tray.on('double-click', () => {
    this.emit('double-click')
  })
}
```

- [x] **Step 2: Run the targeted regression test and verify it passes**

Run: `yarn test:node-tray-issues`

Expected: process exits zero and prints `node/tray issue regression tests passed`.

- [x] **Step 3: Run TypeScript/lint-adjacent repository validation for the edited main-process source**

Run: `yarn eslint src/main/ui/TrayManager.ts scripts/node-tray-issues-test.ts`

Expected: process exits zero with no lint errors.

### Task 3: Review the scoped change

**Files:**
- Modify: `src/main/ui/TrayManager.ts`
- Modify: `scripts/node-tray-issues-test.ts`

- [x] **Step 1: Inspect the final diff and whitespace validation**

Run: `git diff --check && git diff -- src/main/ui/TrayManager.ts scripts/node-tray-issues-test.ts`

Expected: no whitespace errors; the production diff contains only the non-Windows `click` registration and the test describes the platform-specific contract.

- [x] **Step 2: Confirm the requirements against the final source**

Run: `rg -n -C 3 "addModernStyleListener|right-click|isWindows" src/main/ui/TrayManager.ts`

Expected: Windows does not register `click`; macOS/Linux do; all platforms retain `right-click` and `double-click` registration.
