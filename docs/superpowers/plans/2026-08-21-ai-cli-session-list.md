# AI CLI Session List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load every AI CLI session by default using bounded concurrent local-file reads and show a loading overlay throughout each list request.

**Architecture:** A fresh four-worker `TaskQueue` runs independent session metadata file reads. Claude Code, Codex, and Kimi use it; command and SQLite sources retain their existing access path. Existing setup singletons own non-persistent `sessionLoading` plus one in-flight refresh promise, and each session page binds its content area to that operation state.

**Tech Stack:** TypeScript, Electron fork IPC, Vue 3, Element Plus, Node assertions.

---

### Task 1: Queue utility

**Files:**
- Create: `scripts/ai-cli-session-list-test.ts`
- Modify: `src/fork/util/AiCliSession.ts`
- Modify: `package.json`

- [x] **Step 1: Write a failing bounded-concurrency test**

```ts
const results = await runAiCliSessionTasks(Array.from({ length: 9 }, (_, index) => async () => {
  running += 1
  peak = Math.max(peak, running)
  await new Promise((resolve) => setTimeout(resolve, 5))
  running -= 1
  return index
}))
assert.deepEqual(results, [0, 1, 2, 3, 4, 5, 6, 7, 8])
assert.equal(peak, 4)
```

- [x] **Step 2: Verify RED**

Run: `tsx scripts/ai-cli-session-list-test.ts`

Expected: failure because `runAiCliSessionTasks` is not exported.

- [x] **Step 3: Implement the queue wrapper**

```ts
export function runAiCliSessionTasks<T>(tasks: Array<() => Promise<T>>): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  return new Promise((resolve) => {
    new TaskQueue(4).initQueue(tasks.map((task, index) => ({
      run: async () => {
        results[index] = await task()
        return true
      }
    }))).end(() => resolve(results)).run()
  })
}
```

Task errors are caught by each queued runner and yield `undefined`, retaining the existing tolerant list behavior.

- [x] **Step 4: Verify GREEN**

Run: `tsx scripts/ai-cli-session-list-test.ts`

Expected: `ai-cli session list tests passed`.

- [x] **Step 5: Commit**

```bash
git add src/fork/util/AiCliSession.ts scripts/ai-cli-session-list-test.ts package.json
git commit -m "feat: queue AI CLI session metadata reads"
```

### Task 2: File-backed session readers

**Files:**
- Modify: `src/fork/module/ClaudeCode/index.ts:108-190`
- Modify: `src/fork/module/Codex/index.ts:104-214`
- Modify: `src/fork/module/Kimi/index.ts:239-295`
- Modify: `scripts/ai-cli-session-fork-test.ts`

- [x] **Step 1: Write failing source assertions**

```ts
for (const directory of ['ClaudeCode', 'Codex', 'Kimi']) {
  assert.match(readSource(`src/fork/module/${directory}/index.ts`), /runAiCliSessionTasks\(/)
}
```

- [x] **Step 2: Verify RED**

Run: `yarn test:ai-cli-session-fork`

Expected: failure because no file-backed session module queues metadata parsing.

- [x] **Step 3: Queue each independent metadata read**

```ts
const metas = await runAiCliSessionTasks(files.map((filePath) => () => this.parseSessionFile(filePath)))
for (const meta of metas) {
  if (meta?.id) list.push({ id: meta.id, title: meta.title || meta.id, ...meta })
}
```

Claude keeps IDs derived from file names. Kimi extracts a private state-file parser and queues every session state read. Preserve directory enumeration, index loading, deduplication, tolerant parsing, and descending timestamp sorting. Do not queue SQLite or command operations.

- [x] **Step 4: Verify GREEN**

Run: `yarn test:ai-cli-session-fork`

Expected: `ai-cli session fork tests passed`.

- [x] **Step 5: Commit**

```bash
git add src/fork/module/ClaudeCode/index.ts src/fork/module/Codex/index.ts src/fork/module/Kimi/index.ts scripts/ai-cli-session-fork-test.ts
git commit -m "perf: read AI CLI session metadata concurrently"
```

### Task 3: Renderer session operations and view loading

**Files:**
- Modify: `src/render/components/{Antigravity,ClaudeCode,Codex,CopilotCli,Hermes,Kimi,OpenCode}/setup.ts`
- Modify: `src/render/components/{Antigravity,ClaudeCode,Codex,CopilotCli,Hermes,Kimi,OpenCode}/Sessions.vue`
- Modify: `src/fork/module/Hermes/index.ts`
- Modify: `scripts/ai-cli-session-list-test.ts`

- [x] **Step 1: Write failing setup and view assertions**

```ts
assert.match(setup, /sessionLoading = false/)
assert.match(setup, /private sessionRefreshPromise/)
assert.match(setup, /if \(this\.sessionRefreshPromise\)/)
assert.match(setup, /this\.sessionLoading = false/)
assert.match(view, new RegExp(`v-loading="${directory}Setup\\.sessionLoading"`))
```

- [x] **Step 2: Verify RED**

Run: `tsx scripts/ai-cli-session-list-test.ts`

Expected: failure because no session operation state or loading binding exists.

- [x] **Step 3: Add each singleton's one-request refresh contract**

```ts
sessionLoading = false
private sessionRefreshPromise: Promise<void> | undefined

refreshSessions() {
  if (this.sessionRefreshPromise) return this.sessionRefreshPromise
  this.sessionLoading = true
  this.sessionRefreshPromise = new Promise((resolve) => {
    IPC.send('app-fork:codex', 'listSessions').then((key, res) => {
      IPC.off(key)
      if (res?.code === 0) this.sessions = res?.data ?? []
      this.sessionLoading = false
      this.sessionRefreshPromise = undefined
      resolve()
    })
  })
  return this.sessionRefreshPromise
}
```

Use each existing IPC channel. The terminal callback always removes the IPC listener and clears state. Update each content wrapper to `v-loading="<Module>Setup.sessionLoading"`; refresh buttons disable and spin on `sessionLoading`. Keep terminal branches intact. Remove Hermes session-output debug logging.

- [x] **Step 4: Verify GREEN**

Run: `yarn test:ai-cli-session-fork && yarn test:ai-cli-session-list && yarn test:renderer-operation-boundaries`

Expected: all commands pass without warnings.

- [x] **Step 5: Commit**

```bash
git add src/render/components/Antigravity src/render/components/ClaudeCode src/render/components/Codex src/render/components/CopilotCli src/render/components/Hermes src/render/components/Kimi src/render/components/OpenCode src/fork/module/Hermes/index.ts scripts/ai-cli-session-list-test.ts package.json
git commit -m "feat: show AI CLI session list loading"
```
