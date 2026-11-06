# Service Startup Diagnostics Fix Plan

> Execute inline using systematic-debugging, test-driven-development and verification-before-completion.

**Goal:** Merge PR #959 first, then retain its exit-code/signal diagnostic without attaching previous runs' stderr or duplicating current stderr.
**Authorization / design:** User explicitly requested merge then the concrete fix proposed in review. PR merged remotely as 3b57f05c; isolated fix starts at local merge 6a930f4d. Keep the diagnostic in startupExitHandler limited to process termination metadata, and keep the existing outer catch as the single owner of stderr collected since `before`.
**Files:** src/fork/util/ServiceStart.ts; scripts/service-start-diagnostics-test.ts; package.json (test command).

## Operation contract and failure boundaries

- Owner/lifetime: existing fork serviceStartSpawn invocation; no new renderer operation, persistent state, service controller or process owner.
- Existing intermediate/terminal events remain: child spawn/error/early exit or startup-window completion. No timeout, retry, privilege or PID registration changes.
- The file is append-only by design. Preserve all historical file contents, but only current-invocation output may be attached to its error.
- Preserve exit code/signal when stderr is empty. Existing success path, missing-executable errors and Linux low-port fallback remain unchanged.
- Re-entry and service interaction continue under existing service lifecycle ownership. No new module state or constraint exceptions.
- Required failures still reject. stderr enrichment remains in the established outer error path; this patch removes the extra async read and does not broaden this task into log I/O redesign or issue #715's unknown startup false-positive.
- Verify using real disposable Node child processes and temporary files. Stub only app/env/privileged helper boundaries; never start Apache, call a real privileged helper or touch user service logs.

## Steps

- [x] Reproduce historical stderr leakage and duplicate fresh stderr against the merged PR; also cover mixed old/fresh output, exit signals, preserved append-only logs, missing binary, Linux low-port selection, and normal startup.
- [x] Remove the read from startupExitHandler, retain exit metadata and reuse the existing outer incremental collection.
- [x] Run the diagnostics regression, targeted ESLint, relevant lifecycle regression checks and fork compilation; obtain one independent review of the final change.
- [x] Commit and integrate locally, verify original user file hashes, and remove only the temporary worktree. Do not push the local follow-up fix without further authorization.

## Evidence / progress

- Real disposable child/file regression against PR: 4 passed / 4 failed, demonstrating historical contamination and duplicated current stderr (tmp/pr959/red.log in the main checkout).
- Fixed tree: 8/8 diagnostics cases pass on macOS, including real PID-file registration. Self-SIGTERM case is POSIX-only; Linux helper calls are intercepted, not executed with privileges. No Windows/Linux native acceptance claimed.
- Targeted ESLint and strict TypeScript check of the new regression script pass; full fork esbuild compilation and existing StartupGroup runner test pass. No full application build/type-check claim.
- Independent focused review: no actionable findings; no deferred items or scope deviations. Diagnosis remains the concrete defect established in review, not issue #715's unknown first-start behavior.
- Original user files recorded in main checkout tmp/pr959/original-files.json; verify hashes again after local integration. Only PR #959 was published; the follow-up fix remains local.
