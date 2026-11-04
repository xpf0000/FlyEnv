# MySQL Cluster 0.1.1 — plugin-only correction

The user requested that every adaptation remain in the plugin. This supersedes the original
0.1.0 paired-host implementation. `git diff 619d7c8d -- src scripts` is empty: every host runtime
and boundary-script modification was restored, and no host class/prototype is patched at runtime.
Implementation remains on `codex/mysql-cluster` in `.worktrees/mysql-cluster`.

## Result and ownership

- Service and version views, removal policy, lifecycle registry, operation state, notifications,
  terminal admission/cancellation/cleanup and dialog ownership all live under `plugins/mysql-cluster`.
- Host ordinary `allInstalledVersions` returns an empty list. Plugin-specific `instanceDescriptors`
  supplies stable local `ModuleInstalledItem` objects; public start/stop/restart and per-module extension
  arguments are reused. Original host Module integration tests observe zero shared config writes.
- Existing mysql installation APIs/lists, environment, aliases and search-directory settings are reused;
  no new Pinia store or module fields in config.setup were introduced.
- A retained terminal DOM survives main Tab changes; cancelling during initialization waits for the PTY
  key, stops that exact key and disposes once. Hiding the plugin waits admitted lifecycle work before stop.
- Static removal checks managed package roots, canonical data/engine paths, running/unknown instances
  and visible foreign processes. Package-manager removals never use MacPorts follow-dependents.
- Fork catalog, SQL, replication, Group Replication and data management remain plugin-owned.

## Independent review and one fix pass

Read-only review range `95d76467..8f704f1b` found no Critical, two Important and no deferred minors.
Both findings were accepted and fixed with RED→GREEN regressions; no re-review was dispatched.

| Finding | Fix | Evidence |
| --- | --- | --- |
| Host installSoft can return code=0,data=false | Require both code=0 and data=true; failure still refreshes actual installed state | Original response-envelope regression; packaged UI displays failure/retry for false |
| Cancel during NodePty:init stops an empty key and leaks the eventual PTY | Local terminal session waits mount handshake, shares exact stop and destroys once | Delayed-init regression and 8-second browser IPC fixture; only mock-terminal stopped, no empty key, no remaining xterm |

Related fault-injection tests also cover realpath aliases (/var versus /private/var), symlinked data,
foreign processes, cancelled/failed mutation refresh, dialog close without submit, local object identity,
hide during admitted startup and removal of deleted snapshots.

## Verification

- Focused suite: 78 tests, 77 pass, 1 explicit native default skip, 0 failures.
- Separate native: Oracle MySQL Community 8.4.8 macOS arm64, pass in 97.12 seconds. Real standalone,
  GTID writes, changed source port, database/user grants, readonly refusal, mysqldump, three-node GR,
  election, rejoin and full-stop recovery. Temporary test roots/processes were cleaned.
- ESLint: no errors or warnings. Original renderer boundary audit and plugin-local view audit pass.
- Full vue-tsc with 8 GiB heap: exact same 53 baseline diagnostics, no new diagnostics.
- Plugin build succeeds. Package: `dist/plugins/mysql-cluster/mysql-cluster-0.1.1.flyenv-plugin`,
  588089 bytes; SHA-256 `fdcb38d42347461d1d5817bb36a8c1ccc4916304e182df27a86a872e895f7ec0`.
  Registry hash, single manifest/version and render/fork/CSS payload verified by unpacking.
  Bundled Fork module loads; both host scan and empty local descriptor query return empty arrays.
- Browser loads the actual packaged renderer with the original host bridge shape (no added hooks).
  Verified three Tabs, service list without run controls, one-instance stop while the sibling stays
  running, zero shared-config writes, running-version removal refusal, custom-dir close/reopen,
  retained terminal across Tab changes, failure envelopes, delayed-init cancellation, en/zh,
  light/dark and a 600px viewport with page width 600px.
  Network/native IPC/package commands in this browser harness are fixtures, not actual installations.

## Rulings and remaining limits

1. Host scans intentionally do not enumerate instance descriptors. Local UI and plugin queries own that
   collection; cost: generic APIs that only read installed-version rows do not enumerate these instances.
   Actual service PID/stop arguments still use the existing main-process registration contract.
2. Services/Versions are maintained locally rather than rendered by host component objects. Cost:
   additional bundled UI/adapter code and responsibility for following future host API changes.
3. MacPorts no longer follows dependents. Cost: its package manager can refuse removal while another
   package depends on that version; the plugin never expands the removal set to bypass that refusal.
4. Static package deletion refuses directories containing managed data/catalog files and uncertain
   running references. Cost: unusual layouts require manual cleanup, preserving database files.
5. Removal protection applies to this plugin's entry points. External package-manager commands and
   unrelated built-in UI entry points cannot be intercepted without modifying the host.
6. Windows/Linux/MySQL 8.0 and MacPorts resource layouts remain native-unverified. Actual Homebrew,
   MacPorts and Windows download installation were not executed against the user's environment.
   The original acceptance limits for arbitrary outside-client GR recovery races remain unchanged.

No publishing, activation, source merge or user service/database changes were performed. Preview
server/tab were closed and viewport override reset after verification. Branch/worktree retained.
