# AI Memory Windows Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable and verify AI Memory on Windows x64 with an x64-only plugin architecture declaration.

**Architecture:** Keep the existing dedicated worker, `MemoryWorkspace`, engines, data format, and controllers. Add one module-local regular-file opener and call it from rule writes, memory reads, and backup reads; make tests portable before enabling the manifest gate.

**Tech Stack:** TypeScript, Node.js `fs`/`path`, Electron `utilityProcess`, Vite, Node test runner.

## Global Constraints

- Support macOS and Windows on `x64` only; do not add Linux or ARM64. The global manifest declaration therefore removes the previous macOS ARM64 declaration.
- Do not change memory JSON, Markdown body references, project identities, backup manifests, MCP schemas, or IPC methods.
- Do not add Pinia state, shared configuration, new lifecycle controllers, or new dependencies.
- Keep regular-file failures at the existing owner and preserve existing public error codes.
- Do not commit or push unless the user separately asks.

## Operation Contract

- **Owner/lifetime:** Existing `MemoryWorkspace` and fork module own all changed file operations for their existing call lifetimes. No renderer operation changes.
- **Start/intermediate events:** Existing search/get/store/update/forget, rule installation, backup, and restore entry points; no new progress events.
- **Terminal events:** Existing success/failed/unknown/partial outcomes remain unchanged. Invalid linked files fail only the dependent read/write; no replay is introduced.
- **Duplicate invocation:** Existing request IDs and workspace serialization remain authoritative.
- **Parent/companion interaction:** Existing dedicated worker and `DataRootLease` remain unchanged.
- **Lifecycle tests:** Existing workspace, runtime-probe, and end-to-end restart tests cover shutdown and data-root reuse. Helper unit tests cover handle closure on validation failure.
- **Failure boundaries:** Manifest compatibility and regular-file validation are required dependencies. Handle-close errors during rejected validation are supplementary and cannot replace the validation error. Platform/privilege test skips are independent test items, not product success claims.

## File Structure

- Create `plugins/ai-memory/fork/RegularFile.ts`: safe final-component regular-file opening.
- Create `plugins/ai-memory/tests/regular-file.test.ts`: mocked symlink/identity checks and real regular-file behavior.
- Modify `plugins/ai-memory/fork/rules-installer.ts`, `RecordStore.ts`, and `memory-backup.ts`: use the helper without changing caller result mapping.
- Modify existing AI Memory tests: native path assertions, junction aliases, and explicit platform/privilege skips.
- Modify `plugin.json`, `render/Module.ts`, language labels, and README: final Windows support declaration and text.

---

### Task 1: Regular-File Opener

**Files:**
- Create: `plugins/ai-memory/fork/RegularFile.ts`
- Test: `plugins/ai-memory/tests/regular-file.test.ts`

**Interfaces:**
- Produces: `openRegularFile(path, flags, mode, invalid, io?) => Promise<FileHandle>` and optional `RegularFileIO` injection for tests.
- Consumes: Node `lstat`, `open`, `Stats`, and `FileHandle`.

- [ ] **Step 1: Write failing helper tests**

Create tests using `node:test` and `node:assert/strict`. Mock pre-open symlink metadata and assert `open` is never called; mock a post-open inode mismatch and assert the handle closes and the caller's `invalid()` error propagates. Use real temporary files to assert a normal read-only open succeeds and a missing path can be created only when `O_CREAT` is present.

```ts
const invalid = (): never => {
  throw new Error('invalid_regular_file')
}
await assert.rejects(
  openRegularFile('linked', O_RDONLY, undefined, invalid, {
    lstat: async () => stats({ symbolic: true }),
    open: async () => {
      throw new Error('must not open')
    }
  }),
  /invalid_regular_file/
)
```

For the mismatch case, return `ino: 1` from path metadata and `ino: 2` from handle metadata, with `dev: 1`, regular-file flags, and a close counter. Assert one close and the same rejection.

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --import tsx --test plugins/ai-memory/tests/regular-file.test.ts`
Expected: FAIL because `../fork/RegularFile` does not exist.

- [ ] **Step 3: Implement the helper**

```ts
import { constants } from 'node:fs'
import type { Stats } from 'node:fs'
import { lstat, open, type FileHandle } from 'node:fs/promises'

export type RegularFileIO = {
  lstat(path: string): Promise<Stats>
  open(path: string, flags: number, mode?: number): Promise<FileHandle>
}

export async function openRegularFile(
  path: string,
  flags: number,
  mode: number | undefined,
  invalid: () => never,
  io: RegularFileIO = { lstat, open }
): Promise<FileHandle> {
  let before: Stats | undefined
  try {
    before = await io.lstat(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || !(flags & constants.O_CREAT))
      throw error
  }
  if (before && (!before.isFile() || before.isSymbolicLink())) invalid()
  const handle = await io.open(path, flags | (constants.O_NOFOLLOW ?? 0), mode)
  try {
    const [opened, named] = await Promise.all([handle.stat(), io.lstat(path)])
    if (
      !opened.isFile() ||
      !named.isFile() ||
      named.isSymbolicLink() ||
      opened.dev !== named.dev ||
      opened.ino !== named.ino
    )
      invalid()
    return handle
  } catch (error) {
    await handle.close().catch(() => {})
    throw error
  }
}
```

- [ ] **Step 4: Run the helper tests and verify GREEN**

Run: `node --import tsx --test plugins/ai-memory/tests/regular-file.test.ts`
Expected: all helper tests pass, including missing-file creation and handle cleanup.

### Task 2: Use the Helper at Existing File Boundaries

**Files:**
- Modify: `plugins/ai-memory/fork/rules-installer.ts:1-4,85-93`
- Modify: `plugins/ai-memory/fork/RecordStore.ts:1-4,84-121`
- Modify: `plugins/ai-memory/fork/memory-backup.ts:1-5,42-58`

**Interfaces:**
- Consumes: `openRegularFile` from Task 1.
- Produces: no new public API or error code.

- [ ] **Step 1: Add a caller-level failing regression**

In `rules-install.test.ts`, keep the real file-symlink test where permitted and add the mocked Task 1 coverage for Windows without symlink privileges. In `record-store.test.ts`, assert a managed path rejection remains a read failure rather than a successful read. The existing `untrusted body references cannot escape the managed ID directory` case is the baseline; run it before integration to confirm current behavior and use Task 1's new mismatch test as the RED proof for the changed boundary.

- [ ] **Step 2: Integrate rule writes**

Replace the direct `open(...)` in `MemoryRulesInstaller.append` with:

```ts
const file = await openRegularFile(
  path,
  constants.O_RDWR | constants.O_CREAT | constants.O_APPEND,
  0o600,
  () => {
    throw new Error('rules_unavailable')
  }
)
```

Remove the now-unused direct `open` import. Keep append, size, UTF-8, sync, and close behavior unchanged.

- [ ] **Step 3: Integrate record/body reads**

Replace the direct read-only `open` in `RecordStore.bytes` with:

```ts
const file = await openRegularFile(path, constants.O_RDONLY, undefined, () => {
  throw new MemoryFault('managed_path_invalid')
})
```

Keep the surrounding `assertManagedPath`, size limits, reads, and existing catch mapping unchanged.

- [ ] **Step 4: Integrate backup reads**

Replace `bytesAt`'s direct open with:

```ts
const handle = await openRegularFile(path, constants.O_RDONLY, undefined, () =>
  fault('backup_invalid')
)
```

Keep scanning, checksum, and restore behavior unchanged.

- [ ] **Step 5: Run focused tests**

Run: `node --import tsx --test plugins/ai-memory/tests/regular-file.test.ts plugins/ai-memory/tests/rules-install.test.ts plugins/ai-memory/tests/record-store.test.ts plugins/ai-memory/tests/maintenance.test.ts`
Expected: no product assertion regressions. A real Windows file-symlink case may skip only on `EPERM`; the Unix `chmod` case is made portable in Task 3.

### Task 3: Make the Existing Suite Truthful on Windows

**Files:**
- Modify: `plugins/ai-memory/tests/acceptance.test.ts`
- Modify: `plugins/ai-memory/tests/client-config-preservation.test.ts`
- Modify: `plugins/ai-memory/tests/memory-api.test.ts`
- Modify: `plugins/ai-memory/tests/project-merge.test.ts`
- Modify: `plugins/ai-memory/tests/project-relocation.test.ts`
- Modify: `plugins/ai-memory/tests/maintenance.test.ts`
- Modify: `plugins/ai-memory/tests/rules-install.test.ts`

**Interfaces:**
- Consumes: Node `join`, `basename`, and `sep`; Windows `junction` aliases.
- Produces: identical product assertions without POSIX-only test fixtures.

- [ ] **Step 1: Replace hardcoded path matching**

Use `path.includes(`${sep}records${sep}`)` for record paths, `path.endsWith('projects.json')` / `path.endsWith('projects.previous.json')` for mapping filenames, `basename(p.project_path) === 'old'` for project lookup, and `alias + sep` for trailing-separator alias inputs. Build Claude expected paths with `join('/user', '.claude.json')` and `join('/custom', '.claude.json')`.

- [ ] **Step 2: Make directory aliases privilege-compatible**

At every directory `symlink` call in relocation and maintenance tests, pass:

```ts
process.platform === 'win32' ? 'junction' : 'dir'
```

This preserves the alias assertions while avoiding Windows symbolic-link privilege requirements.

- [ ] **Step 3: Isolate privilege- and ACL-specific cases**

Move the rule-file symlink block into its own test. Catch only `EPERM` from file symlink creation on Windows, call `t.skip('Windows file symlink privilege unavailable')`, and return; preserve the real rejection assertion on capable systems. Do not skip malformed UTF-8, size, invalid-client, or relative-path assertions.

Mark the existing Unix cleanup-permission test with:

```ts
{ skip: process.platform === 'win32' }
```

Keep the already-skipped Windows permission case in `project-merge.test.ts` unchanged.

- [ ] **Step 4: Run the complete suite**

Run: `node --import tsx --test plugins/ai-memory/tests/*.test.ts`
Expected: zero failures. Only the explicit Windows file-symlink privilege and Unix ACL cases, plus the pre-existing documented skip, may be skipped.

### Task 4: Enable Windows and Verify the Deliverable

**Files:**
- Modify: `plugins/ai-memory/plugin.json:10,17`
- Modify: `plugins/ai-memory/render/Module.ts:14`
- Modify: `plugins/ai-memory/lang/en.ts:222`
- Modify: `plugins/ai-memory/lang/zh.ts:198`
- Modify: `plugins/ai-memory/README.md:3`

**Interfaces:**
- Consumes: FlyEnv platform names `macOS`/`Windows` and architecture `x64`.
- Produces: a plugin accepted by the production `PluginManager` compatibility check on x64.

- [ ] **Step 1: Update declarations and user-facing text**

Use:

```json
"architecture": ["x64"]
```

and:

```ts
platform: ['macOS', 'Windows']
```

in both manifest and renderer module. Change preview labels to `Developer preview · macOS / Windows · x64 only` and `开发者预览 · macOS / Windows · 仅 x64`. Change README support text to state macOS/Windows x64 support and note that ARM64 is not declared.

- [ ] **Step 2: Run plugin build and native runtime verification**

Run: `yarn plugin:test ai-memory`
Expected: `plugin contract passed: ai-memory@0.1.0`.

Run with the provided proxy environment: `npx tsx scripts/plugin-memory-runtime-probe.ts`
Expected: `"passed": true`, `"platform": "win32"`, and `"packagedAsar": true`.

- [ ] **Step 3: Run real end-to-end Windows acceptance**

Run with the provided proxy environment: `npx tsx scripts/ai-memory-acceptance.ts --skip-agents`
Expected: `ok: true`, production five-tool HTTP calls, UI read/write interoperability, project isolation, deletion, audit redaction, and restart with the same data root all pass.

- [ ] **Step 4: Final review**

Run the complete test command from Task 3 again, then `git status --short` and `git diff --check`. Search AI Memory for stale `macOS Apple Silicon` and `platform: ['macOS']` text. Review every changed failure path against the operation contract. Do not modify the unrelated `node-window-manager` build issue.
