# Windows PATH Write Semantics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Windows PATH writes transparent to user-provided entries while giving activated FlyEnv services explicit, local precedence and ensuring new child processes receive fresh registry PATH data.

**Architecture:** Treat `tools/setSystemPath` as a generic ordered PATH writer, not a FlyEnv PATH validator. Add lossless PATH-entry utilities for version activation, which prepend only FlyEnv's explicit entries and preserve the rest. Carry an optional raw PATH snapshot through the IPC/helper contract to detect stale writes; keep `setSystemEnv` and `otherVars` validation unchanged.

**Tech Stack:** TypeScript, Vue 3, Electron fork IPC, Go `x/sys/windows/registry`, PowerShell UAC fallback, Node `assert`, Go `testing`.

---

### Task 1: Add lossless Windows PATH utilities and regression tests

**Files:**
- Modify: `src/fork/util/PATH.win.ts:1-205`
- Create: `scripts/windows-path-write-test.ts`

- [ ] **Step 1: Write failing tests for lossless parsing and local priority merge**

```ts
import assert from 'node:assert/strict'
import {
  joinWindowsPathEntries,
  mergeWindowsPathPriority,
  splitWindowsPathEntries
} from '../src/fork/util/PATH.win'

const legacy = [
  '%INTEL_DEV_REDIST%redist\\intel64\\compiler',
  '',
  '.\\tooling\\bin',
  'C:\\Tools',
  'C:\\FlyEnv\\env\\apache\\bin'
]
assert.deepEqual(splitWindowsPathEntries(legacy.join(';')), legacy)
assert.equal(joinWindowsPathEntries(legacy), legacy.join(';'))
assert.deepEqual(
  mergeWindowsPathPriority(legacy, ['C:\\FlyEnv\\env\\apache\\bin', 'C:\\FlyEnv\\env\\apache']),
  [
    'C:\\FlyEnv\\env\\apache\\bin',
    'C:\\FlyEnv\\env\\apache',
    '%INTEL_DEV_REDIST%redist\\intel64\\compiler',
    '',
    '.\\tooling\\bin',
    'C:\\Tools'
  ]
)
```

- [ ] **Step 2: Run the test and verify it fails because the new utilities do not exist**

Run: `yarn tsx scripts/windows-path-write-test.ts`

Expected: TypeScript reports that one or more imported utility functions do not exist.

- [ ] **Step 3: Replace lossy parsing and global sorting with explicit utilities**

Add the following exported helpers to `src/fork/util/PATH.win.ts`; remove `handleWinPathArr` and every call to it.

```ts
export const splitWindowsPathEntries = (raw: string) => raw.split(';')

export const joinWindowsPathEntries = (entries: readonly string[]) => entries.join(';')

const windowsPathEntryKey = (entry: string) =>
  win32.normalize(entry).replaceAll('/', '\\').toLocaleLowerCase()

export const mergeWindowsPathPriority = (legacy: readonly string[], preferred: readonly string[]) => {
  const preferredKeys = new Set<string>()
  const orderedPreferred: string[] = []
  for (const entry of preferred) {
    const key = windowsPathEntryKey(entry)
    if (!preferredKeys.has(key)) {
      preferredKeys.add(key)
      orderedPreferred.push(entry)
    }
  }
  return [...orderedPreferred, ...legacy.filter((entry) => !preferredKeys.has(windowsPathEntryKey(entry)))]
}
```

Import `win32` from `node:path`. Keep empty strings in the parsed array. Do not call `trim`, `filter`, `Set`, or `sort` on legacy entries. Replace the current broad `stdout.trim()` operation with removal of only PowerShell's final output newline before parsing. Change the Go and fallback writers later in this plan to use `joinWindowsPathEntries` semantics: no automatic trailing `;`.

- [ ] **Step 4: Add a raw snapshot loader**

Add and export a snapshot type and loader next to `readSystemPathDirect`:

```ts
export type WindowsPathSnapshot = { rawPath: string; entries: string[] }

export const fetchRawPATHSnapshot = async (): Promise<WindowsPathSnapshot> => {
  const rawPath = await readSystemPathDirect()
  return { rawPath, entries: splitWindowsPathEntries(rawPath) }
}
```

Make `fetchRawPATH()` resolve `snapshot.entries` so existing read-only callers retain their current result type. Remove the `!str.includes(':\\') && !str.includes('%')` early return, because relative entries are valid data for the PATH editor.

- [ ] **Step 5: Run the regression test**

Run: `yarn tsx scripts/windows-path-write-test.ts`

Expected: PASS; the Intel entry, empty entry, relative entry, and non-FlyEnv order are unchanged, while the selected Apache paths are first.

- [ ] **Step 6: Commit the utility change**

```bash
git add src/fork/util/PATH.win.ts scripts/windows-path-write-test.ts
git commit -m "fix: preserve Windows PATH entries during priority updates"
```

### Task 2: Make service activation and removal use local priority merges

**Files:**
- Modify: `src/fork/module/Tool.win/path.ts:1-390`
- Test: `scripts/windows-path-write-test.ts`

- [ ] **Step 1: Extend the failing test with removal-boundary cases**

Add assertions for an exported `isFlyEnvManagedPathEntry` helper. It must match a path inside `C:\\FlyEnv\\env\\apache` and reject similarly named user paths.

```ts
assert.equal(
  isFlyEnvManagedPathEntry('C:\\FlyEnv\\env\\apache\\bin', ['C:\\FlyEnv\\env\\apache']),
  true
)
assert.equal(
  isFlyEnvManagedPathEntry('C:\\Tools\\my-env\\apache', ['C:\\FlyEnv\\env\\apache']),
  false
)
```

- [ ] **Step 2: Run the test and verify the boundary helper is missing**

Run: `yarn tsx scripts/windows-path-write-test.ts`

Expected: FAIL because `isFlyEnvManagedPathEntry` is not exported.

- [ ] **Step 3: Implement directory-boundary matching for known FlyEnv roots**

In `src/fork/module/Tool.win/path.ts`, import `win32` from `node:path` and add a helper that accepts only absolute entries, normalizes with `win32.resolve`, and tests containment with `win32.relative`:

```ts
const isPathInside = (candidate: string, root: string) => {
  const relative = win32.relative(win32.resolve(root), win32.resolve(candidate))
  return relative === '' || (!relative.startsWith(`..${win32.sep}`) && relative !== '..' && !win32.isAbsolute(relative))
}
```

Resolve links only when both candidate and root exist. Never use `includes()` or `startsWith()` to decide whether a user entry is removable. Restrict candidate roots to the generated env junction directory and the selected FlyEnv installation root.

- [ ] **Step 4: Replace global PATH mutation in `updatePATH`, `removePATH`, and `addPath`**

For each operation, load one `WindowsPathSnapshot`, make the existing junction/file changes, then build an explicit preferred list. Sort only the generated FlyEnv junction names case-insensitively to make their priority deterministic. For a service junction, append existing directories in this exact order: `bin`, `sbin`, then the service root. Apply:

```ts
const nextEntries = mergeWindowsPathPriority(legacyEntriesAfterManagedRemoval, preferredEntries)
await writePath(nextEntries, otherVars, snapshot.rawPath)
```

`removePATH` has no preferred list; remove only its proven FlyEnv roots and write the untouched remaining list. `addPath(dir)` uses `mergeWindowsPathPriority(snapshot.entries, [dir])`. Do not run `handleWinPathArr`, move the first absolute path, deduplicate legacy items, or sort by path category. Remove the composer special case that deletes `%COMPOSER_HOME%\\vendor\\bin` or `%APPDATA%\\Composer\\vendor\\bin` from legacy PATH data; those are user entries, not FlyEnv-managed roots.

- [ ] **Step 5: Retry a version write exactly once after a stale-snapshot error**

Export `isSystemPathChangedError(error)` from `PATH.win.ts`, matching the stable `system_path_changed` message. Wrap only version activation/removal and automatic `addPath` writes in a two-attempt loop: re-read the snapshot, rebuild the managed removal and preferred list, then retry once. Let the second conflict reject unchanged.

- [ ] **Step 6: Run the PATH regression test**

Run: `yarn tsx scripts/windows-path-write-test.ts`

Expected: PASS; promoted entries are first, only matching promoted entries are removed, and user entries remain in their original order.

- [ ] **Step 7: Commit the version-path merge change**

```bash
git add src/fork/module/Tool.win/path.ts src/fork/util/PATH.win.ts scripts/windows-path-write-test.ts
git commit -m "fix: prioritize active Windows service paths locally"
```

### Task 3: Make the privileged PATH writer transparent and conflict-aware

**Files:**
- Modify: `src/fork/Helper.ts:105-130`
- Modify: `src/helper-go/contract/helper-contract.json:138-145`
- Modify: `src/helper-go/main.go:859-894`
- Modify: `src/helper-go/module/tool.go:476-508`
- Modify: `src/helper-go/module/tool_windows.go:18-52`
- Modify: `src/helper-go/utils/whitelist.go:720-746`
- Modify: `src/helper-go/utils/whitelist_test.go:97-124`
- Modify: `src/shared/WindowsHelperFallback.ts:44-48,357-410,489-512,584-675`
- Modify: `scripts/windows-helper-fallback-plan-test.ts`
- Modify: `scripts/windows-helper-send-test.ts`
- Test: `scripts/helper-contract-check.ts`

- [ ] **Step 1: Write failing Go payload tests**

Replace `TestValidateSystemPathEntry` with tests for a structural-only helper:

```go
func TestValidateSystemPathPayload(t *testing.T) {
  valid := []string{
    `%INTEL_DEV_REDIST%redist\intel64\compiler`,
    `..\tooling\bin`,
    `$env:SDK\bin`,
    `\\server\share\bin`,
    ``,
  }
  if err := ValidateSystemPathPayload(valid); err != nil { t.Fatal(err) }
  if err := ValidateSystemPathPayload([]string{"safe\x00value"}); err == nil {
    t.Fatal("embedded NUL must be rejected")
  }
}
```

- [ ] **Step 2: Run Go tests and verify the new validator is missing**

Run: `yarn test:helper:go`

Expected: FAIL because `ValidateSystemPathPayload` does not exist.

- [ ] **Step 3: Implement structural validation and raw conflict comparison in Go**

Add this helper in `src/helper-go/utils/whitelist.go` and remove the `ValidateSystemPathEntry` call path:

```go
func ValidateSystemPathPayload(paths []string) error {
  for index, entry := range paths {
    if strings.ContainsRune(entry, '\x00') {
      return fmt.Errorf("PATH entry %d contains NUL", index)
    }
  }
  return nil
}
```

Change `ToolManager.SetSystemPath` to accept `expectedPath *string`. Before joining entries, call `ValidateSystemPathPayload`. When `expectedPath != nil`, read the unexpanded registry `Path`; if it differs byte-for-byte, return `errors.New("system_path_changed")`. Join with `strings.Join(paths, ";")` without appending `;`, then write it as `REG_EXPAND_SZ`.

Add an explicit raw registry getter in `tool_windows.go` using `registry.GetStringValue`, and use it for both `GetSystemPath` and the comparison. Keep `SetSystemEnv` and `otherVars` validation unchanged.

- [ ] **Step 4: Extend the helper contract and dispatch**

Make the third contract argument optional:

```json
{ "name": "expectedPath", "type": "string", "optional": true }
```

Update `main.go` to accept two or three arguments, require a string when the third is present, and pass `nil` or `&expectedPath` to `SetSystemPath`. Update the matching TypeScript call type only as needed for the optional argument.

- [ ] **Step 5: Exempt only PATH arrays from the generic sender traversal check**

Change `Helper.validateSendArgs` so it skips only argument zero for this exact operation:

```ts
if (module === 'tools' && fn === 'setSystemPath' && index === 0) continue
```

Keep traversal checks for every other helper method. Add a `windows-helper-send-test.ts` assertion that `setSystemPath` accepts `['..\\tooling\\bin']`, and an assertion that `writeFileByRoot` with traversal remains rejected.

- [ ] **Step 6: Update the UAC fallback with the same contract**

Add `expectedPath?: string` to `ValidatedSetSystemPathArgs`. Use a new PATH-only validator that rejects only embedded NUL; do not reuse `validatePathLikeEnvEntry`, which remains necessary for `otherVars` and `setSystemEnv`.

In `buildSetSystemPathScript`, read the raw registry value with `RegistryValueOptions.DoNotExpandEnvironmentNames` when `expectedPath` is provided:

```powershell
if ($currentPath -cne $expectedPath) {
  throw 'system_path_changed'
}
$pathValue = [string]::Join(';', [string[]]$paths)
```

Remove `Where-Object` and the automatic `+ ';'`. Add fallback-plan tests for the original Intel string, a relative string, an empty string, an embedded-NUL rejection, literal quote escaping, and a script containing the raw conflict check.

- [ ] **Step 7: Run helper tests**

Run:

```bash
yarn test:helper:contract
yarn test:helper:go
yarn tsx scripts/windows-helper-fallback-plan-test.ts
yarn tsx scripts/windows-helper-send-test.ts
```

Expected: all commands PASS; the only rejected PATH payload case is embedded NUL.

- [ ] **Step 8: Commit the helper-boundary change**

```bash
git add src/fork/Helper.ts src/helper-go/contract/helper-contract.json src/helper-go/main.go src/helper-go/module/tool.go src/helper-go/module/tool_windows.go src/helper-go/utils/whitelist.go src/helper-go/utils/whitelist_test.go src/shared/WindowsHelperFallback.ts scripts/windows-helper-fallback-plan-test.ts scripts/windows-helper-send-test.ts
git commit -m "fix: allow transparent Windows PATH writes"
```

### Task 4: Add stale-save handling to the System Environment editor

**Files:**
- Modify: `src/fork/module/Tool.win/path.ts:338-390`
- Modify: `src/render/components/Tools/SystenEnv/setup.ts:1-90`
- Modify: `scripts/windows-path-write-test.ts`

- [ ] **Step 1: Write a failing snapshot-shape test**

Add a test for the fork response shape:

```ts
assert.deepEqual(buildEnvPathListing('A;B'), {
  rawPath: 'A;B',
  entries: ['A', 'B']
})
```

- [ ] **Step 2: Run the test and verify the listing builder is missing**

Run: `yarn tsx scripts/windows-path-write-test.ts`

Expected: FAIL because `buildEnvPathListing` is not exported.

- [ ] **Step 3: Return and retain the raw snapshot**

Make `envPathList` resolve `{ rawPath, list }`, where `list` is the existing display-item array and `rawPath` is from `fetchRawPATHSnapshot`. Make `envPathUpdate(arr, expectedPath)` pass the snapshot to `writePath`.

Add `rawPath: string` to the Vue setup state. On fetch, set it from `res.data.rawPath`; on save, send it with the displayed ordered path list. On a `system_path_changed` response, immediately refetch the list and show: `The system PATH changed outside FlyEnv. It has been reloaded; review and save again.` Do not retry a manual user edit automatically.

- [ ] **Step 4: Run the PATH test**

Run: `yarn tsx scripts/windows-path-write-test.ts`

Expected: PASS; the editor snapshot is carried to writes and its displayed order is unchanged.

- [ ] **Step 5: Commit the editor conflict handling**

```bash
git add src/fork/module/Tool.win/path.ts src/render/components/Tools/SystenEnv/setup.ts scripts/windows-path-write-test.ts
git commit -m "fix: detect stale Windows PATH editor saves"
```

### Task 5: Use fresh registry PATH data for child-process environment sync

**Files:**
- Modify: `src/shared/EnvSyncLocal.ts:210-255`
- Modify: `scripts/windows-env-sync-script-test.ts`

- [ ] **Step 1: Add a failing fresh-PATH test**

Extract and export a pure builder that receives the registry-derived PATH and the required FlyEnv bootstrap entries. Test that an inherited startup PATH is not an input:

```ts
assert.equal(
  buildWindowsSyncedPath('C:\\New;C:\\Tools', ['C:\\Windows\\System32']),
  'C:\\Windows\\System32;C:\\New;C:\\Tools'
)
```

The test must also assert that `src/shared/EnvSyncLocal.ts` no longer contains the loop that appends `process.env[key]?.split(';')` to Windows PATH entries.

- [ ] **Step 2: Run the test and verify it fails**

Run: `yarn tsx scripts/windows-env-sync-script-test.ts`

Expected: FAIL because `buildWindowsSyncedPath` does not exist and the inherited-process loop remains.

- [ ] **Step 3: Implement fresh-PATH selection**

Add `buildWindowsSyncedPath(registryPath, bootstrapEntries)` in `EnvSyncLocal.ts`. It prepends FlyEnv's existing Podman/PowerShell/System32 bootstrap entries and then appends only the PATH returned by `getWindowsAllEnv`; it does not read or append `process.env.PATH` after a successful registry fetch. Retain the existing `stringEnv(process.env)` fallback when the PowerShell read or JSON parsing fails.

Use the helper in `fetchWindows`. Keep its cache invalidation call after `setSystemPath` unchanged so the next sync reads the newly written registry value.

- [ ] **Step 4: Run the EnvSync test**

Run: `yarn tsx scripts/windows-env-sync-script-test.ts`

Expected: PASS; fresh registry PATH is authoritative and Unix PATH behavior remains unchanged.

- [ ] **Step 5: Commit the sync fix**

```bash
git add src/shared/EnvSyncLocal.ts scripts/windows-env-sync-script-test.ts
git commit -m "fix: refresh Windows PATH from registry"
```

### Task 6: Verify the integrated Windows PATH flow

**Files:**
- Modify: `docs/superpowers/specs/2026-07-26-windows-path-write-design.md` only if acceptance evidence requires a correction
- Test: all tests from Tasks 1-5

- [ ] **Step 1: Run the complete host-independent suite**

Run:

```bash
yarn test:helper
yarn tsx scripts/windows-helper-fallback-plan-test.ts
yarn tsx scripts/windows-helper-send-test.ts
yarn tsx scripts/windows-path-write-test.ts
yarn tsx scripts/windows-env-sync-script-test.ts
```

Expected: every command PASS.

- [ ] **Step 2: Run the Windows elevated helper suite**

Run on Windows from an elevated PowerShell:

```powershell
yarn test:helper:admin
```

Expected: PASS. The Go helper can read and write the machine PATH with the optional snapshot argument.

- [ ] **Step 3: Perform the Windows manual acceptance scenario**

1. Set `INTEL_DEV_REDIST` to a value ending in `\`.
2. Add `%INTEL_DEV_REDIST%redist\intel64\compiler` to the machine PATH unchanged.
3. In FlyEnv, select an Apache version.
4. Confirm the switch succeeds and the Intel entry is textually unchanged in the registry PATH.
5. Launch a new FlyEnv terminal and run `where httpd`; confirm the selected Apache version is first.
6. Open the System Environment PATH editor in FlyEnv, reorder two ordinary user entries, save, and confirm their order is exactly retained.
7. Modify PATH from Windows while the FlyEnv editor is open; saving from FlyEnv must refresh with the conflict message rather than overwrite the external change.

- [ ] **Step 4: Inspect the final diff**

```bash
git diff --check
git status --short
```

Expected: `git diff --check` reports no whitespace errors and the working tree is clean because each completed task was committed.
