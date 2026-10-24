# macOS helper installation compatibility

User requirements (2026-10-24): copy only necessary installation files when a
whole-app copy is unnecessary; keep the quarantine fix; do not reject installation
because of existing helper directory ownership/mode/ACL; wait for the old helper
to exit without the five-second deadline.

The whole-app snapshot was introduced to verify the application's sealed
resources on the same immutable copy that supplies the installer. launchd does
not require that copy. The chosen compatibility change verifies the source app
in place and the copied helper binary, and copies only the binary, installer and
plist as bytes into private staging. This removes the immutable whole-app
resource snapshot guarantee; source-app verification and copied-binary
verification remain. Copying bytes avoids importing Finder flags and extended
attributes. Clear quarantine before executing the staged helper and before
registering the published daemon.

## Operation contract and failure boundaries

- Owner/lifetime: existing main-process AppHelper installation flight, from sudo
  authorization through real command exit and helper health verification.
- Events: existing installing/progress events and success/failure terminal events;
  terminal installation retains the existing controller and PTY owner.
- Duplicate calls and page detach keep their existing behavior; no renderer,
  configuration, persistence, Pinia or public lifecycle changes are needed.
- Required steps: source validation, copying three files, successful old-service
  stop and actual exit, credential/publication writes, launchd registration and
  health. Their actual errors still fail their dependents. Waiting for actual
  exit has no arbitrary retry count. Stage cleanup remains supplementary.
- Existing `/Library/Application Support/FlyEnv/Helper` directory owner/mode/ACL
  is not an installation, startup or health precondition. Actual access/file
  errors still propagate; policy/key file integrity and client UID authentication
  remain checked. Socket runtime, Linux, hosts and FTP directory policies are
  unchanged. New private staging has its inherited ACL removed before copying.
- Authorization: the user explicitly requested these compatibility changes;
  they do not authorize unrelated privilege-policy changes or system installs.

## Implementation plan

- [x] Add isolated shell regressions for minimal copying, metadata handling,
  signature rejection, quoting, delayed old-process exit, stop/write/bootstrap
  failures and cleanup; add a native helper-directory compatibility regression.
- [x] Replace whole-app staging with three byte copies and staged quarantine
  cleanup; remove the old-process deadline without swallowing stop errors.
- [x] Remove helper-directory permission gates from Darwin installation,
  startup and health, retaining structural and file integrity checks; bump the
  helper/protocol version together so existing installations are upgraded.
- [x] Run focused regressions, Go tests/vet, helper contract/version checks,
  shell syntax and changed-file lint; review failure boundaries and the diff.

Verification must use disposable fixtures. Do not install/restart the machine's
helper or modify its authorization assets. Signed release installation and
Intel/older macOS acceptance remain separate from isolated checks.

## Verification evidence

- Ten isolated installer cases pass. The previous bootstrap retained quarantine
  (fixture exit 71), and the previous stop loop rejected an old process needing
  28 polls. Both regressions now pass. Source signature, real stop, publication
  and launchd bootstrap failures remain failures; bootstrap exit 5 is preserved.
- A directory with inheritable allow ACL produced a new policy file with that
  ACL and failed the added assertion. Clearing only the new policy file ACL
  makes the assertion pass; the directory ACL is retained.
- Independent review identified that new private staging can inherit its parent's
  allow ACL. The added regression reproduced fixture exit 72, and clearing the
  new staging directory ACL before writing files fixes it. Socket-directory gates
  remain unchanged to keep the compatibility change scoped to the installed
  Helper directory. Review reported no further important findings.
- Native directory tests accept user-owned 0755/0775/0777 and allow-ACL folders,
  and reject a missing path or regular file. Reinstating the former permission
  gate reproduces the failure; the structural-only check passes.
- Go 1.24.5: `go test -count=1 ./...` and `go vet ./...` pass. arm64 and amd64 cgo
  builds pass with macOS 12.0 deployment targets. Outputs were disposable.
- Helper contract (39 methods), version synchronization (49), installer shell
  syntax, changed-file ESLint and git diff whitespace checks pass.
- Read-only replay against the existing signed 4.20.1 app used its protocol 48
  in the fixture and passed source-app verification, three byte copies and
  copied-helper verification. The installer was intentionally not executed.
  This does not establish acceptance of a newly signed protocol-49 release.

The five-second cap originally bounded a potentially stuck old-process wait;
that policy is removed at the user's request. A truly stuck old process now
keeps installation waiting until it exits or the operation is interrupted.

## Subsequent Unix-wide audit

The user's subsequent request expands directory compatibility to both Unix
platforms, including socket and FTP directories previously outside this task's
scope. See [Unix directory audit](unix-directory-permission-audit.md) for the
shared structural-only check, Linux installer/alias changes, new-file ACL
normalization and FTP scratch isolation. Protocol 49 remains unreleased.
