# MCP install_service Version Manager Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Version Manager static online rows reflect MCP/AI CLI `install_service` results immediately, without requiring a manual refresh.

**Architecture:** Keep the fix at the renderer shared-state boundary. `Module.applyInstalledVersions()` already rebuilds installed-version state after MCP notifications, so the implementation will extend that method to also resynchronize `module.static[*].installed` from the refreshed installed-version list. A focused regression script will exercise the same renderer code path directly.

**Tech Stack:** TypeScript, Vue 3 reactivity, Pinia, `tsx` script-based regression tests

---

### Task 1: Add a failing renderer regression test

**Files:**
- Create: `scripts/version-manager-static-installed-sync-test.ts`
- Read: `src/render/core/Module/Module.ts`
- Read: `src/render/core/Module/ModuleStaticItem.ts`
- Read: `src/render/store/app.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { reactive } from 'vue'
import { Module } from '../src/render/core/Module/Module'
import { ModuleStaticItem } from '../src/render/core/Module/ModuleStaticItem'

async function main() {
  setActivePinia(createPinia())

  const module = reactive(new Module())
  module.typeFlag = 'bun'

  module.static.push(
    reactive(
      new ModuleStaticItem({
        name: 'Bun-1.2.23',
        version: '1.2.23',
        bin: 'C:/FlyEnv/bun/1.2.23/bun.exe',
        appDir: 'C:/FlyEnv/bun/1.2.23',
        zip: 'C:/FlyEnv/cache/bun-1.2.23.zip',
        url: 'https://example.invalid/bun-1.2.23.zip',
        downloaded: true,
        installed: false
      })
    )
  )

  module.static.push(
    reactive(
      new ModuleStaticItem({
        name: 'Bun-1.2.22',
        version: '1.2.22',
        bin: 'C:/FlyEnv/bun/1.2.22/bun.exe',
        appDir: 'C:/FlyEnv/bun/1.2.22',
        zip: 'C:/FlyEnv/cache/bun-1.2.22.zip',
        url: 'https://example.invalid/bun-1.2.22.zip',
        downloaded: true,
        installed: false
      })
    )
  )

  await module.applyInstalledVersions([
    {
      typeFlag: 'bun',
      version: '1.2.23',
      bin: 'C:/FlyEnv/bun/1.2.23/bun.exe',
      path: 'C:/FlyEnv/bun/1.2.23',
      num: 102,
      enable: true,
      run: false,
      running: false
    }
  ] as any)

  assert.equal(module.static[0]?.installed, true)
  assert.equal(module.static[1]?.installed, false)
  console.log('version-manager-static-installed-sync-test: ok')
}

main().catch((error) => {
  console.error('version-manager-static-installed-sync-test: failed', error)
  process.exit(1)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/version-manager-static-installed-sync-test.ts`

Expected: FAIL on `assert.equal(module.static[0]?.installed, true)` because `applyInstalledVersions()` currently leaves static-row install flags stale.

- [ ] **Step 3: Commit the failing test**

```bash
git add scripts/version-manager-static-installed-sync-test.ts
git commit -m "test: cover version manager sync after MCP install"
```

### Task 2: Synchronize static online rows from refreshed installed versions

**Files:**
- Modify: `src/render/core/Module/Module.ts`
- Test: `scripts/version-manager-static-installed-sync-test.ts`
- Verify: `scripts/mcp-regression-test.ts`

- [ ] **Step 1: Add the minimal sync helper and wire it into `applyInstalledVersions()`**

```ts
const syncStaticInstalledFlags = (
  rows: Array<{ version?: string; bin?: string; installed?: boolean }>,
  installed: Array<{ version?: string | null; bin?: string }>
) => {
  const installedBins = new Set(installed.map((item) => item.bin).filter(Boolean))
  const installedVersions = new Set(
    installed.map((item) => item.version).filter((value): value is string => !!value)
  )

  rows.forEach((row) => {
    row.installed =
      (!!row.bin && installedBins.has(row.bin)) ||
      (!!row.version && installedVersions.has(row.version))
  })
}

// inside applyInstalledVersions(), after this.installed is rebuilt:
syncStaticInstalledFlags(this.static as any, this.installed)
```

- [ ] **Step 2: Run the new regression test to verify it passes**

Run: `npx tsx scripts/version-manager-static-installed-sync-test.ts`

Expected: PASS with `version-manager-static-installed-sync-test: ok`

- [ ] **Step 3: Run MCP regression coverage**

Run: `npx tsx scripts/mcp-regression-test.ts`

Expected: PASS with `mcp regression tests passed`

- [ ] **Step 4: Commit the fix**

```bash
git add src/render/core/Module/Module.ts scripts/version-manager-static-installed-sync-test.ts
git commit -m "fix: sync version manager after MCP installs"
```
