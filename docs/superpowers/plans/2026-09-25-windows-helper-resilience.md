# Windows helper resilience implementation plan

Goal: harden the existing Windows per-SID installation and recovery flow, following the review accepted by the user on 2026-09-25.

Follow-up on 2026-09-26: the user requested helper version 26 → 27 and a complete Chinese change rationale. Synchronize Go/TypeScript/version fixtures, rebuild the Windows artifact, and document all production/test changes in `docs/task/windows-helper-resilience-v27.md`. The operation owners and security constraints below remain unchanged; no new module/state or boundary exception is introduced. Earlier verification entries mentioning 26 describe the pre-follow-up build, not the current release target.

## Constraints and decisions

- Preserve the existing primary/backup SHA-256 equality and mandatory backup policy exactly. The user explicitly excluded changing candidate selection.
- Preserve per-SID SYSTEM tasks, named-pipe authentication, protected ACLs, and reparse-point rejection for helper storage. No privilege or enterprise-policy bypass.
- Keep changes in the current checkout for review; no publishing or commits are required.
- Improve the existing PowerShell implementation now; a new native installer is a future architectural option, not a prerequisite for these fixes.
- Do not introduce shared configuration or Pinia state. No exception to the new-module constraints is needed.
- Preserve the prior policy of no helper-version rollback. Stage files before stopping the old task, publish files atomically, retain valid keys, and leave interrupted installs repairable.

## Operation contract

- Owner: main-process AppHelper singleton; renderer Helper singleton owns installer IPC and result handling. Components only bind state and invoke commands.
- Lifetime: survives initiating page unmount; ends after health validation or a diagnosed terminal failure.
- Events: checking/recovering/installing are intermediate; checkSuccess or installFaild is terminal.
- Duplicate invocation: share one in-process installation promise; serialize privileged installation for the same SID across processes.
- Service interaction: inspect/start only the exact current-SID task; never terminate processes by image name. Stop only when replacement is necessary.
- Cleanup: retain running-operation resources on uncertain timeout; cleanup failure must not convert success into failure. Preserve error message, stage, task result, and startup diagnostics.
- Verification: special-character paths; no UAC in automated tests; transient versus permanent health failures; duplicate calls; stopped-task recovery; failure/retry; page re-entry; installer failure before and after stopping; packaging missing-artifact rejection.

## Tasks

- [x] Harden the elevated installer script: preflight, SID lock, retryable file operations, staging before stop, atomic key/config publication, task recovery configuration and failure diagnostics. Add executable PowerShell tests using temporary fixtures and fake scheduler objects.
- [x] Replace the helper's BAT-based elevation path with a direct compressed/base64 inline PowerShell launcher and structured, bounded result handling. Unify trusted system-tool lookup and ProgramData identity capture. Keep generic Sudo callers compatible.
- [x] Add existing-task recovery, single-flight main-process installation, failure-specific health retry, and IPC diagnostic preservation; test these behaviors through dependency injection.
- [x] Remove obsolete NSIS helper mutation hooks, fail packaging on missing helper artifacts, replace invalid manual-exe guidance in all 33 locales, and expose a working Windows repair entry through the shared controller.
- [x] Complete final code review; focused tests, lint, type checks and VM validation matrix are recorded below.

## Review focus

- Cross-user UAC must preserve the original SID while not depending on the administrator reading an original-user script file.
- Unicode, apostrophes, percent signs and exclamation marks must survive all launch boundaries.
- A timeout must not remove files still used by a live elevated child or allow concurrent destructive replacement.
- The installer must keep primary/backup policy unchanged and avoid deleting a preexisting task on failure.
- Recovery must validate task identity/action/fingerprint before asking Task Scheduler to start it.

## Progress

- Initial review complete; current checkout is clean. User authorization covers implementation of the review except candidate selection.

## Verification results (2026-09-25)

- Passed all 18 focused TypeScript scripts: windows-helper-{check,cross-user,elevation,fallback-plan,identity,install-ipc,install-script,powershell,renderer-controller,resilience,send,state}, windows-app-helper-init, windows-after-sign-helper, helper-version-sync, helper-install-hosts-retry, server-path-helper-install, renderer-operation-boundaries.
- PowerShell parser/function fixtures passed: scheduler identity rejection, canonical known folder, SHA-256, retryable sharing violation versus permanent access denial, actual locked-file replacement preserving both old/staged bytes, successful retry after releasing the handle.
- Launcher fixtures use the real Windows PowerShell child and named pipe without elevation. Covered Unicode/apostrophe/percent/exclamation paths, typed installer errors, cancellation and timeout classification, and complete installer command-line size.
- Renderer behavioral tests cover duplicate requests, intermediate events, success/error/cancellation, synchronous IPC failure, timeout/listener cleanup and retry after timeout.
- Windows Go `test ./module ./utils` and `vet ./...` passed. Diagnostics cover append across restarts, bounded rotation and hardlink rejection. Symlink test skipped because this account cannot create symlinks. Main-package runtime tests require an elevated test binary and were not run.
- Initial Windows amd64/v1 GUI helper build used protocol 26; it has since been superseded by the v27 rebuild requested on 2026-09-26. Output: `src/helper-go/dist/flyenv-helper-windows-amd64-v1.exe`. Generated standalone test executables were removed.
- Changed TypeScript/Vue files pass ESLint; `git diff --check` passes.
- Full `tsc --noEmit` remains blocked by 10 errors in unchanged Linux builder, DNS, Image, Podman, BrewFormula and Plugin files. No diagnostics were reported for changed files.

## Final review follow-up (2026-09-26)

- Accepted the uncertain-timeout channel-lifetime finding. A real PowerShell regression first reproduced the late child's failed pipe connection; after the fix it passes. A killed launcher now leaves its result channel available for up to 10 minutes, cleans it on a late result or deadline, and uses unreferenced handles/timer so cleanup does not prevent app exit. The privileged per-SID mutex continues to serialize retries.
- Rejected the path case-sensitivity finding after an executable PowerShell probe: `-ne` already compares Windows paths case-insensitively; `-cne` is used intentionally only for the exact action-arguments contract.
- Added a large Unicode output fixture and strict per-field result truncation, including single oversized lines, to remain within the named-pipe response byte limit.
- Independent review explicitly excluded real UAC/cross-user/SYSTEM execution; those remain release VM checks, not claims of completed end-to-end installation coverage.

## Version and documentation follow-up (2026-09-26)

- Go and TypeScript now both declare helper version 27; the version-sync test and installation fixtures are synchronized. The version-sync test was verified red against 26 and green after the bump.
- Rebuilt the Windows amd64/v1 GUI helper from v27 source. Shared version constants also require rebuilding the corresponding helper artifacts when releasing macOS/Linux; those release packages were not built here.
- Added the complete Chinese rationale, production/test file inventory, failure semantics and release-validation limits in [Windows helper v27 installation resilience](../../task/windows-helper-resilience-v27.md). The v26 historical document links to this superseding explanation.

## Required manual VM validation before release

- Standard user approving UAC with a different administrator account; non-ASCII username, spaced/apostrophe/percent/exclamation install and data paths; relocated ProgramData.
- Fresh install and repair of existing per-SID tasks as SYSTEM; task read/execute ACL, demand start by original user, crash restart, logon trigger and simultaneous installations for same/different SIDs.
- Fault injection before/after stopping and publishing: reboot/process termination, insufficient disk space, read-only/corrupt directories, access denial and antivirus sharing locks; valid key preservation and subsequent repair.
- UAC cancellation/delay beyond timeout; retry while the prior elevated process still holds the SID mutex; no deletion of files in use or unrelated tasks/processes.
- Defender/third-party antivirus, AppLocker/WDAC/Constrained Language and disabled Task Scheduler: fail with useful diagnostics without attempting policy bypass.
- Existing ACL/reparse protections stay enforced. Recovery does not promise success against denied administrator approval, missing packaged artifacts or enterprise execution restrictions.
