# Windows Helper Reliability Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining code-fixable Windows helper installation and diagnostics gaps.

**Architecture:** The installer launches the scheduled task as the original application user. A stable explicit key path and expected SID make the helper independent of the UAC approval account. Signed helper health provides pipe readiness and PID evidence; all layers propagate structured error metadata.

**Tech Stack:** TypeScript, Electron, Node net/child_process, PowerShell, Go, Windows Task Scheduler.

---

### Task 1: Define structured installer and health errors

**Files:**
- Modify: `src/shared/WindowsHelperState.ts`
- Modify: `src/shared/AppHelperCheck.ts`
- Modify: `scripts/windows-helper-state-test.ts`
- Modify: `scripts/windows-helper-check-test.ts`

- [ ] Add failing assertions for `stderr`, key errors, signature rejection,
  nonzero helper responses, and a health response that requires a positive PID.
- [ ] Run `yarn tsx scripts/windows-helper-state-test.ts` and
  `yarn tsx scripts/windows-helper-check-test.ts`; confirm the new assertions
  fail before implementation.
- [ ] Extend `AppHelperError`, IPC response construction, local key validation,
  and the two-request signed checker until both tests pass.

### Task 2: Bind key and task identity to the FlyEnv user

**Files:**
- Create: `src/shared/WindowsHelperIdentity.ts`
- Modify: `src/main/core/AppHelper.ts`
- Modify: `src/helper-go/main.go`
- Modify: `src/helper-go/utils/temp_path.go`
- Modify: `src/helper-go/utils/temp_path_test.go`
- Create: `scripts/windows-helper-identity-test.ts`

- [ ] Write failing tests for `whoami /user` CSV parsing, LOCALAPPDATA key
  selection, Go explicit key/SID argument parsing, and template substitution.
- [ ] Run the TypeScript and Go tests; confirm each fails because the explicit
  identity contract does not yet exist.
- [ ] Implement the identity module, `--key-path` / `--expected-user-sid`,
  expected-SID startup validation, and stable per-user default key path.

### Task 3: Make the installer transactional and task-driven

**Files:**
- Modify: `static/sh/Windows/flyenv-auto-start-now.ps1`
- Modify: `scripts/windows-helper-install-script-test.ts`

- [ ] Write failing source checks for post-write ACL inspection, original-user
  task principal/action validation, task invocation, and machine-readable
  installer failure codes.
- [ ] Run `yarn test:windows-helper-install`; confirm the source checks fail.
- [ ] Write the allow-roots file through a staged protected file, verify ACLs,
  preserve any previous file until staging succeeds, validate task action and
  principal after registration, and call `IRegisteredTask.Run` instead of
  directly running a helper under the UAC account.

### Task 4: Replace fixed waits and generic elevation errors

**Files:**
- Modify: `src/shared/Sudo.ts`
- Modify: `src/main/core/AppHelper.ts`
- Modify: `scripts/windows-app-helper-init-test.ts`
- Create: `scripts/windows-sudo-error-test.ts`

- [ ] Write failing tests for deadline/backoff retry preservation and Windows
  UAC, launch, and status-timeout categories.
- [ ] Run the tests and confirm they fail before production changes.
- [ ] Preserve stderr/exit code from elevated scripts, throw typed Sudo errors,
  classify installer markers, and wait up to the startup deadline for signed
  PID-plus-pipe health.

### Task 5: Add helper health and validate on Windows

**Files:**
- Modify: `src/helper-go/main.go`
- Modify: `src/helper-go/utils/whitelist.go`
- Create: `src/helper-go/utils/health_windows.go`
- Create: `src/helper-go/utils/health_other.go`
- Modify: `scripts/helper-version-sync-test.ts`

- [ ] Add a failing Go test for Windows allow-roots health validation and a
  signed `helper/health` response with version/PID/SID.
- [ ] Run Go tests and confirm the health contract is absent.
- [ ] Implement the health function, bump the synchronized helper version, and
  run all TypeScript/Go contract tests.
- [ ] Build the Windows helper and perform elevated real-Windows clean install,
  reinstall, and release/development binary replacement. Verify one task, one
  helper, matching SID, valid key path/ACL, and signed health output.
