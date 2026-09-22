# Plugin Market Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the FlyEnv plugin market's development, packaging, installation, runtime, upgrade, disable, uninstall, and real Electron smoke paths release-ready.

**Architecture:** Keep built-in modules unchanged. Keep `PluginManager` as the main-process source of truth, add serialized plugin mutations and validation before activation, move renderer marketplace operation state into a module-local controller, and keep service process/PID ownership in the existing Fork and `ServiceProcessManager` layers.

**Tech Stack:** Electron 39, Vue 3, TypeScript, Vite, esbuild, `7zip-min-electron`, Vue Router, existing `IPC`, `ForkManager`, `ServiceProcessManager`, and shell-based test scripts under `scripts/`.

**Spec:** `docs/superpowers/specs/2026-09-21-plugin-market-production-hardening-design.md`

## Global Constraints

- The existing built-in module path remains unchanged.
- No new Pinia store is introduced for plugin-owned state.
- Plugin-owned state stays in the main-process plugin state file, not `config.setup`.
- Service plugins reuse `ModuleInstalledItem.start()`, `stop()`, and `restart()`.
- Renderer installation state is never used as proof of process liveness.
- Renderer plugin changes require an application restart; no hot unload is added.
- Native third-party plugin code is not sandboxed; the UI must state that it can access files, processes, and the network.

## Review Focus

- Built artifact deletion during `plugin:debug`: the debug path must survive `yarn dev` cleanup; test in Task 1.
- Running service during update/disable/uninstall: operation must stop or refuse before files/state change; test in Task 3.
- Invalid archive entry or missing entry file: activation must fail without changing the active version; test in Task 2.
- Third-party catalog availability: adding a source must expose installable entries and preserve source warnings; test in Task 4.
- Data-directory permission failure and duplicate module IDs: startup must continue with diagnostics; test in Task 2.

## File Map

- Modify `scripts/plugin-runner.ts`: use a non-cleaned debug artifact directory.
- Create `scripts/plugin-test.ts`: source/package contract checks and packaged Fork import.
- Modify `scripts/plugin-builder.ts`: deterministic package layout and test-friendly output.
- Modify `package.json`: add `plugin:test` and focused plugin verification commands.
- Modify `src/shared/plugin/PluginManifest.ts`: strict manifest/catalog/semver/platform/architecture validation.
- Modify `src/main/plugins/PluginManager.ts`: serialized transactions, validation, activation, rollback, pending cleanup, diagnostics, and catalog merging.
- Modify `src/main/core/IPCHandler.ts` and `src/main/Application.ts`: plugin mutation progress and service-stop integration.
- Create `src/render/components/Setup/Plugins/controller.ts`: renderer operation owner and IPC listener cleanup.
- Modify `src/render/components/Setup/Plugins/index.vue`: bind the controller and render official, installed, and third-party catalog entries.
- Modify `src/lang/en/setup.json` and `src/lang/zh/setup.json`: warnings, operation status, invalid/update labels.
- Modify `scripts/plugin-manager-test.ts`: transaction, validation, conflict, update, rollback, and pending-delete fixtures.
- Create `scripts/plugin-runtime-smoke.ts`: local registry/artifact server and app-level smoke helpers.
- Modify `scripts/plugin-system-test.ts` and `scripts/plugin-market-ui-test.ts`: cover the corrected interfaces.
- Modify `plugins/registry.json` and `plugins/README.md`: publish a verifiable official reference entry and document commands.

### Task 1: Fix CLI artifact lifecycle and add plugin contract testing

**Files:**
- Modify: `scripts/plugin-runner.ts:22-39`
- Create: `scripts/plugin-test.ts`
- Modify: `scripts/plugin-builder.ts:80-190`
- Modify: `package.json:13-120`
- Modify: `scripts/plugin-system-test.ts`

**Interfaces:**
- `buildPlugin(name, options)` continues to return the built package directory.
- `plugin-test <name>` exits nonzero on manifest, entry, import, or contract failure.
- `plugin-debug <name>` passes `FLYENV_PLUGIN_PATH` pointing to `tmp/plugins/debug/<id>` or an equivalent directory not removed by `clean:dev`.

- [x] **Step 1: Write the failing artifact-lifecycle assertions.**

  Add assertions that `plugin:debug` does not use `dist/plugins/<id>` and that the selected debug directory still contains `plugin.json` after the command's clean phase is simulated.

- [x] **Step 2: Run the focused test and confirm it fails.**

  Run `yarn test:plugin-system`.

  Expected: FAIL because the current runner points debug at `dist/plugins/<id>`.

- [x] **Step 3: Implement the debug path fix.**

  Build/debug into `tmp/plugins/debug/<id>` and leave `dist/plugins` exclusively for distributable output. Do not call `clean:dev` against the debug artifact directory.

- [x] **Step 4: Add `plugin:test <name>`.**

  The command must build into a unique temporary directory, validate the generated manifest, assert renderer/Fork entry files, dynamically import the generated Fork module with a minimal `global.Server`, and remove the temporary directory in `finally`.

- [x] **Step 5: Extend the reference plugin test.**

  Assert that the generated archive contains `plugin.json`, `render/index.mjs`, and `fork/index.mjs`, and that the generated Fork module exports an object with `exec` and the Mailpit lifecycle methods.

- [x] **Step 6: Run the passing loop.**

  Run:

  ```bash
  yarn test:plugin-system
  yarn plugin:test mailpit
  ```

  Expected: both exit 0 and no temporary package remains.

### Task 2: Harden manifest validation and transactional PluginManager state

**Files:**
- Modify: `src/shared/plugin/PluginManifest.ts:1-125`
- Modify: `src/main/plugins/PluginManager.ts:90-500`
- Modify: `scripts/plugin-manager-test.ts`

**Interfaces:**
- `validatePluginManifest(value, options?)` rejects malformed IDs, versions, entries, platforms, and architectures.
- `PluginManager.refresh()` returns valid records plus invalid diagnostics without throwing for one bad plugin.
- `PluginManager.install(input)` activates only after archive, checksum, entry, compatibility, and conflict validation.
- `PluginManager.update(id)` preserves the previous active version until the replacement is committed.
- `PluginManager.cleanupPendingDeletes()` remains safe to call at startup and after every mutation.

- [ ] **Step 1: Add failing validation fixtures.**

  Add manager tests for traversal entries, absolute entries, missing render/Fork files, invalid archive links, missing checksum, checksum mismatch, incompatible platform, duplicate module IDs, and invalid active versions.

- [ ] **Step 2: Run the manager test to confirm failures.**

  Run `yarn test:plugin-manager`.

  Expected: FAIL for the new fixtures against the permissive implementation.

- [ ] **Step 3: Implement strict package validation.**

  Validate entry existence after extraction, reject links whose real paths leave staging, enforce required SHA-256 for catalog installs, and validate semantic version/platform/architecture fields before activation.

- [ ] **Step 4: Add mutation serialization.**

  Add a per-plugin operation map returning the same promise for concurrent install/update/enable/disable/uninstall requests. Ensure the map is cleared only after terminal success or failure.

- [ ] **Step 5: Make activation recoverable.**

  Stage a new version, write the previous state snapshot, rename the staged directory into the version directory, then atomically write state. If state write or refresh fails, restore the previous state and leave the previous active directory intact.

- [ ] **Step 6: Add diagnostics instead of startup failure.**

  Store invalid plugin records with an error message, skip duplicate/conflicting records, and skip scanning when `global.Server.DataDirectoryReady === false` so the existing recovery UI can run.

- [ ] **Step 7: Implement version retention and cleanup.**

  Keep the immediate previous version as rollback, mark older versions for deferred deletion, and remove them only after the new version has loaded successfully on the next application start.

- [ ] **Step 8: Run the complete manager loop.**

  Run `yarn test:plugin-manager` and assert zero failures for install, update, rollback, invalid package, duplicate invocation, pending deletion, and startup permission fixtures.

### Task 3: Integrate service lifecycle protection for mutation operations

**Files:**
- Modify: `src/main/plugins/PluginManager.ts`
- Modify: `src/main/Application.ts`
- Modify: `src/main/core/IPCHandler.ts`
- Modify: `src/main/core/ServiceProcess.ts` only if a read-only status helper is required
- Modify: `scripts/plugin-manager-test.ts`

**Interfaces:**
- `PluginManager` receives a `stopPluginServices(moduleId)` dependency from Application.
- The dependency returns `{ stopped: true }` only after all tracked instances have stopped.
- A failed stop rejects the mutation without changing `enabled`, `activeVersion`, or plugin files.

- [x] **Step 1: Add failing running-service fixtures.**

  Mock one tracked process for a plugin module and assert update, disable, and uninstall call the stop dependency before any filesystem mutation. Add a stop-failure fixture that asserts the plugin remains installed and enabled.

- [x] **Step 2: Run the manager test and confirm failure.**

  Run `yarn test:plugin-manager`.

  Expected: FAIL because current mutations do not query or stop services.

- [x] **Step 3: Wire the stop dependency.**

  Application resolves the plugin module ID, uses `ServiceProcessManager.statusOf(moduleId)`, invokes the existing Fork `stopService` path for each running instance, waits for terminal responses, and removes only successfully stopped PID records.

- [x] **Step 4: Guard update/disable/uninstall.**

  Call the stop dependency before state or directory changes. Preserve state on failure. For uninstall, rename the code root to pending-delete only after successful stop.

- [x] **Step 5: Verify lifecycle behavior.**

  Run `yarn test:plugin-manager` and the existing service lifecycle tests relevant to PID ownership. Confirm no plugin process remains after application relaunch in the smoke fixture.

### Task 4: Move marketplace operations into a renderer controller and expose third-party catalogs

**Files:**
- Create: `src/render/components/Setup/Plugins/controller.ts`
- Modify: `src/render/components/Setup/Plugins/index.vue:1-264`
- Modify: `src/lang/en/setup.json`
- Modify: `src/lang/zh/setup.json`
- Modify: `scripts/plugin-market-ui-test.ts`

**Interfaces:**
- `PluginMarketController` exposes reactive state for `loading`, `busyById`, `catalog`, `installed`, `sources`, `error`, and `restartRequired`.
- `refresh()`, `install(item)`, `update(item)`, `toggle(item, enabled)`, `uninstall(item)`, `addSource(url)`, and `removeSource(url)` return promises and share in-flight work.
- The page does not own raw IPC listeners or long-running operation cleanup.

- [x] **Step 1: Add failing UI source/catalog assertions.**

  Assert that a third-party catalog item is rendered with a warning marker and install action, that equal versions do not show Update, and that the page delegates commands to the controller.

- [x] **Step 2: Run the market UI test and confirm failure.**

  Run `yarn test:plugin-market-ui`.

  Expected: FAIL because the current third-party tab only renders source URLs and the page owns IPC requests.

- [x] **Step 3: Implement the controller.**

  Use a module-local singleton with per-operation promises, immutable request snapshots, one listener cleanup path, terminal result handling, and restart prompt state. Do not add Pinia state.

- [x] **Step 4: Render merged catalogs.**

  Add official and third-party catalog groups, compare versions with the shared semver helper, show Install/Update/Reinstall status accurately, and require explicit third-party acknowledgement before the first install from a source.

- [x] **Step 5: Run the UI regression loop.**

  Run `yarn test:plugin-market-ui`, then exercise controller re-entry by mounting/unmounting the page while a request is pending and assert no listener remains.

### Task 5: Add a real local registry/artifact smoke harness

**Files:**
- Create: `scripts/plugin-runtime-smoke.ts`
- Modify: `scripts/plugin-system-test.ts`
- Modify: `package.json`
- Modify: `plugins/registry.json`
- Modify: `plugins/README.md`

**Interfaces:**
- `plugin-runtime-smoke` starts a local HTTP registry and artifact server, creates an isolated FlyEnv data root, and exits nonzero on any failed lifecycle assertion.
- The reference catalog item includes a real archive URL and required SHA-256 in the local test fixture; the committed official registry contains the release URL/checksum format used by production.

- [x] **Step 1: Add failing smoke checkpoints.**

  Define checkpoints for install, relaunch, renderer route, Fork version scan, start/stop, update, disable, re-enable, uninstall, pending cleanup, and preserved runtime data. Run the harness against the current implementation.

  Expected: FAIL at the known `plugin:debug`, third-party, or lifecycle gaps.

- [x] **Step 2: Implement the isolated local server.**

  Serve `registry.json` and versioned `.flyenv-plugin` archives over HTTP, calculate checksums from the actual archive bytes, and clean the temporary root in `finally`.

- [x] **Step 3: Implement the Electron launch checkpoints.**

  Launch the dev runner with `FLYENV_PLUGIN_REGISTRY_URL`, `FLYENV_PLUGIN_PATH`, and isolated data-root variables. Use the existing Electron launch mechanism and a deterministic test plugin service/port so the harness can observe renderer readiness and Fork IPC terminal results.

- [x] **Step 4: Run the first green smoke loop.**

  Run `yarn plugin:runtime-smoke` and inspect its process, route, state-file, and pending-delete assertions. Repeat after fixing each failure rather than weakening assertions.

### Task 6: Full verification, documentation, and handoff

**Files:**
- Modify: `docs/task/plugin.md` only for final behavior corrections.
- Modify: `plugins/README.md` with release and testing instructions.
- Modify: `docs/superpowers/plans/2026-09-21-plugin-market-production-hardening.md` to check completed steps.

- [x] **Step 1: Run focused plugin verification.**

  Run:

  ```bash
  yarn test:plugin-system
  yarn test:plugin-manager
  yarn test:plugin-market-ui
  yarn plugin:test mailpit
  yarn plugin:runtime-smoke
  ```

- [x] **Step 2: Run affected architecture checks.**

  Run the renderer operation-boundary test and the existing service lifecycle tests affected by plugin stop integration.

- [x] **Step 3: Run formatting and production build checks.**

  Run `git diff --check` and the project production build command appropriate for the current macOS architecture. Record any pre-existing unrelated failures separately.

- [x] **Step 4: Perform the final manual Loop.**

  Start FlyEnv, open Settings → Plugin Market, install the official reference plugin, relaunch, open its route, scan versions, start/stop the service, update to the next local version, disable, re-enable, start, uninstall, relaunch, and confirm runtime/config preservation.

- [x] **Step 5: Review the final diff and status.**

  Confirm no generated package, temporary data directory, or unrelated file is included; confirm each success claim has a fresh command or runtime observation behind it.
