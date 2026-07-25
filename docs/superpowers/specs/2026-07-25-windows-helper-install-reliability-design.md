# Windows Helper Installer Reliability Design

## Context

The Windows helper reads its trusted allow-roots file from
`%ProgramData%\FlyEnv\flyenv.allowed-roots`. The elevated installer creates
that file, protects it with an ACL, starts the helper, and creates the
`FlyEnvHelperTask` scheduled task.

The helper's Go path rule is intentionally simple: use `ProgramData` exactly
as supplied, and use `C:\ProgramData` only when `os.Getenv("ProgramData")`
returns an empty string. The installer must make the same decision. A previous
installer condition treated whitespace-only values as absent, which could make
the installer and helper select different allow-roots paths.

## Goals

1. Keep the allow-roots configuration in ProgramData, not a temporary
   directory. The file defines a security boundary and must survive restarts;
   its directory and file are ACL-protected.
2. Make the installer and Go helper resolve the allow-roots path identically.
3. Fail the installation when the helper binary, allow-roots ACL, immediate
   startup, or scheduled-task registration cannot be established.
4. Return the actual installation outcome over IPC rather than acknowledging
   success before the installer finishes.
5. Provide a repeatable Windows acceptance procedure without changing the Go
   helper protocol or non-Windows behavior.

## Non-goals

- Do not store the allow-roots configuration in `%TEMP%` or `os.TempDir()`.
- Do not change the Go helper's existing `ProgramData` contract.
- Do not automatically repair an invalid non-empty `ProgramData` value. Both
  components use it and fail closed if it cannot be used safely.
- Do not modify macOS or Linux helper installation.

## Path-resolution contract

The authoritative helper rule in `src/helper-go/utils/whitelist.go` is:

```go
programData := os.Getenv("ProgramData")
if programData == "" {
    programData = `C:\ProgramData`
}
```

The installer mirrors it with PowerShell:

```powershell
$programData = $env:ProgramData
if ($null -eq $programData -or $programData -eq "") {
  $programData = "C:\ProgramData"
}
```

`$null` covers an unset process environment variable; `""` covers an empty
one. A non-empty string, including whitespace-only input, is not normalized or
replaced. This is deliberate: changing it only in the installer would recreate
the split-path bug. On ordinary Windows installations, `ProgramData` is set to
the system common-application-data directory.

## Installer flow

1. Verify the packaged helper binary is a file. If it is missing, fail before
   generating a runnable installation command.
2. Resolve the allow-roots directory using the path-resolution contract.
3. Reject reparse points, create the directory if needed, write the two trusted
   roots (FlyEnv data directory and helper directory), and enforce protected
   directory/file ACLs. Any failure aborts the installer.
4. Stop a previous same-name helper process and wait for it to exit.
5. Start the replacement helper, wait briefly, and fail if it exits.
6. Replace both `FlyEnvHelperTask` and the legacy `flyenv-helper` task, then
   confirm the new task can be read back.
7. Report the final result through `AppHelper.initHelper()` and its IPC caller.

## Error handling and safety

- `$ErrorActionPreference = 'Stop'` makes unhandled PowerShell failures reach
  the outer `catch`, which exits non-zero.
- If the installer fails after it has started a new helper or registered a new
  task, it removes that newly-created state before returning failure.
- The helper's missing-binary state is structured as
  `helper_binary_missing`; it does not manufacture an install command pointing
  at a missing executable.
- The allow-roots directory and file are both checked for reparse points and
  are accessible for writes only by Administrators and SYSTEM; the installing
  user receives read-only access.

## Verification strategy

Host-independent source/contract tests protect the error flow and exact path
contract. Windows acceptance then executes the Go helper tests under elevation,
runs the source regression, invokes FlyEnv helper installation twice, and
checks the task, file location, ACL, helper process, and restart behavior. The
detailed commands and expected results are in
`docs/superpowers/plans/2026-07-25-windows-helper-install-reliability.md`.

## P0–P2 closure matrix

| Priority | Failure mode | Closure | Evidence |
| --- | --- | --- | --- |
| P0 | Allow-roots ACL/write failure was logged and installation continued, leaving the helper to read an unusable or unsafe trust configuration. | The installer is fail-fast; reparse points are rejected; directory/file ACL setup failures throw and return a non-zero installation result. | `test:windows-helper-install`; Windows ACL inspection in the acceptance plan. |
| P0 | The helper-install IPC handler sent success even after `AppHelper.initHelper()` rejected. | IPC returns `{ code: 0, data: true }` only after resolution; all errors are converted by `buildHelperCheckResponse`. | `test:windows-helper-install-ipc`. |
| P1 | Antivirus or packaging can remove the helper executable, but a health check or install command could previously treat it like an ordinary repairable failure. | Binary existence is checked before socket use and before creating an install command; the stable result is `helper_binary_missing`. | `windows-helper-check-test.ts`, `windows-helper-state-test.ts`, and `windows-helper-send-test.ts`. |
| P1 | Replacing a running helper could continue while the old process remained alive, while the new helper immediately exited, or while the legacy task remained registered. | Stop and wait for old processes, verify the new process stays alive, replace both task names, and read back the new task. | `test:windows-helper-install`; repeated-install Windows acceptance. |
| P1 | Empty helper data, a missing binary, a directory supplied as the binary, or scheduled-task registration errors could produce partial state. | Validate inputs and object kinds, require a non-empty roots list, clean up a newly created task/process on later failure, and propagate the final failure through IPC. | `test:windows-helper-install`, `test:windows-helper-install-ipc`, and `windows-app-helper-init-test.ts`. |
| P2 | Installer and Go helper could choose different allow-roots paths when `ProgramData` contained whitespace. | Both use the value unchanged unless it is unset/empty; only then they use `C:\ProgramData`. | `test:windows-helper-install` checks both source contracts. |
| P2 | An unsafe ProgramData object or invalid data-path shape could be silently accepted. | Reject reparse points, require a normal data directory, canonicalize stored roots, and lock both ACLs. | Source regression plus the Windows file/ACL checks. |
| P2 | Host-independent tests cannot validate Windows UAC, NTFS ACLs, Task Scheduler, or the actual helper executable. | A bounded manual acceptance plan uses an elevated Windows test installation and records the exact expected state. | Tasks 4.2–4.6 in the implementation plan. |
