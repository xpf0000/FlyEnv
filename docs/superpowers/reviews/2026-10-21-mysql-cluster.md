# MySQL Cluster execution and review evidence

Implementation branch: `codex/mysql-cluster`, isolated checkout `.worktrees/mysql-cluster`.
Reviewed range: `619d7c8d..e6968f85`. Independent review returned 7 Important findings,
all fixed by the implementer with regressions; no second review was requested.

## Review findings and disposition

| Finding | Final behavior | Evidence |
| --- | --- | --- |
| Host Unix entries contain mysqld_safe | Derive and probe sibling mysqld; retain original installation identity | versionPanels host-shape regression; native uses same adapter |
| Host installed source defaults to Static | Infer source from installation layout; compare exact paths before labels; unknown aliases refuse | versionPanels default-source and wrapper regression |
| Source port edit strands replicas | Verify source UUID, stop channel, update only source port, restart with GTID preserved | replication dialect regression and native new-write replication |
| Successful initialization loses completion after catalog failure | Durable per-instance receipt; retry only persistence, including replacement worker | catalog fault-injection regression |
| Prepared group cannot resume after Storage/list failure | Start resumes original prepared identity/config and initialization; credentials retained in session | controller Storage-failure/start and catalog missing-config regressions |
| CREATE succeeds but GRANT fails | Ensure account and required grant independently; retry grant without recreating account | replication partial-success regression |
| Bootstrap OFF failure bypassed on ONLINE reentry | Reset OFF on every member before recovery planning/success | GroupReplication ONLINE-reentry regression |

## Validation

- `node --import tsx --test plugins/mysql-cluster/tests/*.test.ts`: 62 tests; 61 pass, 1 explicit native skip, 0 failures.
- Separate native run: Oracle MySQL Community 8.4.8, macOS arm64; pass, 97.30 seconds.
  Standalone, real GTID writes, changed source port, database/user grants, read-only refusal,
  real mysqldump, three-node GR, election, rejoin and full-stop recovery.
  Every engine goes through the host-entry adapter; engine/config/data paths contain spaces.
- Renderer boundary audit passes. Changed plugin and host files lint without errors;
  2 existing `v-html` warnings in the MacPorts view. Earlier full changed-host lint had 7 existing warnings.
- Full vue-tsc with 8 GiB heap: exact same 53 baseline diagnostics, no new diagnostics.
- Plugin build passes. Archive is 483490 bytes, SHA-256
  `e971b68ccf9f4f8ff5f75675c0d308309760320366b7b5937943336c21be1059`.
  Registry, single manifest and render/fork/CSS payload verified by unpacking.
  Bundled Fork module loads and enumerates an empty isolated catalog.
- Real Vue/host views in a browser with transport fixtures: three Tabs, removal guard,
  three modes/node preview, English/Chinese, light/dark, 600px width, management/read-only UI.
  UI fixtures are separate from the native MySQL acceptance above.
- No user services or databases were touched. No publishing, activation or shared-branch merge.

## Rulings, limitations and costs

The following ledger preserves implementation decisions, review dispositions and scoped limitations.
Test-file consolidation costs only navigation; the shared management drawer costs a UI layout difference.
Singleton/controller and persistent journal choices add a small amount of module-local state but prevent
lifetime and partial-edit errors. Data/config/log retention requires manual disk cleanup after deletion.
The paired-host requirement means the plugin alone does not upgrade an older FlyEnv installation.

```text
# SDD ledger — plan: docs/superpowers/plans/2026-10-20-mysql-cluster.md
Pre-flight: Tasks 1→2→3→4/5→6→7/8/9→10 consume compatible shared instances, lifecycle identity, OperationResult and event signatures.
Ruling: Work in authorized isolated checkout .worktrees/mysql-cluster with existing node_modules symlink; no dependency reinstall or user service operations.
Task 1: Ruling: validators return true after validation instead of void for convenient caller contracts; malformed inputs still throw.
Task 1: RED 0/8 → GREEN 8/8, command node --import tsx --test plugins/mysql-cluster/tests/policy.test.ts.
Task 2: complete — RED 0/4 to GREEN 4/4, real temp catalogs/configs/partial initialization; commit 94be537b.
Task 3: process identity and duplicate-flight tests GREEN 3/3; runtime integration awaits native acceptance in Task 10.
Ruling: test fixtures consolidate config/catalog/init tests in catalog.test.ts and identity/locks in runtime.test.ts rather than trivial split files.
Task 3: complete — identity, duplicate/multi-instance locks and actual Base stop adapter; native macOS 8.4.8 exact-stop tests pass.
Task 4: complete — replication.test.ts RED→GREEN including old/new dialect, NULL lag, driver identifier quoting and 32-character channel credential limit. Native source/replica write replication passes.
Task 5: complete — groupReplication.test.ts RED→GREEN (bootstrap final reset, divergent/unapplied/64-bit GTID), native 3-node ONLINE, election, rejoin and full-stop recovery pass.
Task 6: complete — controller/lifecycle tests including real Vue reactivity, duplicate creates, progress lifetime, notice failure, serial preferences, failed storage read/write and credential preconditions. Real ModuleInstalledItem failed-stop restart tested.
Task 7: complete — per-instance management, config, log tail and backup; native database/user creation, read-only write refusal and real dump contents verified. Native picker cancellation/shared request regression passes.
Task 8: complete — real Vue views, compileScript template regressions, three-mode form, three Tabs, host service header without controls, en/zh, dark/light and 600px column widths verified through CUA with isolated transport fixtures.
Task 9: complete — guarded Static/Homebrew/MacPorts removal and shared default compatibility; running-instance removal refused in browser; source-level brew conflicts already refuse installation (no hidden uninstall exists), so no nonexistent conflict-removal execution path added.
Task 10: native acceptance complete on macOS arm64 Oracle 8.4.8, /tmp/mc-native.log pass=1 fail=0 in 86.75s after adding engine/config/data spaces, complex password and real backup checks; final branch review still pending.
Ruling: data/config/log management uses a single focused InstancePanel.vue and local management singleton rather than many redundant dialogs; same lifetime/isolation contract.
Ruling: config update journal and shared Fork per-instance/multi-member locks are required to prevent partial edits or duplicate initialization; tests failed first then passed. Initialization children are never service-running evidence.
Ruling: persistCurrentVersion opt-out must be module metadata applied in BrewStore before its first watcher; a late assignment would race config writes. Older hosts are blocked with an update message.
Ruling: first-version GR requires 8.0.27+ within 8.0 or 8.4 and an actual plugin file; asynchronous replication requires 8.0.13+. Other variants/platforms remain native-unverified, stated in README.
Ruling: delete retains configuration/logs as diagnostics together with database files, removing only verified-stopped management records; no recursive database deletion.
Ruling: plugin and host UI hooks require a paired host build; no published old-host compatibility claim. No actual user services, publishing or plugin activation performed.
Verification before review: 53 focused tests (52 pass, native 1 explicit default skip); separate native test passes. Renderer boundaries pass; ESLint 0 errors/7 pre-existing host warnings; vue-tsc 53 baseline diagnostics vs 53 current, no added diagnostics; plugin build/package hash integrity pass.

Final: independent whole-branch review completed on 619d7c8d..e6968f85; 7 Important, no Critical, no deferred minors. All 7 accepted and fixed in one pass. No re-review was dispatched.
Final: fixed real Unix host mysqld_safe adaptation — actual host-shape engine regression RED→GREEN; native acceptance now constructs every engine from a wrapper entry.
Final: fixed installed source/default and wrapper identity removal bypass — host scan/default-source regressions RED→GREEN; exact bin/path precedes source label, package source inferred from canonical layout.
Final: fixed source port edits — old/new dialect and mismatched UUID regression RED→GREEN; native full-stop/edit/restart/new-write replication passed.
Final: fixed initialized-stage persistence failure — failed catalog commit and replacement-worker receipt regression RED→GREEN, mysqld invoked exactly once.
Final: fixed prepared group UI reentry — Storage-failure/start-original-ID and missing-config resume regressions RED→GREEN; unknown execution never reinitialized.
Final: fixed CREATE/GRANT partial retry — existing-account regression RED→GREEN, strengthened to CREATE success/GRANT failure/retry with one CREATE and two GRANT attempts.
Final: fixed bootstrap OFF reentry — first-reset failure and subsequent ONLINE-member reset regression RED→GREEN; every configure resets all members before planning success.
Final: Ruling: MacPorts follow-dependents is an unbounded actual removal set — all live MacPorts cluster dependencies block this plugin removal entry until stopped; cost: unrelated MySQL package removal can be conservatively refused. Unknown formula aliases likewise refuse when a live same-source dependency exists.
Final: Ruling: Windows/Linux/8.0, MacPorts resource layouts, nondefault SQL mode and outside-client concurrent GR writes remain native-unverified — do not extrapolate macOS Oracle 8.4.8 evidence; cost: those environments require acceptance before claiming compatibility.
Final: Ruling: only durable successful initialization receipts or success retained in the current worker permit persistence-only retry — if execution and receipt both become unobservable after process loss, recovery remains manual; cost: conservative refusal despite possibly valid files.
Final verification: 62 focused tests, 61 pass and 1 explicit native default skip; separate Oracle 8.4.8 macOS arm64 native pass in 97.30s (98.35s runner). Types identical to 53 baseline diagnostics; renderer boundaries pass; changed code lint 0 errors with 2 existing port v-html warnings; final build pass.
Final artifact: 483490 bytes, SHA256 e971b68ccf9f4f8ff5f75675c0d308309760320366b7b5937943336c21be1059; unpacked single manifest/render/fork/CSS verified, bundled Fork import and empty catalog enumeration pass.
Final cleanup: native test data/processes removed by test; only agent preview tab/server closed. Worktree retained for integration decision; no merge/push/publish/activation.
```

No deferred minor findings. Windows, Linux, MySQL 8.0, MacPorts package/resource layouts and nondefault
SQL modes remain native-unverified. The plugin does not coordinate arbitrary outside-client writes
while deciding a full-stop GR recovery; users must keep those new local groups quiescent during recovery.
