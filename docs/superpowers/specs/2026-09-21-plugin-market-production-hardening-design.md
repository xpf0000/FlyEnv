# Plugin Market Production Hardening Design

## Purpose

Turn the existing plugin marketplace MVP into a release-ready FlyEnv subsystem whose development, validation, build, debug, installation, runtime loading, upgrade, disable, and uninstall paths are exercised in a real Electron application.

The existing built-in module path remains unchanged. Plugins continue to use the fallback renderer and Fork loading path established by the MVP.

## Success Criteria

The work is complete only when all of the following are demonstrated:

- `plugin:dev`, `plugin:build`, `plugin:test`, and `plugin:debug` work for the Mailpit reference plugin.
- The built artifact, rather than its source tree, is loaded by `plugin:debug`.
- The official catalog exposes an installable package with a required SHA-256 checksum.
- A user can add a third-party catalog, inspect its plugins, acknowledge the native-code warning, and install one.
- Installation validates the archive, manifest, compatibility, entries, paths, checksum, and module conflicts before activation.
- An update switches active versions atomically, retains one rollback version until the new version has loaded successfully, and cleans obsolete versions later.
- Disable, update, and uninstall stop running plugin services first. A failed stop leaves the plugin enabled and installed.
- Uninstall never removes managed runtime binaries, configuration, logs, or user data.
- Pending file deletions survive Windows file locks and are retried at the next launch.
- Invalid or conflicting plugins are reported without preventing FlyEnv from starting.
- A real Electron smoke run verifies renderer navigation, Fork calls, service start/stop, restart application behavior, update, disable, and uninstall.

## Scope

### Included

- Plugin CLI scripts and package commands.
- Plugin manifest and catalog validation.
- Main-process plugin discovery and transactional mutations.
- Renderer plugin marketplace state and UI.
- Fork plugin snapshot refresh and cached runtime loading.
- Mailpit reference plugin and official local/release catalog metadata.
- Focused automated tests and an actual Electron smoke workflow.

### Excluded

- Migrating existing built-in modules into plugins.
- A remote marketplace backend or developer accounts.
- Sandboxing arbitrary Node.js plugin code.
- Deleting service binaries or module data when a plugin is uninstalled.
- Hot unloading Vue modules from a running renderer.

## Architecture

### PluginManager

The main-process `PluginManager` remains the source of truth for installed plugins, sources, active versions, enabled state, validation errors, and deferred deletion.

All state-changing commands run through one serialized mutation queue. Read-only catalog and installed-list operations may run concurrently. Every mutation writes state through a temporary file and atomic rename.

Discovery returns both valid installed records and invalid records with a user-visible reason. One broken plugin cannot abort application startup or hide other valid plugins.

### PluginMarketController

A module-local renderer singleton owns marketplace requests that can outlive the mounted settings page. The Vue page binds its reactive state and invokes controller commands.

The controller owns request snapshots, duplicate invocation guards, IPC listener cleanup, progress state, error state, terminal results, catalog refresh, and restart prompts. It does not use a new Pinia store.

### Fork Runtime

Fork modules remain responsible for child process, PID, port, health, and stop behavior. PluginManager does not infer process liveness from renderer state.

Before update, disable, or uninstall, the main process queries `ServiceProcessManager` for the plugin module ID. When running instances exist, it asks the existing Fork lifecycle to stop them and waits for terminal results. The mutation proceeds only after all tracked instances are stopped.

### Renderer Loading

Installed renderer plugins continue to load before mounting the Vue app. A failure in one renderer plugin is recorded and skipped. Built-in modules remain synchronous, and plugin routes are added before mount.

Plugin enable/disable, update, and uninstall continue to require application restart for renderer changes. The UI states this before executing the operation and provides a relaunch action after success.

## Package and Validation Contract

The plugin archive contains `plugin.json` at its root, or inside one enclosing directory. Installation rejects:

- archives over the compressed and expanded limits;
- absolute paths, traversal paths, symlinks, hard links, or entries resolving outside staging;
- a missing or malformed manifest;
- an unsupported plugin API version;
- a malformed semantic version;
- an unsupported FlyEnv version or platform/architecture;
- missing renderer or Fork entry files;
- plugin IDs or module IDs that conflict with installed plugins or built-in modules;
- catalog/manifest ID or version mismatches;
- missing or mismatched SHA-256 checksums.

Third-party plugins remain native-code plugins. The UI must explain that they can read files, execute processes, and access the network. Installation requires an explicit acknowledgement for each third-party source or plugin, persisted by source URL so the warning is not repeated unnecessarily.

Digital signatures are not required for this release. The official catalog and all installable items require SHA-256. The manifest keeps a versioned API contract so signing can be added without changing package layout.

## Install and Update Transaction

1. Download to a unique temporary archive outside the active plugin tree.
2. Enforce the transfer and archive-size limits.
3. Verify the required SHA-256 checksum.
4. List and validate archive entries.
5. Extract to a unique staging directory.
6. Validate manifest, compatibility, entries, and conflicts.
7. Move staging into `plugins/<id>/<version>` without changing `activeVersion`.
8. Atomically write state with the new active version.
9. Refresh the Fork snapshot and installed list.
10. After a successful application restart/load, keep the immediate previous version as rollback and schedule older versions for deletion.

If activation fails before state commit, the previous state remains active. If state commit succeeds but refresh fails, restore the previous state. Never overwrite or delete the active version in place.

## Disable and Uninstall Transaction

1. Reject a duplicate operation for the same plugin.
2. Resolve the plugin and its module ID from PluginManager state.
3. Query tracked running service instances.
4. Stop every instance through the existing lifecycle.
5. Abort if any stop fails; keep files and enabled state unchanged.
6. For disable, atomically set `enabled: false` and refresh snapshots.
7. For uninstall, first disable and remove the active mapping, then rename the plugin root to a unique pending-delete path.
8. Delete the pending path immediately when possible; otherwise persist it for startup cleanup.

Runtime binaries, configuration, logs, and service data outside the plugin code directory are preserved.

## Marketplace Behavior

The page has three views:

- Official: official catalog plugins with Install, Update, Installed, or Incompatible status.
- Installed: active version, source, enabled state, validation state, update availability, disable, and uninstall.
- Third-party: source management plus the merged plugins supplied by those sources.

Version comparison determines whether an update exists. Reinstall is a separate recovery action and is not presented as Update.

Adding a source validates its URL and fetches/validates the catalog before persisting it. Removing a source does not uninstall plugins previously installed from it.

## Development Commands

- `yarn plugin:dev <name>` builds an unminified artifact into `tmp/plugins/dev/<id>` and runs FlyEnv against it.
- `yarn plugin:test <name>` validates source and built manifests, builds renderer and Fork entries, imports the Fork bundle, and runs plugin contract checks.
- `yarn plugin:build <name>` produces `dist/plugins/<id>` and the distributable archive.
- `yarn plugin:debug <name>` copies or builds the packaged artifact into a path that `yarn dev` does not clean, then starts FlyEnv against that immutable artifact.

## Operation Contracts

### Catalog Refresh

- Owner: `PluginMarketController` in Renderer; network fetch and catalog validation execute in PluginManager.
- Lifetime: may outlive the settings page.
- Start event: page entry or explicit Refresh.
- Intermediate events: per-source loading and warning collection.
- Terminal events: merged catalog success or request failure.
- Duplicate behavior: concurrent refresh calls share one promise.
- Service interaction: none.
- Tests: duplicate invocation, partial-source failure, page unmount/re-entry, listener cleanup.

### Install or Update

- Owner: PluginManager for transaction; PluginMarketController for renderer presentation.
- Lifetime: survives page navigation; renderer restart is requested only after terminal success.
- Start event: acknowledged Install, Update, or Reinstall command with an immutable catalog snapshot.
- Intermediate events: download, checksum, extraction, validation, activation, cleanup.
- Terminal events: committed success, validation failure, download failure, stop failure, or rollback result.
- Duplicate behavior: one mutation per plugin; repeated invocation returns the active operation.
- Service interaction: update stops all tracked plugin service instances before switching versions.
- Tests: duplicate invocation, progress retention, checksum failure, entry failure, rollback, running-service stop success/failure, retry.

### Disable or Uninstall

- Owner: PluginManager for state/files; PluginMarketController for renderer presentation.
- Lifetime: survives page navigation and ends only after state commit or failure.
- Start event: confirmed user command.
- Intermediate events: running-state query, service stopping, state commit, rename/delete.
- Terminal events: success, stop failure, state failure, or deferred deletion.
- Duplicate behavior: one mutation per plugin.
- Service interaction: every tracked instance is stopped before state or files change.
- Tests: service running/stopped, stop failure, Windows-style file lock, restart cleanup, retry, preserved runtime data.

## Test and Runtime Verification

Automated coverage will include:

- manifest/catalog validation fixtures;
- archive traversal, link, checksum, size, and missing-entry failures;
- installed-version selection and semantic version comparison;
- transaction rollback and pending deletion;
- source validation and third-party catalog visibility;
- renderer controller re-entry and cleanup;
- Fork cache refresh and actual import of the packaged Mailpit Fork entry;
- `plugin:debug` artifact survival after the dev clean step.

The final Loop uses a temporary FlyEnv data directory and local HTTP registry/artifact server:

1. Build and test Mailpit.
2. Start FlyEnv normally and confirm the empty/official market state.
3. Install the packaged plugin through the market IPC flow.
4. Relaunch FlyEnv and confirm sidebar, route, config/log screens, and installed versions.
5. Start and stop Mailpit through the plugin module and verify PID/process state.
6. Publish a higher local test version, update, relaunch, and verify the active version and rollback copy.
7. Disable and relaunch; confirm renderer and Fork registration are absent.
8. Re-enable, start the service, then uninstall; confirm the service stops before code removal.
9. Relaunch and confirm pending deletions are cleared and Mailpit runtime/config data remains.
10. Run the focused plugin suite, renderer operation-boundary suite, formatting check, and production macOS build.

Any failed step starts another fix-and-repeat Loop from the narrowest failing layer, followed by the complete final Loop.

## Constraints and Exceptions

- No exception is authorized for shared configuration: plugin-owned state stays in the main-process plugin state file.
- No new Pinia store is introduced.
- Service plugins reuse `ModuleInstalledItem.start()`, `stop()`, and `restart()`.
- Plugin-only marketplace policies remain under plugin-specific main/renderer directories.
- Renderer installation state is never treated as process liveness.

