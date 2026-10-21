# MySQL Cluster 0.1.4 native UI alignment

All runtime changes are inside `plugins/mysql-cluster`; host `src` and `scripts` remain unchanged from `619d7c8d`.

## Result and boundaries

Creation/edit validation and operation failures use the public `src/render/util/Element.ts` helpers through a plain-text escaping adapter. The former modal helper and global modal CSS were removed. Connection copy now awaits clipboard completion and shows a public success/error notice; duplicate requests share their current operation. Drawer opening and cleanup belong to a plugin singleton.

New data defaults to `<BaseDir>/mysql-cluster/data`, meaning `server/mysql-cluster/data`. The root input is hidden. Each node accepts its own path, retained when changing ports/count/mode. Prepared empty instances may retarget their directory after stopped/receipt/emptiness/canonical-overlap checks, using the existing configuration journal. Initialized or uncertain data remains read-only with an explanation: this change does not relocate MySQL files containing persisted absolute paths. Old empty directories are retained; existing data is never moved or overwritten.

Card and row lifecycle controls share one icon component. Start/restart hover is yellow-500; native running status supplies stop green `#01cc74`. Existing Fork state and ModuleInstalledItem lifecycle remain authoritative.

Config/log wrappers copy the PHP drawer structure. Logs use the actual public Log and LogTool components. Config copies the public Conf editor/tool layout, uses the native Monaco utility, and retains plugin guarded read/save RPC; it cannot restart an ordinary MySQL service. Custom export blocks canonical destinations inside managed instance files. Editor teardown disposes its own model only. Native log helper behavior is inherited unchanged.

Data management copies the MySQL drawer/table/add/password/backup-directory views and adapts them to the plugin singleton, keeping credentials, notes, lists and backup settings isolated by instance. Save-password remains local, reset-password executes guarded SQL; readonly members cannot reset/add. Completed SQL remains completed when optional preference/list refresh fails. Exact user@host targets are preserved. Backup results survive a folder-open failure.

## Verification

- Complete plugin suite: 115 tests, 114 pass, one explicit default native skip, zero failures. Includes structured-clone transport, prepared directory/receipt/canonical paths/interrupted retry, clipboard completion/failure/reentry, public notices, management isolation/partial effects and native drawer controller operations.
- A browser check found the first-created file state was returned as a raw object by a nullish assignment. Returning the state through the reactive map fixes title/log readiness updates. The focused Vue regression fails against the old factory and passes against the fix.
- Native Homebrew MySQL **9.6.0**, macOS arm64: full acceptance passed in 96.4 seconds, including standalone, real source/replica data, management writes/backups/readonly refusal, port update, GR election/rejoin/full-stop recovery. Test-owned processes/data were cleaned.
- Chrome with real Vue views, host styles, Monaco, native Log and controlled transport: card/row icons, native stop RGB(1,204,116), connection copy success, PHP-style config/log editors and toolbars, MySQL table/add dialog, hidden root/required markers, default `server/mysql-cluster/data`, custom data path retained on port changes, and missing-password public non-modal notice verified. This is renderer validation, not Electron or Windows/Linux acceptance.
- ESLint: zero errors, three unchanged version-help v-html warnings. Renderer operation boundary audit passed. Full vue-tsc at 8GiB: identical byte-for-byte to baseline with 53 existing diagnostics, no added diagnostics. Nested Vue template/script compilation passes.
- Production package built. Archive manifest, both entry files, and imported Fork instanceFiles API verified with host dependencies. Registry hash matches archive.
- Archive: `dist/plugins/mysql-cluster/mysql-cluster-0.1.4.flyenv-plugin`, **1,636,013 bytes**, SHA-256 `d683c4021ada29bf7b23c4fc9c6ae1eeec535ba7613b89fe28d8f08522e67f40`.

Independent review found no additional Important/Critical issue. Its minor backup-directory edit-during-save issue was fixed by disabling that input while persistence/picking runs. Config writes, initialization guards and required catalog/config failures continue to propagate; notifications, post-SQL preferences/list refresh and opening backup folders remain supplementary.

No user service, installed plugin or database was changed. No package-manager install, publication, activation or push. Temporary preview tab/server/files were cleaned. Windows/Linux native acceptance and initialized-data migration are outside the verified scope.

## 0.1.5 card follow-up

Per-card computed engine summaries display version/path in the header only when all members share both values; mixed installations retain both row columns. Edit/Delete use actual Element Plus icon components in the header/menu. ActionButton suppresses its entire icon slot while Element Plus renders its spinner; the row restart button owns restart loading instead of the stop button.

Real SFC compilation + Vue SSR checks verify shared/mixed column rendering and exactly one SVG (action icon or native loading spinner) for start/stop/restart/Edit/Delete in both loading states. Complete suite remains 115 tests / 114 pass / 1 default native skip. ESLint has zero errors / three inherited warnings, types remain byte-identical to the 53-diagnostic baseline, renderer boundary check and package build pass. No Fork changes, so the native 9.6 run was not repeated for this view-only follow-up. Host src/scripts remain unchanged.

Package `dist/plugins/mysql-cluster/mysql-cluster-0.1.5.flyenv-plugin`: 1,636,244 bytes, SHA-256 `b38a9f4afee10fd817d1604a7f5cc1290d202d90d8962980be8b98f698751b75`, matching registry. Temporary render-check script cleaned; no activation/publication/push.


## 0.1.6 mode-specific columns

Standalone hides role/lag; Group Replication keeps role and hides lag; source/replica keeps both. Actual SFC/Vue SSR checks verify all three modes and the table control column is rendered. Full suite: 115 tests, 114 pass, 1 default native skip; lint: 0 errors/3 inherited warnings; build passed. No lifecycle, Fork or host changes; no new operation contract. Package dist/plugins/mysql-cluster/mysql-cluster-0.1.6.flyenv-plugin: 1636434 bytes, SHA-256 `dde7eef94741b9cdb4c43d137152be18b3a181ecb252853cf5d1fede58deb2b6`, matching registry.


## 0.1.7 header lifecycle and process status

Header start/stop/restart now binds loading to the admitted group operation and renders only that active action until it settles. Idle all-stopped exposes start, all-running exposes stop/restart, mixed exposes start/stop. Other commands remain disabled during the group operation. The controller now keeps busy/duplicate guard until its existing final refresh finishes, preventing a stale-state button flash and a second admitted operation during refresh. A failed supplementary refresh retains the completed service result and releases busy; no new queries or retries were introduced.

Status displays only the process state. Replication health text is removed; replication errors remain available on the role tooltip. Process errors stay on the process status tooltip.

A delayed-final-refresh regression failed before the guard change and passes after it; a supplementary-refresh failure test confirms completed stop is not rejected or repeated. Complete suite: 117 tests, 116 pass, 1 default native skip. Nine real-SFC/Vue render scenarios verify idle/mixed actions, active action loading through snapshot changes, and process-only status. ESLint: 0 errors/3 inherited warnings; full types identical to existing 53-diagnostic baseline; boundary audit/build passed. No Fork or host-source changes; native daemon tests were not repeated for this renderer-only operation-lifetime fix.

Package `dist/plugins/mysql-cluster/mysql-cluster-0.1.7.flyenv-plugin`: 1636478 bytes, SHA-256 `d4b99fc5f00a482c347926cee327b632e3c3c731b2b355cd108d95c4d0d0b1df`, matching registry. Temporary render script cleaned; no activation/push/publication.


## 0.1.8 batch loading on member rows

Rows use the group lifecycle action while busy, otherwise their own member lifecycle action. The active action remains visible alone with loading, and all competing actions retain the existing groupBusy disabled guard. No renderer operation flags, extra lifecycle calls or Fork changes. Eight actual SFC/Vue render scenarios verify group start/stop/restart across changing mixed snapshots, isolated single-member loading, sibling disabling, and idle restoration. Full suite: 117 tests / 116 pass / 1 default native skip; ESLint: 0 errors/3 inherited warnings; types identical to 53-diagnostic baseline; boundary/build passed. Host src/scripts unchanged.

Package `dist/plugins/mysql-cluster/mysql-cluster-0.1.8.flyenv-plugin`: 1636726 bytes, SHA-256 `4c2f49daf9ffa341a999cb77cbca1c49a4e463a0d7f59fed134c0522168b75f6`, matching registry. Temporary render script cleaned. No activation/publication/push.
