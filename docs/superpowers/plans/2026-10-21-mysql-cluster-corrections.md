# MySQL Cluster corrections

User authorized four bounded corrections: copy host Services/Versions presentation and features, removing only service lifecycle controls and phpMyAdmin; isolate sidebar selection; fix IndexedDB cloning during creation; permit supported MySQL innovation/9.x replication. All production changes remain inside `plugins/mysql-cluster`; no host exception is authorized.

## Ownership and operation contract

- Inputs, source filters, note edit state and terminal DOM attachments remain mounted-view state. Existing MySQL installed versions/notes/env/aliases retain their established shared owners. Plugin operation/domain state remains module-local reactiveBind singletons, not a new Pinia store or config.setup extension.
- Creation/settings persistence stays in MysqlClusterController, module lifetime, serialized writes. Required Storage writes receive detached plain JSON records so Vue proxies never cross IndexedDB's structured-clone boundary. Existing failure/retry and prepared-instance recovery remain intact; no replay of successful Fork preparation.
- Installation/removal remains InstallationsController, module lifetime: immutable row snapshot; fetching/progress/output events are intermediate; success/failure/cancellation and cleanup are terminal; duplicate same-row calls share a flight, conflicting calls are rejected. Existing guard, admission, terminal cleanup and exact process ownership stay in force. A view unmount only detaches its DOM. Installation result is primary; post-install refresh/notice failures remain supplementary.
- Service start/stop/restart remains ModuleInstalledItem and the Fork plugin, unchanged. Sidebar uses the existing AsideSetup navigation state contract with the separate `/mysql-cluster` route; no host path or plugin typeFlag change.
- Replication validation retains minimum supported command/config capabilities and uniform version/install membership, removes the artificial 8.0/8.4 series allowlist, accepts 8.x innovation and 9.x. GR still requires the real plugin; configured XCom options must be verified on actual 9.6.

## Validation

1. Regression fails then passes with reactive controller + structuredClone storage boundary, including remembered credentials and nested preferences.
2. Version policy and real catalog acceptance for 8.1/9.6/9.7, existing invalid/mixed version and GR capability checks retained.
3. Actual native 9.6 standalone/GTID write replication/source-port update/three-node GR/election/rejoin/full-stop recovery using only temporary test data/processes. Native harness reads the real tested binary version.
4. Compile all views, lint plugin, focused plugin suite and renderer operation boundary audit; build 0.1.2 and verify registry/hash. Check src/scripts diff is empty.
5. Inspect copied page parity, guarded removals, route selection and actual packaged renderer where feasible.

## Additional copied operations

The copied version page retains Homebrew setup and terminal confirmation. Bootstrap uses the same InstallationController flight, admission, cancellation and terminal cleanup as package installation. Fork prepares a private copy of the host localized install script; renderer executes it in its owned PTY and asks the existing main-process discovery to refresh environment. Script preparation/execution and detection of the installed Homebrew are required; the immediate discovery acknowledgement does not prove detection. The controller waits for the Server.BrewCellar broadcast or explicit cancellation/timeout, cleaning its watcher and IPC listener. Subsequent installed-version refresh is supplementary and cannot turn completed package work into a failure. Bootstrap is only invoked on an explicit click, never during checks.

Copied service management uses the established MySQLManage state owner; plugin singleton owns dialog mounting and request reentry. Shared backup completion is observed before invocation because older host success callbacks can leave their returned promise pending while clearing backuping. No duplicate backup or fake success is inferred before its declared shared terminal state. Windows bundled/custom entry removal preserves the existing host hide/exclude policy with the plugin usage guard; managed package deletion remains under the plugin controller.

Compatibility reference: [Oracle MySQL Group Replication requirements](https://dev.mysql.com/doc/refman/9.7/en/group-replication-requirements.html) and [MySQL 9.6 release notes](https://dev.mysql.com/doc/relnotes/mysql/9.7/en/news-9-6-0.html). Oracle redirects the 9.6 manual URLs to the 9.7 manual; actual 9.6 binary verification is the decisive compatibility evidence here.
