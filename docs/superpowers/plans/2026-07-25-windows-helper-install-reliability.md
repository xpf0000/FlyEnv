# Windows Helper Installer Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Windows helper installation fail closed when its trusted allow-roots state or startup cannot be established, while preserving actionable status for the caller.

**Architecture:** Keep the helper protocol unchanged. Harden the elevated PowerShell installer as the owner of allow-roots creation, task replacement, and immediate process startup validation. Make the main-process IPC return the actual install outcome rather than an unconditional acknowledgement, and cover all host-independent behavior with TypeScript source and unit-style tests.

**Tech Stack:** TypeScript, Electron IPC, PowerShell, Node `assert`, Yarn/tsx.

---

## Priority coverage

| Priority | Requirement | Implementation and verification |
| --- | --- | --- |
| P0 | Do not continue after secure allow-roots setup fails. | Task 2 makes ACL/reparse/write errors fatal; Task 4 checks NTFS ACLs on Windows. |
| P0 | Do not acknowledge a failed helper installation. | Task 3 returns a structured success/failure result and locks it with an IPC regression. |
| P1 | Distinguish a missing helper binary from a repairable running-helper failure. | Existing `AppHelperCheck`/`AppHelper` structured errors are covered by `windows-helper-check-test.ts` and `windows-helper-state-test.ts`. |
| P1 | Make replacement process and scheduled-task state observable and fail closed. | Task 2 waits for old processes, checks new-process liveness, replaces both task names, and confirms registration. |
| P1 | Reject partial installer inputs/state. | Task 2 validates the helper binary and data path, requires roots, and rolls back newly created process/task state. |
| P2 | Keep installer and Go helper ProgramData behavior identical. | Tasks 1–2 lock the exact unset-or-empty fallback rule. |
| P2 | Verify Windows-only OS integration rather than inferring it from source tests. | Task 4.2–4.6 is the required elevated acceptance procedure. |

### Task 1: Specify the hardened installer contract with failing source checks

**Files:**
- Create: `scripts/windows-helper-install-script-test.ts`
- Modify: `package.json`
- Test: `scripts/windows-helper-install-script-test.ts`

- [ ] **Step 1: Write failing checks for critical installer requirements**

```ts
assert.match(source, /\$ErrorActionPreference\s*=\s*'Stop'/)
assert.match(
  helperWhitelistSource,
  /programData := os\.Getenv\("ProgramData"\)\s+if programData == ""/
)
assert.doesNotMatch(source, /\[string\]::IsNullOrWhiteSpace\(\$programData\)/)
assert.match(source, /if \(\$null -eq \$programData -or \$programData -eq ""\) \{/)
assert.match(source, /Test-Path -LiteralPath \$exePath -PathType Leaf/)
assert.match(source, /Start-Process -FilePath \$exePath -WindowStyle Hidden -PassThru/)
assert.match(source, /DeleteTask\(\$existingTaskName, 0\)/)
assert.match(source, /Failed to lock allowed roots file permissions/)
```

- [ ] **Step 2: Run the test and confirm it fails against the current script**

Run: `PATH="../../node_modules/.bin:$PATH" tsx scripts/windows-helper-install-script-test.ts`

Expected: failure because the current installer lacks fail-fast mode, the
Go-compatible ProgramData rule, process validation, and correct legacy-task
deletion.

- [ ] **Step 3: Add the focused Yarn script**

```json
"test:windows-helper-install": "tsx scripts/windows-helper-install-script-test.ts"
```

- [ ] **Step 4: Run the failing test through Yarn**

Run: `PATH="../../node_modules/.bin:$PATH" yarn test:windows-helper-install`

Expected: the same meaningful failure.

### Task 2: Harden the elevated PowerShell installer

**Files:**
- Modify: `static/sh/Windows/flyenv-auto-start-now.ps1:1-118`
- Test: `scripts/windows-helper-install-script-test.ts`

- [ ] **Step 1: Implement fail-fast, canonical ProgramData resolution, and protected allow-roots creation**

```powershell
$ErrorActionPreference = 'Stop'
$programData = $env:ProgramData
if ($null -eq $programData -or $programData -eq '') { $programData = 'C:\\ProgramData' }
$allowDir = Join-Path $programData 'FlyEnv'
```

Create and ACL-protect the directory and file as mandatory operations. Reject reparse points, require a non-empty root list, and throw if any ACL step fails so the outer handler returns exit code 1.

- [ ] **Step 2: Replace existing helper safely and validate immediate startup**

```powershell
$helperProcess = Start-Process -FilePath $exePath -WindowStyle Hidden -PassThru
Start-Sleep -Milliseconds 500
$helperProcess.Refresh()
if ($helperProcess.HasExited) { throw "FlyEnv helper exited during startup" }
```

Verify the helper binary with `Test-Path -PathType Leaf`, stop matching old helpers with `-ErrorAction Stop`, wait for them to exit, and stop the newly launched helper from the outer catch if a later task-registration operation fails.

- [ ] **Step 3: Correct legacy scheduled-task replacement and verify the new registration**

```powershell
foreach ($existingTaskName in @($taskName, 'flyenv-helper')) {
  try { $rootFolder.DeleteTask($existingTaskName, 0) } catch {}
}
$registeredTask = $rootFolder.GetTask($taskName)
if (-not $registeredTask) { throw "Scheduled task was not registered" }
```

- [ ] **Step 4: Run source checks**

Run: `PATH="../../node_modules/.bin:$PATH" yarn test:windows-helper-install`

Expected: PASS.

### Task 3: Propagate the actual installer result over IPC

**Files:**
- Modify: `src/main/core/IPCHandler.ts:534-540`
- Create: `scripts/windows-helper-install-ipc-test.ts`
- Modify: `package.json`
- Test: `scripts/windows-helper-install-ipc-test.ts`

- [ ] **Step 1: Write a failing source-level regression test**

```ts
assert.doesNotMatch(source, /AppHelper\.initHelper\(\)\s*\.catch\(\)\s*\.finally/)
assert.match(source, /\{ code: 0, data: true \}/)
assert.match(source, /buildHelperCheckResponse\(error\)/)
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `PATH="../../node_modules/.bin:$PATH" tsx scripts/windows-helper-install-ipc-test.ts`

Expected: failure because the handler currently acknowledges success unconditionally.

- [ ] **Step 3: Return success only after `AppHelper.initHelper()` resolves, and return `buildHelperCheckResponse(error)` on failure**

```ts
AppHelper.initHelper()
  .then(() => this.sendToMainWindow(command, key, { code: 0, data: true }))
  .catch((error) => this.sendToMainWindow(command, key, buildHelperCheckResponse(error)))
```

- [ ] **Step 4: Run the IPC regression test and existing helper-init test**

Run: `PATH="../../node_modules/.bin:$PATH" yarn test:windows-helper-install-ipc && tsx scripts/windows-app-helper-init-test.ts`

Expected: PASS.

### Task 4: Verify contract and prepare Windows acceptance

**Files:**
- Modify: `docs/superpowers/plans/2026-07-25-windows-helper-install-reliability.md`

- [ ] **Step 1: Run host-independent checks**

Run: `PATH="../../node_modules/.bin:$PATH" yarn test:windows-helper-install && PATH="../../node_modules/.bin:$PATH" yarn test:windows-helper-install-ipc && PATH="../../node_modules/.bin:$PATH" yarn test:helper:contract && PATH="../../node_modules/.bin:$PATH" tsx scripts/windows-app-helper-init-test.ts`

Expected: PASS. `yarn test:helper:go` is not run locally because the available Go 1.23.3 does not meet the project minimum of Go 1.24.5.

- [ ] **Step 2: Prepare a disposable Windows test installation**

Use a Windows development or test machine, not a production FlyEnv setup. Open
an elevated PowerShell in the repository root. Confirm the helper will use the
normal system ProgramData location:

```powershell
if ([string]::IsNullOrEmpty($env:ProgramData)) { throw 'ProgramData is unexpectedly empty' }
$allowFile = Join-Path $env:ProgramData 'FlyEnv\flyenv.allowed-roots'
Write-Host "Expected allow-roots file: $allowFile"
```

Expected: the command prints a location under `C:\ProgramData` or the
machine's configured ProgramData root. Do not set `ProgramData` to `%TEMP%`;
temporary storage is not a valid security-configuration location.

- [ ] **Step 3: Run the Windows-only automated checks**

```powershell
yarn test:helper:admin
yarn test:windows-helper-install
yarn test:windows-helper-install-ipc
yarn test:helper:contract
```

Expected: every command exits with code 0. `test:helper:admin` requests UAC if
needed and requires Go 1.24.5 or newer (or the bundled Go specified by the
test script).

- [ ] **Step 4: Exercise installation twice through FlyEnv**

From the FlyEnv Windows development build, use the helper install/fix action
twice. The first invocation may show UAC. The second must complete without
creating duplicate tasks or leaving a second helper process.

Expected: FlyEnv reports success only after the helper is reachable; a missing
binary reports failure rather than opening a command that references a
nonexistent executable.

- [ ] **Step 5: Inspect the security state and restart behavior**

Run the following in the same elevated PowerShell after the second install:

```powershell
$allowFile = Join-Path $env:ProgramData 'FlyEnv\flyenv.allowed-roots'
Test-Path -LiteralPath $allowFile -PathType Leaf
Get-Content -LiteralPath $allowFile
icacls $allowFile
icacls (Split-Path -Parent $allowFile)
Get-ScheduledTask -TaskName FlyEnvHelperTask
Get-ScheduledTask -TaskName flyenv-helper -ErrorAction SilentlyContinue
Get-Process flyenv-helper* -ErrorAction SilentlyContinue
```

Expected: the file exists below `%ProgramData%\FlyEnv`; its content lists only
the FlyEnv data directory and the helper directory; `Administrators` and
`SYSTEM` have write/full control while ordinary users do not; exactly one
`FlyEnvHelperTask` exists; no legacy `flyenv-helper` task exists; and one
helper process is present. Restart FlyEnv and perform a normal helper-backed
operation to confirm the running helper remains usable.

- [ ] **Step 6: Preserve evidence on a failure**

Capture the FlyEnv debug log, the full UAC/PowerShell output, the output of the
commands in Step 5, and the exit code of the failed command. Do not manually
weaken the ProgramData ACL or move the allow-roots file to a temporary
directory; those changes invalidate the test and remove the security boundary.
