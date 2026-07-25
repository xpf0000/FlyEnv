# Windows Helper Reliability Completion Design

## Goal

Close the remaining Windows helper reliability gaps without changing macOS or
Linux behavior. A failed installation must identify the failed stage, retain
the installer diagnostics, and never bind the helper to the administrator
account used only to approve UAC.

## Chosen approach

Three approaches were considered:

1. Add more fixed delays and parse generic errors. This is small, but cannot
   distinguish a slow machine from a task that started for another user.
2. Keep direct elevated `Start-Process` and synchronize TEMP. This still makes
   the helper's identity depend on the UAC account.
3. Register and run the task for the original FlyEnv user, pass an explicit
   per-user key path and SID to the helper, then accept installation only after
   a signed health response contains the helper PID. **This is the chosen
   approach.**

## Architecture

- The Electron main process determines the unelevated FlyEnv account and SID,
  derives `%LOCALAPPDATA%\\FlyEnv\\flyenv-helper.key`, and substitutes all
  three values into the elevated PowerShell template.
- The installer writes and re-reads protected allow-roots ACLs, replaces the
  scheduled task, verifies its action and principal, and invokes the task. It
  emits a machine-readable `FLYENV_HELPER_INSTALL_ERROR:<code>:<message>` on
  every expected failure path.
- The Go helper accepts `--key-path` and `--expected-user-sid` on Windows. It
  refuses a mismatched account, uses the explicit stable key location, and
  exposes a signed `helper/health` response containing its PID and the result
  of allow-roots validation.
- `AppHelperCheck` first validates the local key, then requires both a correct
  version reply and a healthy PID reply. `AppHelper.initHelper` polls until a
  deadline with bounded backoff, preserving the final structured cause rather
  than replacing it with a generic install failure.
- Windows elevation errors retain their source category: UAC cancellation,
  process-launch failure, status-file timeout, or elevated-command failure.
  The IPC response returns `reason` and redacted installer stderr.

## Error model

The structured helper error union will distinguish binary absence, local key
missing/invalid, pipe unreachable, signature rejection, helper version,
allow-roots ACL/configuration, task registration/validation, task startup,
startup timeout, UAC cancellation, elevation launch failure, and elevation
status timeout. Unknown command failures remain `helper_execution_failed` and
include stderr for diagnosis.

## Verification

Tests are written before each production change. TypeScript tests cover CSV
identity parsing, IPC payloads, installer source contracts, local-key and
health-response classification, and deadline-based retries. Go tests cover
Windows key-path selection and command-line argument parsing. Final Windows
acceptance builds the helper, performs clean install/reinstall and
release-to-development replacement, then checks task principal/action, helper
PID/SID, named-pipe health, key location, and allow-roots ACLs.
