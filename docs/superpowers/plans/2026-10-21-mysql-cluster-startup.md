# MySQL Cluster sidebar and startup-group integration

User requests a sidebar switch controlling all instances, and MySQL Cluster targets in the host startup-group editor. Runtime implementation remains plugin-only; no host source/prototype edits, shared config.setup data, or new Pinia. The existing BrewStore module registry receives a plugin-owned module adapter because the host startup editor enumerates that registry; persistent catalog/credentials remain in plugin Storage.

## Operation contracts

- All-instances lifecycle owner: existing MysqlClusterController singleton. Lifetime survives sidebar/page changes. One action snapshot after catalog load, each independent cluster delegates runGroup with captured interactive intent; each runGroup retains its existing ordered member lifecycle and progress. Same-action duplicates share a batch promise, conflicting batches reject admission, required load failure blocks all starts. Independent group outcomes are collected without aborting siblings. Per-group terminal notices/results remain authoritative. Batch cleanup occurs after all groups and their final refreshes settle. Hide waits admitted batch work before stop. No new process implementation or extra PID probes.
- Sidebar: computed running count from Fork snapshots; switch is on when any instance runs, off when none. Disabled/loading from singleton busy state, unavailable/empty catalogs cannot start. AppServiceModule uses the same singleton batch API. Navigation does not fire on switch clicks.
- Startup targets: plugin-owned Module subclass in public BrewStore.modules[mysql-cluster], registered only while its metadata descriptor belongs to AppModules, with hot-update ownership cleanup. Fetch/source state belongs to adapter singleton and loads manager first. Stable group projections call runGroup; real member start/stop remain ModuleInstalledItem methods. No generic apply/reset-current/config-save path. Descriptor membership and catalog watchers clean up on removal; projections resolve current IDs after rename/deletion. Errors/partial outcomes become native startup-runner member failures, preserving completed side effects.

## Host constraints

Default assumption after optional grain question: whole-cluster selection. Host startup selection permits only one service-version target for a module. Its bool-only state cannot represent a partially running aggregate: projections report any running member so stop never skips survivors; native startup start skips an already partial/running target. Full partial-fill semantics or selecting multiple cluster targets in one startup group require a host extension; do not bypass via getters with action side effects or disguised module types. Sidebar start-all still fills all nodes through existing runGroup.

## Verification

Focused batch tests: duplicate/conflicting invocation, load failure, independent partial success, captured background interactive intent, visibility stop handoff. Adapter tests use actual native StartupGroup runtime/runner/candidate, registry cold/hot replacement, no shared config writes, background/partial failures and current-catalog identities. Existing strict clone lifecycle suite, full plugin checks, boundary audit, types baseline, build/archive verification. No real user service/install changes.

Review correction: independent groups may join an older refresh that captured a sibling before its start. After every group has settled, runAll takes a fresh batch-wide snapshot while allBusy is retained. This is needed for sidebar/row correctness; refresh failure remains supplementary, reports its own error and never replays or rejects completed starts. Regression gates the older snapshot and the later physical start separately, plus final-refresh failure/no replay.
