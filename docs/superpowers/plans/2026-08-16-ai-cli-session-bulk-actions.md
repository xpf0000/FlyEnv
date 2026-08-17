# AI CLI Session Bulk Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-session deletion and working-directory terminal launch to the Claude Code, Codex, OpenCode, Copilot CLI, Kimi, and Antigravity session pages.

**Architecture:** Each module keeps its existing `setup.ts` singleton as the renderer operation owner. The six fork modules add a batched wrapper around their existing storage-specific `deleteSession()` implementation, and their existing terminal method treats a missing session ID as a new CLI invocation. Each session page owns only its checked IDs and binds its actions to the setup singleton.

**Tech Stack:** Vue 3 Composition API with TSX renderers, Element Plus, Electron IPC, TypeScript, `ForkPromise`, `tsx` source-contract regression tests.

---

## Operation Contract

| Operation | Owner | Snapshot | Duplicate policy | Terminal result | Cleanup |
| --- | --- | --- | --- | --- | --- |
| Bulk delete | Existing per-module `setup.ts` singleton | De-duplicated session ID array | `deletingSessions` rejects a second request | Fork resolves `{ deletedIds, failedIds }` | Clear flag on all replies, refresh once after at least one deletion |
| New terminal session | Existing per-module `setup.ts` singleton | Working directory string | The same directory is ignored while in `openingSessionDirs` | Fork opens terminal or returns an error | Remove the directory from the set on all replies |

The selection `Set` and select-all state stay in each mounted `Sessions.vue` page. No state is persisted, no Pinia store is added, and no module data is added to shared configuration. Fork modules retain ownership of session-store deletion and terminal process creation.

## File Structure

| File group | Responsibility |
| --- | --- |
| `src/fork/module/{ClaudeCode,Codex,OpenCode,CopilotCli,Kimi,Antigravity}/index.ts` | Execute all selected deletions against the module's existing storage behavior and start the bare CLI when no resume ID is supplied. |
| `src/render/components/{ClaudeCode,Codex,OpenCode,CopilotCli,Kimi,Antigravity}/setup.ts` | Own renderer IPC, re-entry flags, notices, and one list refresh for each new operation. |
| `src/render/components/{ClaudeCode,Codex,OpenCode,CopilotCli,Kimi,Antigravity}/Sessions.vue` | Own checked IDs, filter-scoped select-all, confirmation dialog, and icon controls. |
| `scripts/ai-cli-session-fork-test.ts` | Verify the six fork contracts and bare new-session command branches. |
| `scripts/renderer-operation-boundaries-test.ts` | Extend the renderer-boundary regression suite with the six setup/page contracts. |
| `package.json` | Register the focused fork regression command. |

The module mapping used by all tasks is fixed:

| Component directory | Renderer singleton | Fork IPC key | Bare CLI | Resume branch |
| --- | --- | --- | --- | --- |
| `ClaudeCode` | `ClaudeCodeSetup` | `claudeCode` | `claude` | `claude --resume ${sessionId}` |
| `Codex` | `CodexSetup` | `codex` | `codex` | `codex resume ${sessionId}` |
| `OpenCode` | `OpenCodeSetup` | `openCode` | `opencode` | `opencode --session ${sessionId}` |
| `CopilotCli` | `CopilotCliSetup` | `copilotCli` | `copilot` | `copilot --resume=${sessionId}` |
| `Kimi` | `KimiSetup` | `kimi` | `kimi` | `kimi --session "${sessionId}"` |
| `Antigravity` | `AntigravitySetup` | `antigravity` | `agy` | `agy --conversation ${sessionId}` |

### Task 1: Add the Failing Fork Contract Test

**Files:**
- Create: `scripts/ai-cli-session-fork-test.ts`
- Modify: `package.json:18-31`

- [ ] **Step 1: Write the failing fork contract test**

Create `scripts/ai-cli-session-fork-test.ts` with this complete source. The assertions deliberately describe APIs that do not exist yet.

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')

const modules = [
  { directory: 'ClaudeCode', cli: 'claude', resume: /--resume \$\{sessionId\}/ },
  { directory: 'Codex', cli: 'codex', resume: /resume \$\{sessionId\}/ },
  { directory: 'OpenCode', cli: 'opencode', resume: /--session \$\{sessionId\}/ },
  { directory: 'CopilotCli', cli: 'copilot', resume: /--resume=\$\{sessionId\}/ },
  { directory: 'Kimi', cli: 'kimi', resume: /--session "\$\{sessionId\}"/ },
  { directory: 'Antigravity', cli: 'agy', resume: /--conversation \$\{sessionId\}/ }
]

for (const module of modules) {
  const source = readFileSync(join(root, 'src', 'fork', 'module', module.directory, 'index.ts'), 'utf-8')
  const terminalStart = source.indexOf('runInTerminal(workDir: string, sessionId = \'\')')
  const terminalEnd = source.indexOf('// ==========', terminalStart + 1)
  const terminalSource = source.slice(terminalStart, terminalEnd)

  assert.match(source, /deleteSessions\(sessionIds: string\[\]\)/)
  assert.match(source, /const ids = \[\.\.\.new Set\(sessionIds\)\]/)
  assert.match(source, /Promise\.allSettled\(ids\.map\(\(sessionId\) => this\.deleteSession\(sessionId\)\)\)/)
  assert.match(source, /resolve\(\{ deletedIds, failedIds \}\)/)
  assert.notEqual(terminalStart, -1, `${module.directory}: session ID must be optional`)
  assert.match(terminalSource, /sessionId\s*\?/) 
  assert.match(terminalSource, module.resume)
  assert.match(terminalSource, new RegExp(`: resolveAiCliTerminalCommand\\('${module.cli}'\\)`))
  assert.match(terminalSource, /ExecCommand\.runInTerminal\(terminalCommand\)/)
}

console.log('ai-cli session fork tests passed')
```

Add this package script immediately after the existing test entries:

```json
"test:ai-cli-session-fork": "tsx scripts/ai-cli-session-fork-test.ts"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test:ai-cli-session-fork`

Expected: FAIL because none of the six fork modules has `deleteSessions(sessionIds: string[])` and five have a required `sessionId` parameter.

### Task 2: Implement Fork Batch Deletion and Bare CLI Launch

**Files:**
- Modify: `src/fork/module/ClaudeCode/index.ts:202-239`
- Modify: `src/fork/module/Codex/index.ts:218-250`
- Modify: `src/fork/module/OpenCode/index.ts:137-156`
- Modify: `src/fork/module/CopilotCli/index.ts:147-201`
- Modify: `src/fork/module/Kimi/index.ts:208-305`
- Modify: `src/fork/module/Antigravity/index.ts:193-226`
- Test: `scripts/ai-cli-session-fork-test.ts`

- [ ] **Step 1: Add the exact bulk wrapper after each existing `deleteSession()` method**

In each of the six listed fork modules, insert this method immediately after its existing `deleteSession()` method. Do not copy deletion internals into the batch method: `deleteSession()` remains the only storage-specific deletion implementation.

```ts
  deleteSessions(sessionIds: string[]) {
    return new ForkPromise(async (resolve) => {
      const ids = [...new Set(sessionIds)]
      const results = await Promise.allSettled(ids.map((sessionId) => this.deleteSession(sessionId)))
      const deletedIds: string[] = []
      const failedIds: string[] = []

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          deletedIds.push(ids[index])
        } else {
          failedIds.push(ids[index])
        }
      })

      resolve({ deletedIds, failedIds })
    })
  }
```

- [ ] **Step 2: Make each terminal method accept an omitted session ID**

Change each signature to this exact signature:

```ts
  runInTerminal(workDir: string, sessionId = '') {
```

Then replace the current unconditional CLI command declaration using the fixed branch for its module:

```ts
// ClaudeCode
const command = sessionId
  ? `${resolveAiCliTerminalCommand('claude')} --resume ${sessionId}`
  : resolveAiCliTerminalCommand('claude')

// Codex
const command = sessionId
  ? `${resolveAiCliTerminalCommand('codex')} resume ${sessionId}`
  : resolveAiCliTerminalCommand('codex')

// OpenCode
const command = sessionId
  ? `${resolveAiCliTerminalCommand('opencode')} --session ${sessionId}`
  : resolveAiCliTerminalCommand('opencode')

// CopilotCli
const command = sessionId
  ? `${resolveAiCliTerminalCommand('copilot')} --resume=${sessionId}`
  : resolveAiCliTerminalCommand('copilot')

// Kimi
const command = sessionId
  ? `${resolveAiCliTerminalCommand('kimi')} --session "${sessionId}"`
  : resolveAiCliTerminalCommand('kimi')

// Antigravity
const command = sessionId
  ? `${resolveAiCliTerminalCommand('agy')} --conversation ${sessionId}`
  : resolveAiCliTerminalCommand('agy')
```

Use `command` in the existing Windows/macOS/Linux `terminalCommand` interpolation. Keep each module's current `workDir || homedir()` fallback; in Kimi add the same fallback before composing `terminalCommand` so an empty grouped path opens in the home directory:

```ts
const dir = workDir || homedir()
const terminalCommand = isWindows() ? `cd "${dir}"; ${command}` : `cd "${dir}" && ${command}`
```

- [ ] **Step 3: Run the focused fork test to verify it passes**

Run: `yarn test:ai-cli-session-fork`

Expected: PASS with `ai-cli session fork tests passed`.

- [ ] **Step 4: Commit the fork contract and implementation**

```bash
git add package.json scripts/ai-cli-session-fork-test.ts src/fork/module/ClaudeCode/index.ts src/fork/module/Codex/index.ts src/fork/module/OpenCode/index.ts src/fork/module/CopilotCli/index.ts src/fork/module/Kimi/index.ts src/fork/module/Antigravity/index.ts
git commit -m "feat: add AI CLI session batch actions"
```

### Task 3: Add the Failing Renderer Operation-Boundary Test

**Files:**
- Modify: `scripts/renderer-operation-boundaries-test.ts:1-120`

- [ ] **Step 1: Add the AI CLI session operation contract assertions**

After the existing package-script assertions, add the following test block. It validates that pages own only selection state and route operations through their module-local setup singleton.

```ts
const aiSessionModules = [
  { directory: 'ClaudeCode', setup: 'ClaudeCodeSetup', forkKey: 'claudeCode' },
  { directory: 'Codex', setup: 'CodexSetup', forkKey: 'codex' },
  { directory: 'OpenCode', setup: 'OpenCodeSetup', forkKey: 'openCode' },
  { directory: 'CopilotCli', setup: 'CopilotCliSetup', forkKey: 'copilotCli' },
  { directory: 'Kimi', setup: 'KimiSetup', forkKey: 'kimi' },
  { directory: 'Antigravity', setup: 'AntigravitySetup', forkKey: 'antigravity' }
]

for (const module of aiSessionModules) {
  const pageSource = readFileSync(join(componentsDir, module.directory, 'Sessions.vue'), 'utf-8')
  const setupSource = readFileSync(join(componentsDir, module.directory, 'setup.ts'), 'utf-8')
  const setupDeleteStart = setupSource.indexOf('deleteSessions(sessionIds: string[])')
  const setupTerminalStart = setupSource.indexOf('startSessionInTerminal(workDir: string)')
  const setupDeleteSource = setupSource.slice(setupDeleteStart, setupTerminalStart)

  assert.match(pageSource, /const selectedSessionIds = ref\(new Set<string>\(\)\)/)
  assert.match(pageSource, /const visibleSessionIds = computed\(/)
  assert.match(pageSource, /const deleteSelectedSessions = \(\) =>/)
  assert.match(pageSource, /<template #title>/)
  assert.match(pageSource, /:icon="Terminal"/)
  assert.match(pageSource, new RegExp(`${module.setup}\\.deleteSessions\\(ids\\)`))
  assert.match(pageSource, new RegExp(`${module.setup}\\.startSessionInTerminal\\(group\\.workDir\\)`))
  assert.doesNotMatch(pageSource, /from\s+['"]@\/util\/IPC['"]/) 

  assert.match(setupSource, /deletingSessions = false/)
  assert.match(setupSource, /openingSessionDirs = new Set<string>\(\)/)
  assert.match(setupSource, /deleteSessions\(sessionIds: string\[\]\): Promise<string\[\]>/)
  assert.match(setupSource, new RegExp(`IPC\\.send\\('app-fork:${module.forkKey}', 'deleteSessions', ids\\)`))
  assert.match(setupSource, /startSessionInTerminal\(workDir: string\): Promise<boolean>/)
  assert.match(setupSource, new RegExp(`IPC\\.send\\('app-fork:${module.forkKey}', 'runInTerminal', workDir\\)`))
  assert.match(setupSource, /isStartingSessionInTerminal\(workDir: string\)/)
  assert.match(setupDeleteSource, /this\.refreshSessions\(\)/)
  assert.equal((setupDeleteSource.match(/this\.refreshSessions\(\)/g) ?? []).length, 1)
}
```

- [ ] **Step 2: Run the renderer-boundary test to verify it fails**

Run: `yarn test:renderer-operation-boundaries`

Expected: FAIL on the first missing selection/controller assertion, proving the test is checking the new contract rather than existing behavior.

### Task 4: Implement Renderer Controllers and Session-Page Controls

**Files:**
- Modify: `src/render/components/ClaudeCode/setup.ts:186-227`
- Modify: `src/render/components/Codex/setup.ts:171-212`
- Modify: `src/render/components/OpenCode/setup.ts:183-224`
- Modify: `src/render/components/CopilotCli/setup.ts:173-214`
- Modify: `src/render/components/Kimi/setup.ts:182-281`
- Modify: `src/render/components/Antigravity/setup.ts:172-213`
- Modify: `src/render/components/ClaudeCode/Sessions.vue:1-222`
- Modify: `src/render/components/Codex/Sessions.vue:1-218`
- Modify: `src/render/components/OpenCode/Sessions.vue:1-204`
- Modify: `src/render/components/CopilotCli/Sessions.vue:1-222`
- Modify: `src/render/components/Kimi/Sessions.vue:1-256`
- Modify: `src/render/components/Antigravity/Sessions.vue:1-207`
- Test: `scripts/renderer-operation-boundaries-test.ts`

- [ ] **Step 1: Add module-local operation state and IPC commands to every setup singleton**

Immediately below each module's existing `loading` field, add:

```ts
  deletingSessions = false
  openingSessionDirs = new Set<string>()
```

Immediately after its existing `deleteSession()` method, add the following method to `ClaudeCode/setup.ts`.

```ts
  deleteSessions(sessionIds: string[]): Promise<string[]> {
    const ids = [...new Set(sessionIds)]
    if (!ids.length || this.deletingSessions) {
      return Promise.resolve([])
    }

    this.deletingSessions = true
    return new Promise((resolve) => {
      IPC.send('app-fork:claudeCode', 'deleteSessions', ids).then((key: string, res: any) => {
        IPC.off(key)
        this.deletingSessions = false
        if (res?.code !== 0) {
          MessageError(res?.msg ?? I18nT('base.fail'))
          resolve([])
          return
        }

        const deletedIds = Array.isArray(res?.data?.deletedIds) ? res.data.deletedIds : []
        const failedIds = Array.isArray(res?.data?.failedIds) ? res.data.failedIds : []
        if (deletedIds.length) {
          MessageSuccess(I18nT('common.session.deleted'))
          this.refreshSessions()
        }
        if (failedIds.length) {
          MessageError(I18nT('base.fail'))
        }
        resolve(deletedIds)
      })
    })
  }

  startSessionInTerminal(workDir: string): Promise<boolean> {
    if (this.openingSessionDirs.has(workDir)) {
      return Promise.resolve(false)
    }

    this.openingSessionDirs.add(workDir)
    return new Promise((resolve) => {
      IPC.send('app-fork:claudeCode', 'runInTerminal', workDir).then((key: string, res: any) => {
        IPC.off(key)
        this.openingSessionDirs.delete(workDir)
        if (res?.code === 0) {
          MessageSuccess(I18nT('host.runInTerminal'))
          resolve(true)
          return
        }
        MessageError(res?.msg ?? I18nT('base.fail'))
        resolve(false)
      })
    })
  }

  isStartingSessionInTerminal(workDir: string) {
    return this.openingSessionDirs.has(workDir)
  }
```

Add the same method bodies to the remaining five setup files, using the following complete per-module IPC and successful-delete notice lines at the positions shown above:

```ts
IPC.send('app-fork:claudeCode', 'deleteSessions', ids)
IPC.send('app-fork:codex', 'deleteSessions', ids)
IPC.send('app-fork:openCode', 'deleteSessions', ids)
IPC.send('app-fork:copilotCli', 'deleteSessions', ids)
IPC.send('app-fork:kimi', 'deleteSessions', ids)
IPC.send('app-fork:antigravity', 'deleteSessions', ids)
```

```ts
// Codex, OpenCode, CopilotCli, and Kimi
MessageSuccess(I18nT('common.session.deleted'))

// Antigravity
MessageSuccess(I18nT('antigravity.sessionDeleted'))
```

For the terminal call, use the same six IPC keys with this exact argument shape, which deliberately omits the session ID:

```ts
IPC.send('app-fork:claudeCode', 'runInTerminal', workDir)
IPC.send('app-fork:codex', 'runInTerminal', workDir)
IPC.send('app-fork:openCode', 'runInTerminal', workDir)
IPC.send('app-fork:copilotCli', 'runInTerminal', workDir)
IPC.send('app-fork:kimi', 'runInTerminal', workDir)
IPC.send('app-fork:antigravity', 'runInTerminal', workDir)
```

- [ ] **Step 2: Add page-local selection state to the six `Sessions.vue` files**

In each page, import `watch`, `Terminal`, and `ElCheckbox`. Add the following code after `activeNames` in `ClaudeCode/Sessions.vue`.

```ts
  const selectedSessionIds = ref(new Set<string>())

  const visibleSessionIds = computed(() =>
    filteredGroups.value.flatMap((group) => group.sessions.map((session) => session.id))
  )
  const allVisibleSelected = computed(
    () =>
      visibleSessionIds.value.length > 0 &&
      visibleSessionIds.value.every((id) => selectedSessionIds.value.has(id))
  )
  const visibleSelectionIndeterminate = computed(() => {
    const selectedCount = visibleSessionIds.value.filter((id) => selectedSessionIds.value.has(id)).length
    return selectedCount > 0 && selectedCount < visibleSessionIds.value.length
  })

  const setSessionSelected = (sessionId: string, selected: boolean) => {
    const next = new Set(selectedSessionIds.value)
    if (selected) {
      next.add(sessionId)
    } else {
      next.delete(sessionId)
    }
    selectedSessionIds.value = next
  }

  const setVisibleSessionsSelected = (selected: boolean) => {
    const next = new Set(selectedSessionIds.value)
    visibleSessionIds.value.forEach((sessionId) => {
      if (selected) {
        next.add(sessionId)
      } else {
        next.delete(sessionId)
      }
    })
    selectedSessionIds.value = next
  }

  const deleteSelectedSessions = () => {
    const ids = [...selectedSessionIds.value]
    if (!ids.length) {
      return
    }
    ElMessageBox.confirm(I18nT('base.delAlertContent'), I18nT('base.delAlertTitle'), {
      confirmButtonText: I18nT('base.confirm'),
      cancelButtonText: I18nT('base.cancel'),
      type: 'warning'
    })
      .then(async () => {
        const deletedIds = await ClaudeCodeSetup.deleteSessions(ids)
        const next = new Set(selectedSessionIds.value)
        deletedIds.forEach((sessionId) => next.delete(sessionId))
        selectedSessionIds.value = next
      })
      .catch(() => {})
  }

  const startSessionInTerminal = (workDir: string) => {
    ClaudeCodeSetup.startSessionInTerminal(workDir)
  }

  watch(
    () => ClaudeCodeSetup.sessions,
    (sessions) => {
      const availableIds = new Set(sessions.map((session) => session.id))
      selectedSessionIds.value = new Set(
        [...selectedSessionIds.value].filter((sessionId) => availableIds.has(sessionId))
      )
    }
  )
```

Use these exact singleton expressions in the corresponding methods and watcher of the other five pages:

```ts
CodexSetup.deleteSessions(ids)
CodexSetup.startSessionInTerminal(workDir)
() => CodexSetup.sessions

OpenCodeSetup.deleteSessions(ids)
OpenCodeSetup.startSessionInTerminal(workDir)
() => OpenCodeSetup.sessions

CopilotCliSetup.deleteSessions(ids)
CopilotCliSetup.startSessionInTerminal(workDir)
() => CopilotCliSetup.sessions

KimiSetup.deleteSessions(ids)
KimiSetup.startSessionInTerminal(workDir)
() => KimiSetup.sessions

AntigravitySetup.deleteSessions(ids)
AntigravitySetup.startSessionInTerminal(workDir)
() => AntigravitySetup.sessions
```

- [ ] **Step 3: Add the header controls, path terminal control, and checkbox column to each page**

Replace the card header title span in `ClaudeCode/Sessions.vue` with this block:

```vue
<div class="left flex items-center">
  <span>{{ I18nT('common.session.list') }}</span>
  <el-tooltip :content="I18nT('common.action.delete')" placement="top" :show-after="300">
    <el-button
      link
      type="danger"
      size="small"
      :icon="Delete"
      :disabled="selectedSessionIds.size === 0 || ClaudeCodeSetup.deletingSessions"
      @click="deleteSelectedSessions"
    />
  </el-tooltip>
</div>
```

Replace `:title="group.workDir"` in `ClaudeCode/Sessions.vue` with this title slot:

```vue
<template #title>
  <div class="flex min-w-0 flex-1 items-center">
    <span class="truncate">{{ group.workDir }}</span>
    <el-tooltip :content="I18nT('host.runInTerminal')" placement="top" :show-after="300">
      <el-button
        link
        size="small"
        class="ml-2 shrink-0"
        :icon="Terminal"
        :disabled="ClaudeCodeSetup.isStartingSessionInTerminal(group.workDir)"
        @click.stop="startSessionInTerminal(group.workDir)"
      />
    </el-tooltip>
  </div>
</template>
```

Insert this as the first element of each `columns` array. The click handler is required so table-row resume never fires when a checkbox is toggled.

```tsx
    {
      key: 'selection',
      dataKey: 'selection',
      width: 52,
      align: 'center',
      headerCellRenderer: () => (
        <ElCheckbox
          modelValue={allVisibleSelected.value}
          indeterminate={visibleSelectionIndeterminate.value}
          onClick={(event: Event) => event.stopPropagation()}
          onChange={(selected: boolean) => setVisibleSessionsSelected(selected)}
        />
      ),
      cellRenderer: ({ rowData: row }) => (
        <ElCheckbox
          modelValue={selectedSessionIds.value.has(row.id)}
          onClick={(event: Event) => event.stopPropagation()}
          onChange={(selected: boolean) => setSessionSelected(row.id, selected)}
        />
      )
    },
```

Keep the current per-row resume and delete menu entries unchanged. Do not add direct `IPC` imports to any page.

Apply the same card-header and title-slot blocks to the other pages with these exact singleton members in their two `:disabled` bindings:

```ts
CodexSetup.deletingSessions
CodexSetup.isStartingSessionInTerminal(group.workDir)
OpenCodeSetup.deletingSessions
OpenCodeSetup.isStartingSessionInTerminal(group.workDir)
CopilotCliSetup.deletingSessions
CopilotCliSetup.isStartingSessionInTerminal(group.workDir)
KimiSetup.deletingSessions
KimiSetup.isStartingSessionInTerminal(group.workDir)
AntigravitySetup.deletingSessions
AntigravitySetup.isStartingSessionInTerminal(group.workDir)
```

- [ ] **Step 4: Run the renderer-boundary test to verify it passes**

Run: `yarn test:renderer-operation-boundaries`

Expected: PASS with `renderer operation boundary tests passed`.

- [ ] **Step 5: Commit the renderer controller and view changes**

```bash
git add scripts/renderer-operation-boundaries-test.ts src/render/components/ClaudeCode/setup.ts src/render/components/Codex/setup.ts src/render/components/OpenCode/setup.ts src/render/components/CopilotCli/setup.ts src/render/components/Kimi/setup.ts src/render/components/Antigravity/setup.ts src/render/components/ClaudeCode/Sessions.vue src/render/components/Codex/Sessions.vue src/render/components/OpenCode/Sessions.vue src/render/components/CopilotCli/Sessions.vue src/render/components/Kimi/Sessions.vue src/render/components/Antigravity/Sessions.vue
git commit -m "feat: add AI CLI session page controls"
```

### Task 5: Run Focused and Project Verification

**Files:**
- Verify: `package.json`
- Verify: `scripts/ai-cli-session-fork-test.ts`
- Verify: `scripts/renderer-operation-boundaries-test.ts`
- Verify: all files changed in Tasks 2 and 4

- [ ] **Step 1: Run both focused regression suites**

Run: `yarn test:ai-cli-session-fork && yarn test:renderer-operation-boundaries`

Expected: both commands exit `0` and print their success messages.

- [ ] **Step 2: Run formatting and static checks**

Run: `yarn eslint scripts/ai-cli-session-fork-test.ts scripts/renderer-operation-boundaries-test.ts src/fork/module/ClaudeCode/index.ts src/fork/module/Codex/index.ts src/fork/module/OpenCode/index.ts src/fork/module/CopilotCli/index.ts src/fork/module/Kimi/index.ts src/fork/module/Antigravity/index.ts src/render/components/ClaudeCode/setup.ts src/render/components/Codex/setup.ts src/render/components/OpenCode/setup.ts src/render/components/CopilotCli/setup.ts src/render/components/Kimi/setup.ts src/render/components/Antigravity/setup.ts src/render/components/ClaudeCode/Sessions.vue src/render/components/Codex/Sessions.vue src/render/components/OpenCode/Sessions.vue src/render/components/CopilotCli/Sessions.vue src/render/components/Kimi/Sessions.vue src/render/components/Antigravity/Sessions.vue`

Expected: exit `0` with no lint or Prettier errors.

- [ ] **Step 3: Build the renderer and fork bundles**

Run: `yarn build:dev-runner && cross-env NODE_ENV=development npx vite build --config configs/vite.config.ts && cross-env NODE_ENV=development npx esbuild --platform=node --bundle --packages=external --inject:scripts/shim-dynamic-require.mjs --format=esm src/fork/index.ts --outfile=/tmp/flyenv-ai-cli-session-fork.mjs`

Expected: all commands exit `0`; the fork bundle is created at `/tmp/flyenv-ai-cli-session-fork.mjs`.

- [ ] **Step 4: Perform manual desktop smoke verification**

Run: `yarn dev`

Expected manual checks for each of Claude Code, Codex, OpenCode, Copilot CLI, Kimi, and Antigravity:

1. Check two sessions, then verify the small header delete icon enables.
2. Filter the list, select all visible sessions, then clear the filter and verify non-visible selections remain selected.
3. Cancel the deletion dialog and verify no deletion occurs; confirm once and verify the list refreshes once and only failed IDs remain selected.
4. Click a session ID checkbox and verify the CLI does not resume; click the row outside controls and verify its existing resume behavior remains unchanged.
5. Click a folder terminal icon and verify the external terminal starts the bare CLI in that directory, without a resume/session/conversation argument; double-click it rapidly and verify only one terminal opens.

- [ ] **Step 5: Inspect the final diff and status**

Run: `git diff --check && git status --short && git log -2 --oneline`

Expected: no whitespace errors; status lists only the intended feature changes or commits; the two feature commits are visible.
