# Windows Helper Per-User Instance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the Windows helper from one machine-wide instance into a complete instance per target Windows SID.

**Architecture:** The existing main-process `AppHelper` keeps ownership of installation and repair. TypeScript and Go derive the same 128-bit instance ID from the pre-elevation SID; an elevated PowerShell installer provisions a fixed binary, key, policy, metadata, task, and pipe namespace under that SID's protected ProgramData instance.

**Tech Stack:** TypeScript, PowerShell Task Scheduler COM API, Go, Windows named pipes and ACL APIs.

**Spec:** `docs/superpowers/specs/2026-09-14-windows-helper-per-user.md`

## Global Constraints

- Keep the accepted packaged-source/backup/pending/installed SHA-256 comparison; do not add publisher verification.
- Use one fixed helper executable per SID and do not retain or roll back old helper versions.
- The currently running FlyEnv version may replace the helper for its SID when the protocol differs.
- Rely on FlyEnv single-instance plus the existing `AppHelper` single-flight; do not add an OS install mutex.
- Do not change macOS or Linux behavior.
- Do not add renderer state, Pinia state, or `config.setup` persistence.
- Never modify another SID's helper task, process, files, key, or policy.

---

### Task 1: Shared SID instance identity

**Files:**

- Modify: `src/shared/WindowsHelperIdentity.ts`
- Modify: `scripts/windows-helper-identity-test.ts`
- Modify: `src/helper-go/utils/helper_identity.go`
- Modify: `src/helper-go/utils/helper_identity_test.go`

**Interfaces:**

- Produces TypeScript `windowsHelperInstanceId(sid)`, `windowsHelperInstancePaths(sid, programData?)`, and enriched `WindowsHelperIdentity`.
- Produces Go `WindowsHelperInstanceID(sid)` and `WindowsHelperInstancePaths(programData, sid)`.

- [x] Write TypeScript and Go tests that assert the same 32-character lowercase instance ID and canonical ProgramData paths.
- [x] Run the focused tests and verify they fail because the per-SID APIs do not exist.
- [x] Implement SHA-256 SID derivation, fixed instance paths, task folder/name, socket path, and full-SID validation.
- [x] Re-run the focused tests and verify they pass.

### Task 2: Go helper instance-bound runtime

**Files:**

- Modify: `src/helper-go/main.go`
- Modify: `src/helper-go/main_test.go`
- Modify: `src/helper-go/utils/whitelist.go`
- Modify: `src/helper-go/utils/allow_roots_windows.go`
- Modify: `src/helper-go/utils/health_windows_test.go`
- Modify: `src/helper-go/utils/helper_key_windows_test.go`

**Interfaces:**

- Consumes `WindowsHelperInstanceID` and `WindowsHelperInstancePaths` from Task 1.
- Produces Windows CLI `--instance-id <id> --expected-user-sid <sid>` and health fields `instanceId` and `sid`.

- [x] Write failing tests for missing/mismatched instance IDs, per-instance key and allowed-roots paths, pipe naming, and health identity.
- [x] Run focused Go tests and verify the new assertions fail for the expected machine-wide paths.
- [x] Replace arbitrary Windows key-path input with derived instance paths, configure allowed-roots before key/health access, and create the SID-scoped pipe.
- [x] Bump the helper protocol in Go and TypeScript together.
- [x] Re-run Go tests and vet.

### Task 3: Per-SID elevated installer

**Files:**

- Modify: `static/sh/Windows/flyenv-auto-start-now.ps1`
- Modify: `scripts/windows-helper-install-script-test.ts`
- Modify: `scripts/windows-helper-task-behavior-test.ps1`
- Modify: `scripts/windows-helper-cross-user-test.ts`

**Interfaces:**

- Consumes canonical identity paths serialized by `buildWindowsHelperInstallScript`.
- Produces `\FlyEnv\Helper\<instanceId>` with a SYSTEM action using only instance ID and expected SID.

- [x] Add failing structural and behavioral tests for the SID task folder, per-instance ACL/files, fixed binary atomic replacement, and absence of path-wide process termination.
- [x] Run the installer tests and confirm failure against the current machine-wide task/path.
- [x] Provision the protected per-SID directory, binary, key, allowed-roots and `instance.json`; stop/register/start only the current SID task.
- [x] Leave ambiguous and other-user legacy tasks untouched.
- [x] Re-run structural and elevated behavioral tests.

### Task 4: Main-process health and repair integration

**Files:**

- Modify: `src/shared/AppHelperCheck.ts`
- Modify: `src/shared/WindowsHelperIdentity.ts`
- Modify: `src/main/core/AppHelper.ts`
- Modify: `scripts/windows-helper-check-test.ts`
- Modify: `scripts/windows-app-helper-init-test.ts`

**Interfaces:**

- Consumes per-SID paths/task/pipe from Task 1 and health identity from Task 2.
- Produces current-SID task/fingerprint/health validation through the existing `AppHelper` lifecycle.

- [x] Add failing tests showing the checker uses the current SID's key, task, executable and pipe and rejects a mismatched health instance ID.
- [x] Run focused tests and verify failure against global paths.
- [x] Thread the captured identity through key reads, task reads, pipe requests and installer configuration without adding renderer state.
- [x] Re-run focused lifecycle tests.

### Task 5: Validation and result documentation

**Files:**

- Modify: `docs/task/windows-helper-cross-user-result.md`
- Modify: `docs/superpowers/plans/2026-09-14-windows-helper-per-user.md`

**Interfaces:**

- Consumes all prior tasks.
- Produces reproducible automated and manual verification evidence.

- [x] Run all Windows helper TypeScript scripts, helper contract checks, Go tests, Go vet, targeted lint/type checks, and the Windows helper build.
- [x] Run the production build path available in the workspace and distinguish new failures from existing repository failures.
- [x] Record exact dual-account manual steps for separate-admin UAC, simultaneous Alice/Bob sessions, logout/login, repair, and version replacement.
- [x] Verify the implementation against the automated acceptance items and mark completed plan steps; the real dual-account VM run remains a release validation item.
