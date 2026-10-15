# MSSQL review fixes implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the MSSQL review findings without changing the public service lifecycle or adding shared module state.

**Architecture:** Keep renderer operations in `MssqlPluginManager`, process/file ownership in the plugin fork module, and start/stop/restart in `ModuleInstalledItem`. Introduce plugin-local installation/runtime helpers where they allow meaningful behavioral tests.

**Tech Stack:** TypeScript, Vue, Node, esbuild test harnesses.

**Spec:** `docs/deepwiki/sql-server.md` and the review in this conversation; user requested all findings fixed.

## Global constraints

- No persistence in shared setup and no new Pinia store. No exception authorized.
- Keep MSSQL properties/types/policies inside `plugins/mssql`. Do not change public installation/removal admission or timeout behavior. Different MSSQL versions may install/remove concurrently; only the same version is serialized in the plugin.
- Manage only FlyEnv-started services. Installation scans return metadata, never external live state; a Windows service already running outside FlyEnv blocks start without being adopted or stopped.
- Preserve user data on failed installation, failed start and uninstall.
- Do not silently install SQL Server or accept Windows Setup terms; only download/extract media before opening its interactive wizard.
- Linux runtime requires preinstalled Bubblewrap and unprivileged user namespaces; private mount maps the complete instance root to `/var/opt/mssql`. No automatic dependency installation or host-system directory writes.
- Restrict native plugin to x64 Windows/Linux.
- Existing uncommitted MSSQL work is the repair target; work in place and do not commit or publish.

## Operation contracts and failure boundaries

- Online discovery: renderer singleton owns request, progress/terminal cleanup and re-entry; fork repositories are independent candidates. Fetch errors are visible and do not delete active rows.
- Install: renderer singleton owns immutable snapshot, EULA precondition, per-version flight and progress across page navigation. Fork owns download, checksum, extraction, manifest and external media process; each is required. Terminal IPC 0/1 settles once; 200 retains listeners. Rescanning after success is supplementary and cannot replay installation or report it failed.
- Uninstall: renderer singleton owns flight and notices; registered item public stop is a required prerequisite. Fork validates owned directory and confirms no owned processes before deletion, serialized with same-version start/stop/install in the plugin. Stop failure/unknown state blocks removal. Data stays intact. Rescan failure reports separately.
- Start: public lifecycle owns renderer admission; fork owns SCM/sqlservr, immutable runtime identity, readiness and failure cleanup. PID alone is not ready. Failed readiness reclaims the process through the existing stop owner; cleanup failure remains visible.
- Stop: an unregistered Windows instance is a no-op without SCM control. For a registered PID, unknown SCM state rejects, confirmed STOPPED permits no-op success, and a different running PID blocks control. Only confirmed owned PIDs are returned.
- Windows scan: per-instance registry candidates are independent; return installation metadata without querying SCM or registering running services. Runtime metadata does not use the user note field.

## Review focus

- Real IPC then() returns void: progress retains listener, false terminal is failure, duplicates and page re-entry cannot cause replay.
- Download truncation, checksum failure, extraction failure and manifest failure never become success based on an early binary file.
- Windows query denied/unknown and launcher error never become successful terminal results.
- Stop failure and concurrent start prevent uninstall; successful uninstall preserves database files.
- Linux first init, existing master, slow readiness and post-spawn failure use one explicit layout; verify PAL root behavior against package evidence and report the actual platform coverage.

## Tasks

1. [x] Add renderer behavioral tests using the host's callback-shaped IPC; observe failures, then fix controller terminal handling, per-version admission, settings validation, supplementary rescans, and uninstall coordination. Update renderer boundary coverage.
2. [x] Add fork behavioral tests for SCM unknown/denied/running cases and external-process events; fix Windows installation scan and external-service exclusion, media acquisition, interactive Setup arguments, and per-instance stop evidence.
3. [x] Add tests for streamed-download and installation rollback/manifest failures; replace the Base installer path with plugin-owned atomic installation and validated uninstall.
4. [x] Determine the Linux layout from primary package evidence; add layout/readiness/failure-cleanup tests, implement explicit master/log paths and retain module-owned runtime metadata.
5. [x] Restrict architecture, keep Developer license guidance visible, correct research claims, run targeted regression/lint/plugin build checks, and perform final review.

## Validation record

- Renderer red: callback-shaped IPC install Promise rejected immediately. Green: progress retention, same-version duplicate flight, start admission, false terminal, stop failure, fork deletion, supplementary rescan failure and EULA gate pass.
- Fork red: denied SCM query returned success. Green: denied/unknown propagation, stopped no-op, owned stopped PID, rejection of external running/replacement services, manifest failure rollback, successful atomic publication, stop failure blocks removal and preserved user database pass.
- Runtime tests: interrupted/incomplete downloads leave no cache file; spawn error/nonzero exit reject; Setup has path defaults and no silent/EULA acceptance switches; media downloader supports Express Core/Developer ISO; namespace layout and delayed readiness covered.
- Ruling: Linux direct `MSSQL_DATA_DIR` redirection is insufficient evidence for PAL system-root relocation. Use an explicit Bubblewrap mount instead of undocumented loader settings or root directory changes. Cost: one documented runtime dependency; kernel/AppArmor namespace support still needs Linux x64 acceptance.
- Renderer timeout carries an explicit unknown-outcome flag (independent of translated messages) and blocks retry; a 10 ms real callback-IPC test failed before and passed after the guard. Public installation timeout/lifecycle behavior remains unchanged.
- User correction: reverted the four main-process files entirely and removed the superseded host scan/timer tests. Plugin installation tests failed when different versions were globally serialized, then passed with per-version fork queues. Tests also cover no SCM queries during installation scanning, rejecting external running/replacement services, and starting only a confirmed stopped service.
- Final checks passed: `yarn test:mssql-plugin` (four suites), `yarn test:renderer-operation-boundaries`, ForkItem idle/restart, service stop batch, MCP lifecycle preferences, targeted ESLint, `yarn plugin:test mssql`, `yarn plugin:build mssql`, main esbuild compilation, and `git diff --check`.
- Artifact: `dist/plugins/mssql/mssql-0.1.0.flyenv-plugin`; registry checksum regenerated. All host source edits, including ForkTerminalRequest sensitive transport, have been withdrawn at the user's request; the repair retains the existing host behavior.
- `yarn vue-tsc --noEmit` reports 65 errors in untouched files; none are in the new MSSQL plugin/tests or changed host files. Full-repository typechecking therefore remains failing; this repair does not claim a clean repository-wide typecheck.
- No commit/publication or system helper changes. Windows x64 Setup/UAC and Ubuntu x64 initial database/restart remain unverified on actual target machines; current host is macOS ARM64.

