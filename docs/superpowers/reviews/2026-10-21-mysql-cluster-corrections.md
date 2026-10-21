# MySQL Cluster 0.1.2 correction verification

## Requested outcomes

1. Services copies the host ServiceManager presentation, columns, note editing styles, environment statuses, aliases, version errors, custom directories, refresh and native MySQL management entry. The lifecycle column and phpMyAdmin entry are removed. The local management drawer also omits those controls. Versions mirrors the native MySQL manager header, Homebrew/MacPorts tables, Windows static virtual table, command copy/help, missing-manager guidance, terminal and confirmation footer. All mutations retain plugin installation admission/removal guards; mounting a page does not own a package operation. Reentry selects the source of any still-visible package task.
2. `/mysql` and `/mysql-cluster` retain separate routes. The cluster aside now uses the established AsideSetup navigation protocol and synchronizes currentPage on router/history changes, removing the stale MySQL selection.
3. MysqlClusterController writes JSON snapshots at its persistence boundary, including nested reactive preferences. Raw Vue proxies never reach IndexedDB. Existing storage failure propagation, serialized updates and prepared-instance retry behavior are retained.
4. Replication no longer has the artificial 8.0/8.4 series allowlist. Minimums remain MySQL 8.0.13 for this GTID workflow and 8.0.27 for this GR workflow. 8.x Innovation and 9.x are admitted; same version/installation and actual GR plugin requirements remain.

## Evidence

- Focused suite: 88 tests, 87 pass, 1 native test explicitly skipped without its environment variable, zero failures. Added reactive structuredClone persistence regression was observed failing before the fix; new version policy regression also failed before the fix.
- Separate native acceptance with `/opt/homebrew/Cellar/mysql/9.6.0/bin/mysqld`: one test passed, 103.39s execution (105.21s runner). The harness now reads the real binary version instead of labeling all runs as 8.4.8. Standalone, real GTID write replication/source port update, database/user creation, read-only rejection, dump, three-node GR writes/election/rejoin/full-stop recovery passed. Temporary data/processes were cleaned.
- Real packaged renderer in Chrome with an isolated original-host-shaped bridge: distinct sidebar selection; copied service columns/menu; native version columns/source radios; note double-click/edit/save; bilingual light/dark display; 9.6 standalone and replication creation using actual IndexedDB passed without DataCloneError. Backend IPC responses in this browser fixture are controlled; native replication correctness is established by the separate real MySQL test, not the browser fixture.
- Renderer operation boundary audit passed. All real top-level plugin Vue templates compile in the focused suite; the plugin production build also compiles nested host views.
- ESLint: zero errors; three `vue/no-v-html` warnings for copied host localized installation-help templates.
- Full vue-tsc with 8GiB: 53 existing diagnostics, byte-for-byte identical to the baseline, zero plugin diagnostics. The default Node heap was insufficient, so the completed check used the established larger heap.
- All host source remains unchanged: `git diff 619d7c8d -- src scripts` is empty.
- Final archive: `dist/plugins/mysql-cluster/mysql-cluster-0.1.2.flyenv-plugin`, 601080 bytes, SHA-256 `f96cc38eec9274977b10e5d949bc635905f3c179302d90a5b055cb55e787bb18`, matching plugins/registry.json. Manifest/renderer/fork entries verified.

## Failure-boundary review

Storage is a required prerequisite for creation/preferences; failure still blocks dependent initialization without overwriting Fork preparation. Notifications/installed-list refresh remain supplementary. Native shared backup success can leave a legacy host promise pending, so the plugin observes its existing backuping terminal state before invocation and cleans the observer on settlement; it does not emit a separate success. Homebrew setup reuses its module-owned package flight and a private localized script. Main discovery acknowledgement is immediate, so bootstrap success now waits for the actual BrewCellar broadcast, cancellation or timeout, with watcher and IPC listener cleanup. Regression checks cover delayed discovery and cancellation. No installer was executed during verification.

The implementation was self-reviewed against the module/failure contracts. An additional reviewer investigated the immediate discovery acknowledgement; its full review could not finish due to agent capacity. That concrete finding was independently verified in main-process source and fixed with failing/passing tests.

Windows/Linux native behavior, other MySQL builds and actual package-manager installation remain unverified. This release does not modify or automatically reinstall the user's active plugin or services, and is not published.
