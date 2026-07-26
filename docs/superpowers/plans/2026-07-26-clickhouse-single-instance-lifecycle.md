# ClickHouse Single-Instance Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ClickHouse version switches and stops update only the process and UI state that they actually own.

**Architecture:** Keep ClickHouse a single-instance service, but give each binary a stable PID path. A custom ClickHouse lifecycle uses a fresh process list and the selected binary path for direct stops; version switching explicitly performs the only permitted module-wide shutdown. The main-process registry will remove stopped PIDs before registering the replacement so the renderer never observes two single-instance versions as running.

**Tech Stack:** Electron main/fork processes, TypeScript, Vue renderer IPC status synchronisation, Node assert regression scripts.

---

## File structure

| File | Responsibility |
| --- | --- |
| src/fork/module/ClickHouse/lifecycle.ts | Pure, stable version-PID path derivation from a ClickHouse binary path. |
| src/fork/module/ClickHouse/index.ts | Custom single-instance start/stop ownership rules for ClickHouse. |
| src/main/core/IPCHandler.ts | Applies stopped PIDs before a replacement start PID is registered. |
| scripts/clickhouse-service-lifecycle-test.ts | Regression coverage for PID isolation and ClickHouse lifecycle ownership boundaries. |
| scripts/mcp-render-status-sync-test.ts | Regression coverage for main-process lifecycle update ordering. |
| package.json | Adds the focused ClickHouse lifecycle test command. |

### Task 1: Add a tested, deterministic ClickHouse version PID path

**Files:**

- Create: src/fork/module/ClickHouse/lifecycle.ts
- Create: scripts/clickhouse-service-lifecycle-test.ts
- Modify: package.json:16-18

- [ ] **Step 1: Write the failing PID-isolation regression test**

Create scripts/clickhouse-service-lifecycle-test.ts with this initial content:

~~~ts
import assert from 'node:assert/strict'
import { clickHouseVersionPidFile } from '../src/fork/module/ClickHouse/lifecycle'

const baseDir = '/tmp/flyenv'
const versionA = '/tmp/flyenv/app/clickhouse-25.8/clickhouse'
const versionB = '/tmp/flyenv/app/clickhouse-26.1/clickhouse'

const pidA = clickHouseVersionPidFile(baseDir, versionA)
const pidB = clickHouseVersionPidFile(baseDir, versionB)

assert.match(pidA, /^\/tmp\/flyenv\/pid\/clickhouse-[a-f0-9]{32}\.pid$/)
assert.notEqual(pidA, pidB, 'different ClickHouse binaries must never share a PID file')
assert.equal(
  clickHouseVersionPidFile(baseDir, versionA),
  pidA,
  'the same ClickHouse binary must always map to the same PID file'
)

console.log('clickhouse service lifecycle tests passed')
~~~

- [ ] **Step 2: Run the test and verify the expected failure**

Run: npx tsx scripts/clickhouse-service-lifecycle-test.ts

Expected: failure because ../src/fork/module/ClickHouse/lifecycle does not exist.

- [ ] **Step 3: Implement the minimal pure helper**

Create src/fork/module/ClickHouse/lifecycle.ts:

~~~ts
import { join } from 'node:path'
import { md5 } from '@shared/utils'

export function clickHouseVersionPidFile(baseDir: string, bin: string): string {
  return join(baseDir, 'pid', 'clickhouse-' + md5(bin) + '.pid')
}
~~~

Add this package script immediately after test:clickhouse-ch-ui:

~~~json
"test:clickhouse-service-lifecycle": "tsx scripts/clickhouse-service-lifecycle-test.ts",
~~~

- [ ] **Step 4: Run the focused test and verify it passes**

Run: yarn test:clickhouse-service-lifecycle

Expected: exit code 0 and clickhouse service lifecycle tests passed.

- [ ] **Step 5: Commit the helper and its regression test**

~~~bash
git add src/fork/module/ClickHouse/lifecycle.ts scripts/clickhouse-service-lifecycle-test.ts package.json
git commit -m "test: cover ClickHouse version PID isolation"
~~~

### Task 2: Make direct ClickHouse stops version-owned and switches explicitly module-wide

**Files:**

- Modify: scripts/clickhouse-service-lifecycle-test.ts
- Modify: src/fork/module/ClickHouse/index.ts:1-28,209-229,362-406

- [ ] **Step 1: Extend the regression test with lifecycle ownership assertions**

Append this code before the final console.log in scripts/clickhouse-service-lifecycle-test.ts:

~~~ts
import { readFileSync } from 'node:fs'

const source = readFileSync(
  new URL('../src/fork/module/ClickHouse/index.ts', import.meta.url),
  'utf8'
)
const directStopSource = source.slice(
  source.indexOf('_stopServer(version: SoftInstalled'),
  source.indexOf('private async _stopCHUI')
)

assert.match(source, /startService\(version: SoftInstalled, \.\.\.args: any\)/)
assert.match(source, /private _stopAllServers\(version: SoftInstalled, \.\.\.args: any\)/)
assert.match(source, /pidPath: this\.versionPidFile\(version\)/)
assert.match(directStopSource, /const plist = await ProcessListFetch\(\)/)
assert.match(
  directStopSource,
  /ProcessOwnedPidsByPid\(pid, plist, \[version\.bin\]\)/
)
assert.doesNotMatch(
  directStopSource,
  /super\._stopServer/,
  'stopping one version must not use Base\'s module-wide process search'
)
~~~

Move the node:fs import to the script import block after adding it.

- [ ] **Step 2: Run the test and verify the expected failure**

Run: yarn test:clickhouse-service-lifecycle

Expected: assertion failure because ClickHouse has no custom startService, has no _stopAllServers, and its current direct stop delegates to super._stopServer.

- [ ] **Step 3: Implement the version-owned lifecycle in the ClickHouse fork module**

Update imports in src/fork/module/ClickHouse/index.ts as follows:

~~~ts
import {
  AppLog,
  chmod,
  copyFile,
  execPromise,
  downloadFile,
  mkdirp,
  readFile,
  readdir,
  remove,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  writeFile,
} from '../../Fn'
import { isMacOS, isWindows } from '@shared/utils'
import { ProcessKill, ProcessListFetch, ProcessOwnedPidsByPid } from '@shared/Process'
import { clickHouseVersionPidFile } from './lifecycle'
~~~

Add these methods before _stopServer:

~~~ts
private versionPidFile(version: SoftInstalled): string {
  return clickHouseVersionPidFile(global.Server.BaseDir!, version.bin)
}

private async clearVersionPidFiles(): Promise<void> {
  const pidDir = join(global.Server.BaseDir!, 'pid')
  try {
    const files = await readdir(pidDir)
    await Promise.all(
      files
        .filter((file) => /^clickhouse-[a-f0-9]{32}\.pid$/.test(file))
        .map((file) => remove(join(pidDir, file)))
    )
  } catch {}
}

private _stopAllServers(version: SoftInstalled, ...args: any): ForkPromise<any> {
  return new ForkPromise(async (resolve, reject, on) => {
    let uiPids: string[] = []
    try {
      uiPids = await this._stopCHUI()
    } catch (error) {
      console.log('clickhouse stop CH-UI err: ', error)
    }
    try {
      const res: any = await super._stopServer(version, ...args).on(on)
      await this.clearVersionPidFiles()
      if (uiPids.length > 0) {
        res['APP-Service-Stop-PID'] = Array.from(
          new Set([...(res['APP-Service-Stop-PID'] ?? []), ...uiPids])
        )
      }
      resolve(res)
    } catch (error) {
      reject(error)
    }
  })
}

startService(version: SoftInstalled, ...args: any) {
  return new ForkPromise(async (resolve, reject, on) => {
    if (!isWindows() && !existsSync(version?.bin)) {
      reject(new Error(I18nT('fork.binNotFound')))
      return
    }
    if (!version?.version) {
      reject(new Error(I18nT('fork.versionNotFound')))
      return
    }
    try {
      this._linkVersion(version)
    } catch {}
    try {
      const stopped = await this._stopAllServers(version, ...args).on(on)
      await this.ensureAppPidDirWritable()
      const res: any = await this._startServer(version, ...args).on(on)
      if (stopped?.['APP-Service-Stop-PID']) {
        res['APP-Service-Stop-PID'] = stopped['APP-Service-Stop-PID']
      }
      resolve(res)
    } catch (error) {
      reject(error)
    }
  })
}
~~~

Replace the existing _stopServer wrapper with this direct, version-owned stop:

~~~ts
_stopServer(version: SoftInstalled) {
  return new ForkPromise(async (resolve, reject, on) => {
    on({
      'APP-On-Log': AppLog('info', I18nT('appLog.stopServiceBegin', { service: this.type }))
    })
    try {
      const plist = await ProcessListFetch()
      const pids = new Set<string>()
      const versionPid = await this.readPidFromFile(this.versionPidFile(version))
      const legacyPid = await this.readPidFromFile(this.appPidFile())
      for (const pid of [versionPid, legacyPid, '' + (version.pid ?? '')].filter(Boolean)) {
        ProcessOwnedPidsByPid(pid, plist, [version.bin]).forEach((ownedPid) => pids.add(ownedPid))
      }
      const arr = Array.from(pids)
      if (arr.length > 0) {
        await ProcessKill('-INT', arr).catch(() => {})
      }
      await remove(this.versionPidFile(version)).catch(() => {})
      if (legacyPid && ProcessOwnedPidsByPid(legacyPid, plist, [version.bin]).length > 0) {
        await remove(this.appPidFile()).catch(() => {})
      }
      if (arr.length > 0) {
        const uiPids = await this._stopCHUI().catch(() => [])
        arr.push(...uiPids)
      }
      on({ 'APP-Service-Stop-Success': true })
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.stopServiceEnd', { service: this.type }))
      })
      resolve({ 'APP-Service-Stop-PID': Array.from(new Set(arr)) })
    } catch (error) {
      reject(error)
    }
  })
}
~~~

Finally change _startServer so serviceStartSpawn receives:

~~~ts
pidPath: this.versionPidFile(version),
~~~

Do not call Base.saveAppPid from the ClickHouse override; the shared module PID file is intentionally retired after compatible legacy cleanup.

- [ ] **Step 4: Run focused lifecycle and existing ClickHouse regression tests**

Run: yarn test:clickhouse-service-lifecycle

Expected: exit code 0 and clickhouse service lifecycle tests passed.

Run: yarn test:clickhouse-config-page

Expected: exit code 0 and clickhouse config page regression tests passed.

Run: yarn test:clickhouse-ch-ui

Expected: exit code 0 and clickhouse CH-UI regression tests passed.

- [ ] **Step 5: Commit the ClickHouse lifecycle implementation**

~~~bash
git add src/fork/module/ClickHouse/index.ts scripts/clickhouse-service-lifecycle-test.ts
git commit -m "fix: isolate ClickHouse version lifecycle"
~~~

### Task 3: Publish replacement lifecycle state without an overlapping UI state

**Files:**

- Modify: scripts/mcp-render-status-sync-test.ts:97-112
- Modify: src/main/core/IPCHandler.ts:225-235

- [ ] **Step 1: Write the failing ordering assertion**

In scripts/mcp-render-status-sync-test.ts, after the existing assertions that both lifecycle calls precede the renderer response, add:

~~~ts
assert.ok(
  ipcHandlerSource.indexOf('ServiceProcessManager.delPid') <
    ipcHandlerSource.indexOf('ServiceProcessManager.addPid'),
  'replacement lifecycle updates must remove stopped instances before registering the new one'
)
~~~

- [ ] **Step 2: Run the test and verify the expected failure**

Run: npx tsx scripts/mcp-render-status-sync-test.ts

Expected: assertion failure because IPCHandler currently calls addPid before delPid.

- [ ] **Step 3: Update main-process lifecycle update order**

In src/main/core/IPCHandler.ts, move the existing stopped-PID block before the start-PID block, preserving its content exactly:

~~~ts
if (info?.data?.['APP-Service-Stop-PID']) {
  const arr: string[] = info.data['APP-Service-Stop-PID']
  ServiceProcessManager.delPid(module, arr)
}

if (info?.data?.['APP-Service-Start-PID']) {
  const item = info.data?.['APP-Service-Start-Item'] ?? args[1]
  ServiceProcessManager.addPid(module, info.data['APP-Service-Start-PID'], item)
}
~~~

This preserves the existing guarantee that both registry operations complete before the renderer receives the terminal lifecycle response, while ensuring a replacement cannot momentarily mark two single-instance versions as running.

- [ ] **Step 4: Run renderer-status regression coverage**

Run: npx tsx scripts/mcp-render-status-sync-test.ts

Expected: exit code 0 and mcp render status sync tests passed.

- [ ] **Step 5: Commit the lifecycle ordering fix**

~~~bash
git add src/main/core/IPCHandler.ts scripts/mcp-render-status-sync-test.ts
git commit -m "fix: publish stopped service state before replacement"
~~~

### Task 4: Verify the complete change set

**Files:**

- Verify: src/fork/module/ClickHouse/lifecycle.ts
- Verify: src/fork/module/ClickHouse/index.ts
- Verify: src/main/core/IPCHandler.ts
- Verify: scripts/clickhouse-service-lifecycle-test.ts
- Verify: scripts/mcp-render-status-sync-test.ts

- [ ] **Step 1: Run every relevant regression script**

Run each command independently:

~~~bash
yarn test:clickhouse-service-lifecycle
yarn test:clickhouse-config-page
yarn test:clickhouse-ch-ui
npx tsx scripts/mcp-render-status-sync-test.ts
~~~

Expected: all four commands exit 0 and print their success messages.

- [ ] **Step 2: Run lint and TypeScript checks for the changed code**

Run each command independently:

~~~bash
yarn -s eslint src/fork/module/ClickHouse/index.ts src/fork/module/ClickHouse/lifecycle.ts src/main/core/IPCHandler.ts scripts/clickhouse-service-lifecycle-test.ts scripts/mcp-render-status-sync-test.ts
npx vue-tsc --noEmit -p tsconfig.json
~~~

Expected: both commands exit 0 with no lint or TypeScript errors.

- [ ] **Step 3: Inspect the final diff for accidental changes**

Run: git diff --check HEAD~3..HEAD

Expected: exit code 0 with no whitespace errors. Confirm the only functional changes are ClickHouse PID ownership and main-process lifecycle event ordering.

- [ ] **Step 4: Commit any verification-only adjustment if and only if one was required**

If verification requires a code or test correction, repeat its focused red-green test before committing it. If no correction is needed, do not create another commit.
