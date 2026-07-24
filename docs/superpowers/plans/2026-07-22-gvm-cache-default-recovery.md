# GVM Cache and Default Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reuse the in-memory GVM list when switching tabs and prevent a deleted default GVM version from poisoning later commands or Go version detection through a stale `GOROOT`.

**Architecture:** Keep the existing module-level `GvmSetup.versions` array as the renderer cache and only perform the initial availability check when `installed` has not been resolved. Harden GVM action commands so they clear an invalid default environment, remove the default file after uninstalling the selected default, and probe each GVM-managed Go binary with its own installation directory as `GOROOT`.

**Tech Stack:** Vue 3 Composition API, TypeScript/TSX, Electron fork process, Bash-compatible GVM commands, Node assertion-based regression tests.

---

## File Structure

- Modify `scripts/go-gvm-test.ts`: add regression coverage for cached tab entry, stale-default cleanup, and GVM binary version probing.
- Modify `src/render/components/GoLang/gvm/index.vue`: reuse cached setup state on remount and avoid a duplicate refresh when closing a completed task.
- Modify `src/render/components/GoLang/gvm/command.ts`: sanitize stale GVM defaults and clean the default file after uninstalling the default version.
- Modify `src/render/components/GoLang/gvm/setup.ts`: pass the row's default state to command generation.
- Modify `src/fork/module/GoLang/gvm.ts`: build a version command that assigns the correct `GOROOT` for GVM-managed binaries.
- Modify `src/fork/module/GoLang/index.ts`: use the GVM-aware version command on macOS and Linux.

## Verified Installed-List Finding

No installed-list merge change is required. The existing regression fixture already merges and
marks two installed Go versions. The reported single installed entry matches the current GVM
filesystem and command output: `/Users/x/.gvm/gos` contains only `system`, and `gvm list` returns
only `system`. The stale `environments/default` file points to the already removed `go1.26.2`,
which is addressed by Tasks 2 and 3 rather than by synthesizing missing installed entries.

### Task 1: Cache GVM List Data Across Tab Remounts

**Files:**

- Test: `scripts/go-gvm-test.ts`
- Modify: `src/render/components/GoLang/gvm/index.vue`

- [ ] **Step 1: Add failing page lifecycle assertions**

Add these assertions after `gvmPageSource` is loaded:

```ts
assert.match(
  gvmPageSource,
  /if \(GvmSetup\.installed === undefined\) \{\s*GvmSetup\.checkGvm\(\)\s*\}/
)
const taskConfirmSource = gvmPageSource.match(
  /const taskConfirm = \(\) => \{[\s\S]*?\n  \}\n  const taskCancel/
)?.[0]
assert.ok(taskConfirmSource)
assert.doesNotMatch(taskConfirmSource, /GvmSetup\.checkGvm\(\)/)
```

- [ ] **Step 2: Verify the cache test fails**

Run:

```bash
yarn test:go-gvm
```

Expected: FAIL because the page calls `GvmSetup.checkGvm()` unconditionally and `taskConfirm` calls it again.

- [ ] **Step 3: Guard the initial load and remove the duplicate confirmation refresh**

Replace the top-level call in `src/render/components/GoLang/gvm/index.vue` with:

```ts
if (GvmSetup.installed === undefined) {
  GvmSetup.checkGvm()
}
```

Remove this line from `taskConfirm`:

```ts
GvmSetup.checkGvm()
```

The refresh button remains connected to `GvmSetup.fetchData()`. `installGvm` and `versionAction` retain their existing post-operation synchronization.

- [ ] **Step 4: Verify the cache test passes**

Run `yarn test:go-gvm`.

Expected: PASS with `go gvm tests passed`.

- [ ] **Step 5: Commit the cache change**

```bash
git add scripts/go-gvm-test.ts src/render/components/GoLang/gvm/index.vue
git commit -m "perf: cache GVM list across tab changes"
```

### Task 2: Recover From a Deleted Default GVM Version

**Files:**

- Test: `scripts/go-gvm-test.ts`
- Modify: `src/render/components/GoLang/gvm/command.ts`
- Modify: `src/render/components/GoLang/gvm/setup.ts`

- [ ] **Step 1: Add failing stale-default command tests**

Update the command expectations to require this guard after sourcing GVM:

```ts
const sanitizeInvalidDefault =
  'if [ -n "$GOROOT" ] && [ ! -d "$GOROOT" ]; then rm -f "$GVM_ROOT/environments/default"; unset GOROOT GOPATH GOBIN gvm_go_name gvm_pkgset_name; fi'

assert.equal(
  buildGvmVersionCommand('/Users/test/.gvm/scripts/gvm', 'install', 'go1.24.5'),
  `source '/Users/test/.gvm/scripts/gvm' && ${sanitizeInvalidDefault} && gvm install go1.24.5 -B`
)
assert.equal(
  buildGvmVersionCommand('/Users/test/.gvm/scripts/gvm', 'uninstall', 'go1.23.9'),
  `source '/Users/test/.gvm/scripts/gvm' && ${sanitizeInvalidDefault} && gvm uninstall go1.23.9`
)
assert.equal(
  buildGvmVersionCommand('/Users/test/.gvm/scripts/gvm', 'uninstall', 'go1.24.5', true),
  `source '/Users/test/.gvm/scripts/gvm' && ${sanitizeInvalidDefault} && gvm uninstall go1.24.5 && rm -f "$GVM_ROOT/environments/default"`
)
assert.equal(
  buildGvmVersionCommand('/Users/test/.gvm/scripts/gvm', 'default', 'go1.24.5'),
  `source '/Users/test/.gvm/scripts/gvm' && ${sanitizeInvalidDefault} && gvm use go1.24.5 --default`
)
```

Also assert that `setup.ts` passes `item.isDefault`:

```ts
assert.match(gvmSetupSource, /buildGvmVersionCommand\([\s\S]*?item\.name,[\s\S]*?item\.isDefault/)
```

- [ ] **Step 2: Verify the stale-default tests fail**

Run `yarn test:go-gvm`.

Expected: FAIL because the command builder has no invalid-default guard or `isDefault` parameter.

- [ ] **Step 3: Harden command generation**

In `src/render/components/GoLang/gvm/command.ts`, add:

```ts
const GVM_SANITIZE_INVALID_DEFAULT =
  'if [ -n "$GOROOT" ] && [ ! -d "$GOROOT" ]; then rm -f "$GVM_ROOT/environments/default"; unset GOROOT GOPATH GOBIN gvm_go_name gvm_pkgset_name; fi'
```

Change the function signature and command construction to:

```ts
export function buildGvmVersionCommand(
  initScript: string,
  action: GvmVersionAction,
  version: string,
  isDefault = false
): string {
  if (!isGvmVersionIdentifier(version)) {
    throw new Error(`Invalid GVM version: ${version}`)
  }
  const init = `source ${quotePosixShell(initScript)} && ${GVM_SANITIZE_INVALID_DEFAULT}`
  if (action === 'install') {
    return `${init} && gvm install ${version} -B`
  }
  if (action === 'uninstall') {
    const uninstall = `${init} && gvm uninstall ${version}`
    return isDefault
      ? `${uninstall} && rm -f "$GVM_ROOT/environments/default"`
      : uninstall
  }
  return `${init} && gvm use ${version} --default`
}
```

Pass the row state from `src/render/components/GoLang/gvm/setup.ts`:

```ts
const command = buildGvmVersionCommand(
  GvmSetup.initScript,
  action,
  item.name,
  item.isDefault
)
```

- [ ] **Step 4: Verify stale-default recovery passes**

Run `yarn test:go-gvm`.

Expected: PASS with all command strings safely quoted and the default cleanup present only when needed.

- [ ] **Step 5: Commit command recovery**

```bash
git add scripts/go-gvm-test.ts src/render/components/GoLang/gvm/command.ts src/render/components/GoLang/gvm/setup.ts
git commit -m "fix: recover from stale GVM default environment"
```

### Task 3: Isolate GVM Go Version Detection From Stale GOROOT

**Files:**

- Test: `scripts/go-gvm-test.ts`
- Modify: `src/fork/module/GoLang/gvm.ts`
- Modify: `src/fork/module/GoLang/index.ts`

- [ ] **Step 1: Add failing GVM version-command tests**

Import `buildGoVersionCommand` from `src/fork/module/GoLang/gvm.ts` and add:

```ts
assert.equal(
  buildGoVersionCommand(
    "/Users/Test O'Neil/.gvm/gos/go1.24.5/bin/go",
    "/Users/Test O'Neil/.gvm"
  ),
  "GOROOT='/Users/Test O'\\''Neil/.gvm/gos/go1.24.5' '/Users/Test O'\\''Neil/.gvm/gos/go1.24.5/bin/go' version"
)
assert.equal(
  buildGoVersionCommand('/opt/homebrew/bin/go', "/Users/Test O'Neil/.gvm"),
  "'/opt/homebrew/bin/go' version"
)
```

Add a source assertion that the Go module uses the helper:

```ts
assert.match(goLangSource, /buildGoVersionCommand\(bin, this\.gvmRoot\(\)\)/)
```

- [ ] **Step 2: Verify GOROOT-isolation tests fail**

Run `yarn test:go-gvm`.

Expected: FAIL because `buildGoVersionCommand` is not exported.

- [ ] **Step 3: Implement the GVM-aware version command**

In `src/fork/module/GoLang/gvm.ts`, extend the path imports and add:

```ts
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

export function buildGoVersionCommand(bin: string, gvmRoot: string): string {
  const resolvedBin = resolve(bin)
  const gosRoot = resolve(gvmRoot, 'gos')
  const relativeBin = relative(gosRoot, resolvedBin)
  const isManaged =
    relativeBin !== '..' && !relativeBin.startsWith(`..${sep}`) && !isAbsolute(relativeBin)
  const command = `${quotePosixShell(resolvedBin)} version`
  if (!isManaged) {
    return command
  }
  const goRoot = dirname(dirname(resolvedBin))
  return `GOROOT=${quotePosixShell(goRoot)} ${command}`
}
```

Import it in `src/fork/module/GoLang/index.ts` and replace the non-Windows version command with:

```ts
const command = isWindows()
  ? `"${bin}" version`
  : buildGoVersionCommand(bin, this.gvmRoot())
```

- [ ] **Step 4: Verify GVM version detection passes**

Run `yarn test:go-gvm`.

Expected: PASS, including paths containing spaces and apostrophes.

- [ ] **Step 5: Run final verification**

```bash
npx eslint scripts/go-gvm-test.ts src/render/components/GoLang/gvm/index.vue src/render/components/GoLang/gvm/command.ts src/render/components/GoLang/gvm/setup.ts src/fork/module/GoLang/gvm.ts src/fork/module/GoLang/index.ts
npx vue-tsc --noEmit
git diff --check
```

Expected: all commands exit with code 0.

- [ ] **Step 6: Commit version detection and verify the branch**

```bash
git add scripts/go-gvm-test.ts src/fork/module/GoLang/gvm.ts src/fork/module/GoLang/index.ts
git commit -m "fix: isolate GVM version detection GOROOT"
yarn test:go-gvm
git status --short
```

Expected: the GVM test passes and the worktree is clean.
