# MySQL Cluster 0.1.3 instance corrections

## Root cause and result

The 0.1.2 Storage snapshot corrected the IndexedDB boundary but did not detach the credential returned by startExtParam, or the credential/member arrays passed to plugin RPC. ModuleInstalledItem serializes its primary installed item, but forwards extension parameters unchanged. Vue proxies in those extensions cause Electron to reject both member starts before the Fork receives them. The plugin now snapshots both extension credentials and complete outgoing RPC argument lists, without changing the host lifecycle or prototypes.

A new regression runs the actual plugin manager/controller/ModuleInstalledItem/forkTerminalRequest against structuredClone at IPC.send. Before the fix it reproduced separate `#<Object> could not be cloned` failures for each source/replica and GR member. After the fix, both workflows create/configure/status/restart/remove successfully through the same checked transport. The older accepting IPC fixtures did not exercise this boundary; they are not treated as evidence for this particular fix.

Creation/edit operation failures now request one modal notice from the controller; validation uses the same owner. The form's bottom error block is removed and required fields show Element Plus markers. Notification/close failure cannot change the operation outcome or discard prepared records. The dialog continues to close after a partially prepared group has been recorded so retry uses those same records.

Stopped rows and stopped groups expose start. Running rows and fully running groups expose stop/restart. A partially running group exposes start/stop. The row icon is keyed by its action because the existing SVG component resolves its input only when mounted; this prevents a stale play glyph after startup.

Default SQL ports start after the highest saved SQL port and skip conflicts across SQL and GR ranges, including stopped nodes. GR reserves its +100 block. Exhaustion and TCP limits are handled. Changing automatic mode/count recalculates the range; actual user input/stepper changes retain the chosen port. Fork OS-port validation remains authoritative for unrelated services.

## Verification

- Focused suite: 94 tests, 93 pass, one explicit native default skip, zero failures. Six added regression cases cover both real lifecycle/transport workflows, modal routing and the port allocator. The clone, modal and allocator regressions were observed failing before their fixes.
- Packaged renderer in Chrome uses a strict structuredClone IPC bridge and real browser IndexedDB: source/replica and GR creation passed without clone errors. Backend replies are controlled; this is renderer/serialization verification, not a new native daemon run.
- Browser checks: required markers on the form; missing root password opens a modal; injected three-member initialization errors appear together in a visible modal; no JavaScript errors. With existing ports 13306/13307 a new source/replica pair uses 13308/13309, and the next dialog initializes 13310. Actual keyboard entry 13350 is retained through a GR-mode change and produces SQL ports 13350..13352. Stopped row lacks restart; started row switches to stop/restart with the correct glyph.
- Plugin ESLint: zero errors, three unchanged v-html warnings in copied version-help templates.
- Full vue-tsc (8GiB): 53 existing diagnostics, identical byte-for-byte to the established baseline; no new diagnostics.
- Renderer operation boundary audit and production build passed; Vue view expressions compile. Host source unchanged: `git diff 619d7c8d -- src scripts` is empty.
- Final archive: `dist/plugins/mysql-cluster/mysql-cluster-0.1.3.flyenv-plugin`, 601461 bytes, SHA-256 `d611ceff79e7ed7f7d17b29d25bec19bf7f22a916be4478b70e9cea3da67dbfe`, matching registry. Manifest and payload entries verified.

The prior native MySQL 9.6 acceptance remains applicable to the unchanged Fork implementation; it was not rerun for these renderer corrections. No user service, installed plugin, package manager or database was altered by the checks; no publication/push.
