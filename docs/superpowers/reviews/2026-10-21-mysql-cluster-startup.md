# MySQL Cluster 0.1.9 sidebar/startup integration

## Implemented

Sidebar switch uses the native Element Plus switch style and derives checked state from any Fork-confirmed running instance. It controls every saved cluster through singleton runAll, with loading/disabled state retained through all terminal refreshes. Existing AppServiceModule global group actions share this same batch API and preserve interactive/background intent. Individual cluster progress/results remain intact; one failed cluster does not abort independent clusters. Page actions are disabled during the batch. Visibility shutdown waits admitted batch work before stopping.

The startup-group editor sees whole named clusters through a plugin-owned Module subclass in the public BrewStore registry. Real node ModuleInstalledItems stay in their original local registry. Stable target IDs survive renames; getters derive current domain state, and harmless setters absorb generic host MCP projection writes. Serialization exports metadata only and cannot include controller credentials. Descriptor membership drives registration/removal, including host hot-update ordering, without replacing prototypes or writing shared current-version/config state. Source-discovery failure invalidates only this plugin projection and preserves valid sibling service candidates.

## Existing host limits

No grain answer was received during implementation; the stated whole-cluster default was used. Native startup selection permits one target for a service module per startup group. Native binary member state means any-running aggregates remain stoppable but startup skips starting a partially running cluster; stop then start it, or use sidebar start-all to fill members. These limits are tested/documented rather than bypassed through hidden side effects, disguised module types, or host edits.

## Verification

- Complete suite: **128 tests / 127 pass / 1 default native skip**, zero failures. Added batch tests cover duplicate/conflicting invocations, non-interactive intent, source failure, independent partial success, hide handoff, late stale snapshot, and supplementary final-refresh failure without replay.
- Native host Module, StartupGroup Runtime/Runner/Candidate integration tests use environment boundaries only. They cover candidates/identity/serialization, no generic shared-config writes, single-choice and partial-state limits, background forwarding, partial failure, hidden/deleted targets, cold/hot registration, re-enable, and valid sibling preservation after discovery failure.
- Sidebar real-SFC/Vue render checks cover off/on, all/member busy, empty list, switch change actions, and global background intent.
- Independent review found one Important race: groups could join an older refresh captured before a sibling starts. Actual-controller regression reproduced stopped metadata despite a live physical process, then passed after a fresh batch-wide final refresh. The refresh remains supplementary and retains all completed lifecycle outcomes. Follow-up review found no remaining Important/Critical issue.
- ESLint: zero errors, three inherited version-help warnings. Full vue-tsc matches the existing **53-diagnostic baseline byte-for-byte**. Boundary audit, production build and archive manifest/entry/Fork import checks pass.
- Host `src`/`scripts` are unchanged from `619d7c8d`. No new Pinia, module data in shared config.setup, host source modification or prototype patch. Native daemons were not rerun for this renderer integration; the previously verified Fork implementation is unchanged.

Archive: `dist/plugins/mysql-cluster/mysql-cluster-0.1.9.flyenv-plugin`, 1641443 bytes, SHA-256 `11ee1d327fdad53741de88ace7ba781bb763a056d07e5a01e6be336583df75a8`, matching registry. No installation/activation, user service/database change, package-manager operation, publication or push. Archive-check temporary files were cleaned.
