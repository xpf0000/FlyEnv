# Plugin market hardening

## Scope and ownership

- Main-process `PluginManager` owns installed-plugin records, source records, downloads, archive validation, install/update/uninstall transactions, and the fork plugin snapshot. Its state lasts for the application process and is persisted in `plugins.json`.
- The module-local renderer `PluginMarket` controller owns the IPC request, busy state, error, and restart fallback for each market operation. The mounted Vue page owns only the current tab, input, and dialogs.
- Fork modules continue to own service processes and liveness. The manager asks `Application.stopPluginServices` to stop a module before disabling, updating, or uninstalling it; renderer state is never used as a liveness check.

## Operation contract

| Operation | Start | Intermediate events | Terminal event | Duplicate calls | Service interaction |
| --- | --- | --- | --- | --- | --- |
| Install/update | Manager receives IPC request; controller marks plugin busy | Download, checksum, archive validation, staging | IPC success after state and fork snapshot sync, or error; controller clears busy and hot-syncs or requests restart | Same plugin shares one promise; all state-changing operations run in one queue | Stop existing service before replacing files |
| Enable/disable | Manager receives IPC request | Stop on disable | IPC success/error; controller clears busy and hot-syncs or requests restart | Same plugin shares one promise; queued behind other state changes | Fork remains owner of PID and stop result |
| Uninstall | Manager receives IPC request | Stop service; remove or defer files | IPC success/error; controller clears busy and hot-syncs or requests restart | Same plugin shares one promise; queued behind other state changes | Stop before removing plugin code |
| Catalog/source change | Manager receives IPC request | Registry fetch or source state write | IPC success/error; controller clears request state | Duplicate source edits share one promise; writes run in the manager queue | None |

## Invariants

- A scan never backfills a version 1 install token without an active license; missing or unreadable install secrets never disable the check. New state remains module-owned in `plugins.json`, not shared setup configuration.
- Downloads are limited as bytes arrive. Archive entry count and declared extracted size are checked before extraction; the extracted tree is checked before activation.
- Renderer plugin-load failures leave existing routes, modules, and styles intact. Successful sync reuses unchanged module code, updates styles, and releases its IPC listener.
- No new Pinia store or module-specific public service type is added.

## Verification boundary

This session does not run or add tests. The lifecycle cases to verify when requested are concurrent installs and source edits, migration without a license, missing install secret, oversized download and archive, plugin-load timeout, same-version reinstall, and CSS update/removal.
