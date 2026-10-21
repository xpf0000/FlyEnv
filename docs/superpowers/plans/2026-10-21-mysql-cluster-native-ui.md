# MySQL Cluster native UI alignment

Scope: user-authorized corrections 1–6, implemented entirely in the plugin. No host source changes, new Pinia store, shared configuration, or lifecycle exceptions.

- Errors: existing controller owns validation and operation terminal notices; use public Element helpers, escaping text because the public helper renders HTML. Notification failure is supplementary and cannot undo completed writes.
- Directories: create form owns drafts; default under Server.BaseDir/mysql-cluster/data, hide root input and preserve per-instance custom paths. Fork catalog owns stopped-instance edits and identity. Prepared empty instances may change directory after canonical overlap/emptiness checks. Initialized data is not relocated: MySQL retains absolute binlog/tablespace paths and moving files would need a dedicated migration feature. Journal config updates and block starts on partial failure; never overwrite existing data.
- Icons: mounted views choose controls from Fork snapshots. Existing manager/ModuleInstalledItem retains lifecycle ownership. Match native status classes and icon-only buttons.
- Files: local singleton owns opening/read/save/file dialogs and terminal notices, guarding duplicate work. Mounted editor owns Monaco model disposal. Log component reuses host watcher/editor lifetime. Config write is a required guarded Fork dependency; notices are supplementary. No ordinary MySQL restart.
- Data: local management singleton retains per-instance credentials/preferences/SQL/backup requests. Copy native MySQL views with local adapters. Read-only source/secondary rules remain enforced in Fork. Backup results remain valid if opening the output folder fails; saved SQL side effects are not replayed after preference failures.
- Connection info: singleton snapshots instance connection data, awaits clipboard, and reports success/failure through public notifications. Duplicate copy/open requests join their current operation; a page unmount does not cancel admitted work.

Verification: focused controller/clipboard/management/directory tests, complete plugin suite, ESLint, host boundary test, type diagnostics compared to known baseline, plugin package build, native directory round trip if relocation changes. Review partial completion and every new rejection before commit.

Independent tasks delegated under dispatching-parallel-agents skill: native file drawers, native management views, directory safety. Parent owns notifications, controls, routing, integration and verification.

File path resolution is a guarded instanceFiles(id) Fork query; config read/save stay plugin methods. Management per-id flights survive drawer close and share duplicate requests. Account password save updates local credentials only; reset uses guarded SQL. SQL success remains success if preference/list refresh fails.

Follow-up (0.1.5): view-only shared engine summary per card, preserving per-row version/path for mixed installations; Edit/Delete use native Element Plus icons; each lifecycle button renders either its icon or spinner, and restart busy binds to restart. No new operation/state owner, persistence, IPC, process or failure boundaries; existing controller progress/terminal lifecycle remains unchanged.

Follow-up (0.1.6): mounted view alone hides standalone role/lag and GR lag columns. No new state owner, IPC, operation or failure-boundary changes; verify actual rendered columns for all three modes.

Follow-up (0.1.7): header lifecycle renders only its admitted action while busy, with native loading and no action icon; idle stopped= start, all running= stop/restart, mixed= start/stop. View derives these from the existing controller operation and Fork snapshots, with no new UI operation state. Controller retains busy/reentry until its existing final refresh settles; final refresh is supplementary and may report loadError without rejecting/replaying completed service work. Lifecycle owner, shared ModuleInstalledItem and process ownership unchanged. Regression covers delayed refresh, duplicate/conflicting commands, and refresh failure releasing busy. Status cell shows process state only; replication diagnostics belong to the role tooltip. No shared state/configuration exceptions.

Follow-up (0.1.8): each row derives its active lifecycle action from the existing group operation first, otherwise its member operation. While either is busy the corresponding row action alone renders with loading; existing groupBusy disables all competing actions. No new operation flags, RPCs, persistence or process ownership; existing terminal refresh and failure semantics unchanged. Verify idle, group start/stop/restart across mixed snapshots, and a single-member operation without affecting sibling loading.
