# Plugin Self-Contained Module Design

Date: 2026-09-22
Status: approved (user request), implemented same day

## Goal

The mailpit example plugin (`plugins/mailpit`) currently reuses the built-in Mailpit module
directly: its fork entry re-exports `@fork/module/MailPit`, and its renderer pages are 7-line
wrappers around the host components via the `flyenv:mailpit` / `flyenv:mailpit-aside` virtual
bridge modules. This proves the plugin loader works, but it does not prove that a plugin can
**own** its module code — which is the only workflow that matters for future plugin development.

Change: copy the existing Mailpit module (fork + renderer) into `plugins/mailpit`, fix all file
references, and keep the plugin fully functional. Remove the Mailpit-specific host bridges.

## Non-goals

- No changes to the built-in `mailpit` module itself (it stays as-is in `src/`).
- No new plugin APIs beyond the host bridges listed below.
- No optimization of plugin bundle size (monaco is bundled; acceptable for the example).

## Current state (facts from exploration)

- Fork plugin build: esbuild bundle with aliases `@fork`/`@shared`/`@lang` → `src/`
  (`scripts/plugin-builder.ts:147-173`). Referenced fork sources are bundled into the artifact.
- Renderer plugin build: vite lib build, aliases `@`/`@shared`/`@lang` → `src/`
  (`scripts/plugin-builder.ts:112-145`). `vue`/`pinia`/`vue-router` are served from the host at
  runtime via `globalThis.__FLYENV_PLUGIN_HOST__` (`src/render/core/Plugin.ts`).
- Fork dispatch falls back to the plugin loader when no built-in module matches the typeFlag
  (`src/fork/BaseManager.ts:648-655`, `src/fork/PluginLoader.ts`).
- The plugin module id is `mailpit-plugin`; the built-in is `mailpit`. Both manage the same
  binaries/ports and must not run at the same time (documented in `plugins/README.md`).

## The file-reference problem

Copying the module into the plugin means its imports resolve in the plugin build context.
Three categories:

1. **Framework code that can be bundled** — fork `Base`, `Fn`, `TaskQueue`, `@shared/*`,
   `@lang/runtime`; renderer shared components (`ServiceManager`, `VersionManager`, `Conf`,
   `Log`), `@/util/*`, `@/svg/*.svg?raw`. Resolved via the existing build aliases and bundled.
   No shared mutable state, so copies are safe.
2. **Host singleton state that must NOT be duplicated** — bundling a copy would split state:
   - `@/core/ASide`: module-level `AppServiceModule` registry. Host reads it for the tray menu
     and group start/stop (`src/render/components/Aside/Index.vue`). A plugin copy would
     register invisibly.
   - `@/core/Module`: module-level `AppModuleTab` (tab persistence).
   - `@/store/brew`: imports `@/core/AppModules`, which `import.meta.glob`s every built-in
     module's `Module.ts` — bundling it would drag the entire renderer into the plugin.
   - `@lang/index`: a bundled copy's i18n runtime is never initialized; `I18nT` would break.
3. **Host runtime packages** — `element-plus` and `@element-plus/icons-vue` are used by the
   copied components; add them to the host-shared runtime (same mechanism as vue/pinia) so the
   plugin does not bundle a second, divergent copy.

## Design

### Fork (`plugins/mailpit/fork/`)

- Copy `src/fork/module/MailPit/index.ts` → `plugins/mailpit/fork/MailPit/index.ts`.
- Rewrite relative imports to aliases: `../Base` → `@fork/module/Base`, `../../Fn` → `@fork/Fn`,
  `../../util/ServiceStart` → `@fork/util/ServiceStart`, `../../TaskQueue` → `@fork/TaskQueue`.
- `this.type = 'mailpit'` → `'mailpit-plugin'`.
- `setup?.mailpit?.dirs` intentionally keeps the `mailpit` config key: the example shares the
  built-in module's binary dirs (documented behavior, not new module-owned persistence).
- `plugins/mailpit/fork/index.ts` becomes `import MailPit from './MailPit'; export default MailPit`.

### Renderer (`plugins/mailpit/render/`)

- Copy `src/render/components/MailPit/{Index,aside,Config,Logs}.vue` → `plugins/mailpit/render/`
  (replacing the 7-line bridge wrappers).
- Rewrite `../ServiceManager/index.vue` → `@/components/ServiceManager/index.vue`,
  `../VersionManager/index.vue` → `@/components/VersionManager/index.vue`; `./Config.vue` and
  `./Logs.vue` stay relative.
- Default props: `typeFlag: 'mailpit-plugin'`, `title: 'Mailpit Plugin'` (Index/aside; Config/Logs
  receive the prop from the parent but defaults are aligned).
- `render/Module.ts` unchanged (already imports `./Index.vue`, `./aside.vue`, plugin svg icon).

### Host bridges (`scripts/plugin-builder.ts` + `src/render/core/Plugin.ts`)

- Remove `flyenv:mailpit`, `flyenv:mailpit-aside` bridge modules and
  `pluginHost.components.Mailpit/MailpitAside` (Mailpit-specific coupling, no longer needed).
- Add host bridges (exact-id resolveId mappings):
  - `@/core/ASide` → host `AsideSetup`, `AppServiceModule`
  - `@/core/Module` → host `AppModuleSetup`, `AppModuleTab`, `AppCustomerModule`
  - `@/store/brew` → host `BrewStore`
  - `@lang/index` → host lang runtime (`I18nT` and other value exports used by the bundled tree)
  - `@/core/VueExtend` → host `VueExtend`; `@/core/App` / `@/core/AppModules` → host
    `AppModules` (application skeleton: never bundle the app factory, router, module
    registry, or `core/Plugin` itself)
- Add `element-plus`, `@element-plus/icons-vue` to `HOST_RUNTIME_PACKAGES`; expose both from
  `pluginHost` in `Plugin.ts`.

### Shared UI component bridges

Even with singleton state bridged, the renderer bundle stayed megabytes large because the
copied components import shared UI components (`ServiceManager`, `VersionManager`, `Conf`,
`Log`), whose transitive dependencies (monaco-editor, xterm) were bundled. These components
are now host bridges too: `pluginHost.components` in `Plugin.ts` exposes them as
`defineAsyncComponent` wrappers (the same pattern previously used for the Mailpit-specific
components), and the builder maps the six component ids (`ServiceManager/index.vue`,
`VersionManager/index.vue`, `Conf/index.vue`, `Conf/common.vue`, `Log/index.vue`,
`Log/tool.vue`) to `host.components.*` via the same `normalizeBridgeId` mechanism.

Rationale: component objects crossing the blob-import boundary are safe because the plugin
bundle runs in the same JS realm as the host — async components, props, and emit contracts
behave exactly as with a local import. The payoff is a render bundle of ~96 KB minified
instead of ~8 MB (or ~31 MB with the alias-matching bug). The cost is that plugins now depend
on the host components' prop/event API stability; that coupling is governed by the plugin
manifest's `apiVersion`, which the host can bump when these contracts change.

`plugin:build` (CLI) also minifies unconditionally now; `plugin:dev`/`plugin:debug`/tests keep
unminified output. Artifact assertions must accept both the raw optional-chaining bridge form
and esbuild's transpiled `== null ? void 0 :` form.

### Output directory layout

Build outputs are isolated per plugin **folder name**, preparing for multi-plugin builds:

```
dist/plugins/<plugin-folder>/
  <manifest.id>/                  # plugin payload (plugin.json, render/, fork/)
  <manifest.id>-<version>.flyenv-plugin
  registry.json                   # copy of the upserted official registry
```

A default-path build wipes only its own `dist/plugins/<plugin-folder>/` (stale versioned
archives cannot accumulate; other plugins' folders are untouched). Callers with explicit
`outputRoot`/`archivePath` (`plugin:dev`, tests) keep cleaning only their explicit output.
`yarn plugin:build --all` (`plugin:build:all`) builds every `plugins/*/plugin.json` serially
and exits non-zero if any plugin fails. `plugin:debug` reads the real artifact from
`dist/plugins/<plugin-folder>/<id>`; its previous `tmp/plugins/debug/<id>` path was drifted
dead code (nothing ever built there).

### Fork bundle runtime require anchoring

Fork sources declare their own `createRequire(import.meta.url)` bindings (e.g. `Zip.ts` for
`7zip-min-electron`, plus Host/Mariadb/CopilotCli/Antigravity/DNS), which esbuild inlines into
the plugin bundle — a banner-level `require` shim cannot intercept them. Packages reached this
way ship native binaries that must resolve from the app's own `node_modules` at runtime; the
plugin install directory has none, and bundling the JS wrapper still leaves the binary lookup
broken (`MODULE_NOT_FOUND`). The builder therefore (1) defines
`__flyenvPluginRequireAnchor(fallbackUrl)` in the banner, resolving against
`globalThis.Server.Static + '/index.js'` — the same base the built-in fork bundle uses — with
`import.meta.url` as pre-broadcast fallback, and (2) rewrites `createRequire(import.meta.url)`
to `createRequire(__flyenvPluginRequireAnchor(import.meta.url))` in repo sources via an
esbuild `onLoad` plugin. Regression coverage: `plugin-system-test` dynamic-imports the built
fork bundle from a temp dir **outside** the repository (inside the repo, Node would walk up to
the repo's `node_modules` and mask the bug) with only `globalThis.Server.Static` set. Rule for
plugin authors: keep runtime requires of native-binary packages as-is; never bundle them.

### Hot reload without restart

Plugin install/update/disable/re-enable/uninstall apply immediately; no app restart is
required. The pieces:

- **Main** (unchanged flow): `IPCHandler.finishPluginChange` covers install/toggle/update/
  uninstall → `Application.syncPlugins()` refreshes the manager, broadcasts the global server
  snapshot (including `Plugins`) to the fork process, and pushes `APP-Update-Global-Server`
  to the renderer. Service stop on disable/uninstall stays with main (`stopPluginServices`).
- **Fork**: `BaseManager.init()` already clears the `PluginLoader` cache on every server
  broadcast; the remaining gap was Node's `import()` URL cache returning stale code after an
  update/reinstall. `PluginLoader.load` now keys its cache by `entry@version:mtimeMs` and
  imports with a `?t=<stamp>` cache-buster query — stable while the code is unchanged, fresh
  after any update. Disabled plugins simply vanish from the snapshot, so dispatch falls back
  to "No Found Module".
- **Renderer**: `AppModules` is now a `reactive` array (items `markRaw` — they carry async
  component definitions), so the aside menu recomputes on change. `syncRendererPluginModules()`
  (in `core/AppModules.ts`, re-entrant via a shared in-flight promise) re-fetches the enabled
  plugin payloads over IPC and diffs by `typeFlag` + `plugin.version`: added → blob import,
  push, `registerPluginRoutes()`; removed/disabled → splice, `unregisterPluginRoute()`
  (plugin routes are now named after their typeFlag so `router.removeRoute` works), navigate
  to `/` if the current page is the removed plugin, drop the `BrewStore` module instance;
  updated → remove + re-add. Brew module state (`module.isPlugin` etc.) is created lazily by
  `BrewStore.module()`, so no eager re-initialization is needed.
- **Triggers**: `GlobalIPCOn` reacts to `Plugins` snapshot changes in
  `APP-Update-Global-Server` (covers every change path, including CLI-driven ones), and the
  Plugin Market controller additionally calls the same sync after install/toggle/uninstall —
  on success it clears `restartRequired`; on failure it logs and keeps the restart prompt as
  a fallback. A failed hot sync never rolls back the main/fork-side change.
- **Accepted leak**: an already-imported plugin JS bundle cannot be unloaded from the JS
  realm; removed plugins leave their code in memory until the next restart.

Verified end-to-end by `yarn plugin:runtime-smoke` checkpoints `hot-fork-update`,
`hot-disable`, `hot-reenable`, and `hot-uninstall` in a real Electron process.

### Postmortem: stale BrewStore module records survive disable → re-enable

`removePluginModule` deletes `brewStore.modules[typeFlag]` on disable, but any still-alive
caller (a not-yet-unmounted computed, a group card, a manual refresh) recreates the record
via `BrewStore.module()` while the plugin is absent from `AppModules` — so the record gets
`isPlugin=false`. After re-enable nothing invalidated that record, and `fetchInstalled`
silently used the non-plugin channel (`app-fork:version allInstalledVersions`), which returns
`{}` for plugin typeFlags: the installed version list stayed empty forever. Fixes:

- `BrewStore.module()` reconciles cached records against the current `AppModules` lookup:
  an `isPlugin` mismatch updates the flags in place (keeping live references valid) and
  resets `installed`/`installedFetched` so the next fetch uses the right channel.
- `syncRendererPluginModules()` drops a stale non-plugin record when re-adding a plugin
  module, so mounted pages refetch immediately instead of waiting for the next access.
- `Module.fetchInstalled()` captures `isPlugin` at request time and discards the response
  if the record was reconciled mid-flight.

Regression coverage: `yarn plugin:runtime-smoke` checkpoints `poison-brew-module` (creates
the stale record while disabled) and `hot-reenable-installed-list` (asserts the reconciled
record fetches installed versions through the plugin channel).

### Postmortem: bridge matching must survive alias resolution

The first implementation silently failed to apply any alias-keyed bridge (`@/...`,
`@lang/index`): Vite applies `resolve.alias` **before** user `pre` plugins, so `resolveId`
receives the alias-resolved absolute path (or a relative id from an already-bundled src file),
never the raw `@/store/brew` specifier. The exact-id bridge map never matched, the whole host
tree (`ServiceManager/setup` → `AsyncComponent` → `VueExtend` → `router` → `AppModules` →
`core/Plugin` + `import.meta.glob` of every built-in module) was bundled, and the bundled
`core/Plugin` copy re-assigned `globalThis.__FLYENV_PLUGIN_HOST__` at plugin load. It appeared
to work only because pinia stores are keyed by id in the shared host pinia.

Lessons, now enforced:

- The builder normalizes every `resolveId` candidate (raw specifier, alias-resolved absolute
  path, importer-relative id) back to the alias specifier before matching the bridge map
  (`normalizeBridgeId` in `scripts/plugin-builder.ts`).
- The bridge list must be validated by a **full dependency-tree traversal**, and the artifact
  is the source of truth: `render/index.mjs` must contain zero occurrences of
  `__FLYENV_PLUGIN_HOST__ = pluginHost`, `__vite_glob`, and `createWebHashHistory`. These are
  asserted in `scripts/plugin-system-test.ts` against the real build output.

### Operation contract (per flyenv-module-boundaries)

Service install/start/stop operations are unchanged in ownership:

- Owner: host `BrewStore` (domain state, shared pinia) + `ModuleInstalledItem` lifecycle;
  fork module `mailpit-plugin` owns child process/PID. Renderer loading state is never proof of
  process liveness.
- Start event: IPC `app-fork:mailpit-plugin` (`startServer` etc.) → fork `BaseManager` fallback →
  plugin fork module. Intermediate: `APP-On-Log` progress. Terminal: ForkPromise resolve/reject.
- Duplicate invocation: existing `ModuleInstalledItem` re-entry guards apply (unchanged).
- Lifecycle tests: `yarn plugin:runtime-smoke` (install → start/stop → disable → uninstall in a
  real Electron process) plus `yarn plugin:test` build/wiring checks.

No new Pinia store, no `config.setup` additions, no lifecycle duplication — the Default Module
Constraints are satisfied without exceptions.

### Tests and docs to update

- `scripts/plugin-system-test.ts:50-63,93-97` — assertions about the old re-export/bridge shape
  now assert the self-contained shape (fork entry imports `./MailPit`, copied module sets
  `this.type = 'mailpit-plugin'`, builder exposes the new bridges, `Plugin.ts` no longer carries
  Mailpit components).
- `scripts/plugin-market-ui-test.ts:6-17` — same.
- `plugins/README.md` — rewrite the example description: plugin owns a copy of the module;
  document the alias + bridge rules for future plugin authors.

## Verification

1. `yarn plugin:build mailpit` — build succeeds; artifact contains no `__FLYENV_PLUGIN_HOST__.components` references.
2. `yarn test:plugin-system`, `yarn test:plugin-manager`, `yarn test:plugin-market-ui`.
3. `yarn plugin:test` — build + archive + runtime wiring checks.
4. `yarn plugin:runtime-smoke` — real Electron end-to-end (exercises the changed host bridge
   code path with a runtime plugin).
