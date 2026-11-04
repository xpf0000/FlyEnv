# MySQL Cluster 0.1.14 cold plugin import

## Root cause and correction

The actual Electron DevTools error and the user's pasted trace matched: reactiveBind evaluates prototype getters when binding the singleton. The obsolete DbGate nodeAvailable getter called selectedNode during plugin import, before the host AppStore bridge was initialized, so the entire plugin failed to register. The development manifest/files and automatic enablement were valid. This could also affect production cold loading; earlier tests supplied an already-ready store and replaced reactiveBind with identity.

Removed the unused getter. The instance header already allowed cold Node inventory, so no replacement state or eager initialization is required. Explicit DbGate open/discovery remains the sole place that reads installed Node and selected configuration. The existing singleton ownership, hidden-Node discovery, duplicate guard and terminal behavior are unchanged. No host, script, Fork, persistence, process or failure-boundary changes.

The existing singleton regression now bundles the actual host reactiveBind helper and supplies an AppStore that throws until marked ready. It reproduced the exact AppStore initialization failure before the fix. Afterward import performs zero store reads, then hidden/cold discovery and retry work after readiness. Removed the obsolete getter assertion from the pure controller test.

## Verification

- Focused real-binding regression RED then GREEN (`/tmp/mc-dev-load-{red,green}.log`); final focused tests passed (`/tmp/mc-dev-load-focused-final.log`). Full plugin suite:193 tests,191 passed,two default native skips,zero failures (`/tmp/mc-dev-load-tests.log`).
- Real development artifact loaded from a Blob in a browser with host store unavailable until import completed: mysql-cluster exported and startup module registered. Existing Electron development process was rebuilt through its watcher; the actual localhost:4000 window showed MySQL Cluster in the sidebar and existing instance groups at /mysql-cluster. Screenshot `/tmp/mysql-cluster-dev-restored.png`. No service lifecycle buttons/commands were invoked; the development app performed its normal restart behavior.
- Production artifact was also tested through the Blob import path with deferred host-store readiness. No already-ready-store shortcut was used.
- Development and production builds passed. ESLint zero errors/three existing copied-help warnings; renderer operation boundaries passed. vue-tsc output byte-identical to the existing53-diagnostic baseline (`/tmp/mc-dev-load-{lint,boundaries,types}.log`). No Fork changes, so native installation/SQL tests were not repeated.
- 7z integrity/extracted manifest/registry checksum passed. Package `dist/plugins/mysql-cluster/mysql-cluster-0.1.14.flyenv-plugin`:1,653,516 bytes; SHA-256 `0fcc60930dd2615c066cc4b913ef73ea14a81176be3b32eec31ec81a878f1b1d`.
- Host src/scripts contents remain identical to619d7c8d. No release, upload, activation or push. Isolated preview server/tab/files cleaned up; existing user development app retained.
