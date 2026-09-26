# FlyEnv Plugins

Plugins live in `plugins/<plugin-name>` while developing in the FlyEnv repository.

A plugin contains a `plugin.json` manifest and may provide both Renderer and Fork entries.

## Localized manifest text

`plugin.json` fields shown in the Plugin Market — currently `description` — accept either a
plain string (shown for every language) or a locale-to-text map:

```json
{
  "description": {
    "en": "Apache Kafka service module. Runs a single-node KRaft Kafka broker.",
    "zh": "Apache Kafka 服务模块。以单节点 KRaft 模式运行 Kafka 服务。"
  }
}
```

Locale codes match the app's language directories (`en`, `zh`, `zh-hant`, `pt-br`, ...).
Resolution order at display time: exact locale → base language (`pt-br` → `pt`) → `en` →
first entry. The map is copied verbatim into the registry entry by `plugin:build`, so
third-party registries can localize descriptions the same way.

## Plugin-local translations

Plugin UI text and fork-side error messages should live in a side-agnostic language pack at
`plugins/<plugin-name>/lang/` (see `plugins/kafka/lang/`): one dictionary per locale
(`en.ts`, `zh.ts`, ...) plus an `index.ts` exporting a `createT(getLocale)` factory. The
factory takes a locale getter and returns a `t(key, args?)` lookup with resolution order
exact locale → base language → `en` → key, so the pack itself imports nothing from `@lang`
and works in both processes.

Each side binds the factory to its host i18n instance:

- `plugins/<plugin-name>/render/lang.ts` — `createT(() => AppI18n().global.locale)` with
  `AppI18n` from `@lang/index` (host-bridged on the Renderer side; do not import
  `@lang/runtime` in render code, that would bundle a second i18n instance).
- `plugins/<plugin-name>/fork/lang.ts` — same factory with `AppI18n` from `@lang/runtime`.
  On the Fork side `@lang/runtime` is also host-bridged: the fork process exposes its live
  i18n instance on `globalThis.__FLYENV_PLUGIN_HOST__.lang` (`src/fork/index.ts`) and the
  builder rewrites `@lang/runtime` imports to that bridge, so fork bundles share the host
  instance instead of bundling a stale copy that never receives language updates. Guard the
  call (`AppI18n?.()?.global?.locale ?? 'en'`) so the plugin still loads on hosts that
  predate the fork-side bridge.

For messages that already exist in the app's own language files, fork code can keep using
`I18nT` from `@lang/runtime` directly (e.g. `I18nT('fork.binNotFound')`) — it resolves
through the same bridge.

## Fork-side version discovery

`versionLocalFetch` (`@fork/Fn`) caches directory listings in the module-level
`versionDirCache` so repeated scans of large trees stay cheap. Any plugin `allInstalledVersions`
implementation must clear that cache before scanning, exactly like the built-in Version
module does:

```ts
for (const k in versionDirCache) {
  delete versionDirCache[k]
}
```

Without this, versions installed after an earlier scan stay invisible to the service page
until the fork process restarts (the Version Manager's static tab still shows them because
its `installed` flags come from a separate `existsSync` check, which makes the stale service
list look especially confusing).

## Real example: Mailpit

`plugins/mailpit` is intentionally a real service plugin rather than a Hello World example.

The plugin owns a complete copy of FlyEnv's Mailpit module: the Fork module lives in
`plugins/mailpit/fork/MailPit/index.ts` and the Renderer pages (`Index.vue`, `aside.vue`,
`Config.vue`, `Logs.vue`) live in `plugins/mailpit/render/`. The built-in `mailpit` module in
`src/` is untouched; the plugin copy uses the module id `mailpit-plugin` so both can coexist.

Reference rules for plugin module code:

- **Module-specific code** belongs in the plugin directory (the fork module class, the module's
  own Vue pages).
- **FlyEnv framework code** is referenced via build aliases and bundled into the plugin
  artifact during `plugin:build`: `@fork/*`, `@shared/*` on the Fork side;
  `@/util/*` and `@/svg/*.svg?raw` on the Renderer side. A plugin bundle should only contain
  the plugin's own files plus small utility libraries (for example `lodash-es`, `dompurify`);
  anything heavy or stateful must be bridged instead.
- **Shared UI components are host-bridged, never bundled**: `@/components/ServiceManager`,
  `@/components/VersionManager`, `@/components/Conf` (`index.vue` + `common.vue`), and
  `@/components/Log` (`index.vue` + `tool.vue`) resolve to the host's lazily-loaded component
  objects at runtime. This keeps heavy transitive dependencies (monaco, xterm) out of the
  plugin artifact — the mailpit example's render bundle is ~96 KB minified, not megabytes.
- **Fork-side runtime `require()` of native-binary packages must not be bundled**: packages
  like `7zip-min-electron` (used by `src/fork/util/Zip.ts`) or `node-rsa`/`node-forge`/
  `tangerine` ship platform binaries that must resolve from the app's own `node_modules` at
  runtime — the plugin install directory has none. The builder keeps these as runtime
  requires anchored at `global.Server.Static` (the same resolution base as the built-in fork
  bundle), via a banner shim plus a build-time rewrite of `createRequire(import.meta.url)` in
  fork sources. Plugin authors should leave such runtime requires as-is and never try to
  bundle native-binary packages.
- **Host singleton state must not be bundled** — it is bridged to the running host at runtime:
  `@/core/ASide` (service registry), `@/core/Module` (tab persistence), `@/store/app`,
  `@/store/brew`, `@lang/index` (Renderer i18n runtime) and `@lang/runtime` (Fork i18n
  runtime), plus `@/util/IPC` and `@/router`.
- **Application skeleton modules are always host-bridged, never bundled**: `@/core/VueExtend`
  (app factory), `@/core/App` and `@/core/AppModules` (built-in module registry), `@/router`,
  `@/core/Plugin`. Bundling any of these would drag the entire built-in renderer (via
  `import.meta.glob`) and a second plugin-host runtime into the artifact, and a bundled
  `core/Plugin` copy would overwrite the host's `globalThis.__FLYENV_PLUGIN_HOST__` at load
  time. The bridge list is verified against the built artifact (`render/index.mjs` must not
  contain `__FLYENV_PLUGIN_HOST__ = pluginHost`, `__vite_glob`, or `createWebHashHistory`).
- **Host runtime packages** `vue`, `pinia`, `vue-router`, `element-plus`, and
  `@element-plus/icons-vue` are also served from the host so the plugin does not ship a second,
  divergent copy.

The Renderer exercises real Mailpit operations through the plugin Fork module:

- scan installed Mailpit versions
- fetch online static versions
- install a version
- start / stop Mailpit
- initialize the Mailpit config
- resolve the Mailpit log path
- open the Mailpit web UI

The example intentionally shares the built-in module's binary dirs config (`setup.mailpit.dirs`). Both manage the same Mailpit binaries/default ports, so they should not be started at the same time.

## Commands

```bash
yarn plugin:dev mailpit
yarn plugin:build mailpit
yarn plugin:build:all
yarn plugin:release kafka
yarn plugin:release --all
yarn plugin:debug mailpit
yarn plugin:test
yarn plugin:runtime-smoke
```

- `plugin:dev` builds an unminified plugin into `tmp/plugins/<id>` and launches FlyEnv with only that development plugin registered. The dev directory is outside `dist`, so a normal development clean does not remove it.
- `plugin:build` creates the minified distributable plugin under the per-plugin-folder output directory `dist/plugins/<plugin-folder>/`: the plugin payload in `dist/plugins/<plugin-folder>/<id>`, a `.flyenv-plugin` archive beside it, an upserted entry in the official `plugins/registry.json`, and a copy of that registry at `dist/plugins/<plugin-folder>/registry.json` next to the archive. Default-path builds wipe the plugin's own `dist/plugins/<plugin-folder>/` first, so stale versioned archives never accumulate; other plugins' folders are untouched.
- `plugin:build:all` (or `yarn plugin:build --all`) builds every folder under `plugins/` that contains a `plugin.json`, serially, printing a success/failure summary; any failure exits non-zero.
- `plugin:release <name> [...more]` (or `--all`) builds the plugin(s) and assembles an upload-ready directory at `dist/plugins-release/` containing only the `.flyenv-plugin` archives and a `registry.json` — upload its contents to the hosting bucket as-is. Artifact URLs in that registry are derived as `--base-url` + `<id>-<version>.flyenv-plugin` (default base `https://oss.macphpstudy.com/plugins/`); entries whose archives were published earlier keep their existing URL, and entries never published and not built now are dropped with a warning. `--all` wipes the release directory first; a partial release updates it in place, replacing stale archives of the same plugin id. Note archives are byte-different on every build (embedded timestamps change the sha256), so always upload the archive together with the `registry.json` produced in the same run.
- `plugin:debug` launches FlyEnv against the already-built artifact in `dist/plugins/<plugin-folder>/<id>` (run `plugin:build` first).
- `plugin:test` builds the Mailpit example, inspects the archive, and checks the runtime wiring.
- `plugin:runtime-smoke` starts a real Electron process twice against an isolated data directory. It verifies install, relaunch, renderer route registration, Fork version discovery, start/stop, update, disable/re-enable, uninstall, deferred cleanup, and runtime data preservation.

Installed plugins are discovered from `<FlyEnv Data Directory>/plugins/<plugin-id>/<version>`. FlyEnv keeps active versions and enabled state in `<FlyEnv Data Directory>/plugins.json`.

Discovery is gated: a plugin directory only loads when it was installed through the Plugin
Manager. The scan requires a `plugins.json` state record with a matching `installToken`
(SHA-256 over a per-installation random secret, plugin id, version, and manifest contents,
written at install time), so copying plugin files into the directory directly does not
activate the plugin. The secret is generated once and stored in `.plugin-install-secret`
outside both the plugins directory and `plugins.json`, so copying the plugin files together
with the state file into another FlyEnv installation fails the token check as well. In the
app the secret is additionally encrypted with the OS account keychain (Electron
`safeStorage`: Keychain / DPAPI / system keyring), so even copying the secret file yields
ciphertext that cannot be decrypted on another machine and the copied plugins are rejected;
where no system encryption is available the secret falls back to plain storage. The
secret is deliberately not derived from the machine id, which can change. State files
written before install tokens existed (version 1) are migrated only while an active license
is available; a missing or unreadable install secret never skips verification. Once all legacy
records have tokens, the state file is rewritten at the current version. Development mode
(`FLYENV_PLUGIN_PATH`) bypasses this guard.

Plugin changes take effect **without restarting FlyEnv**. Install, update, disable, re-enable,
and uninstall all broadcast the refreshed plugin snapshot to the fork process (whose loader
cache is invalidated via a version+mtime import-URL cache buster) and hot-sync the renderer:
new modules appear in the menu and get their routes registered; disabled/uninstalled modules
lose their routes (navigating away first if you are on the plugin page); updated modules are
removed and re-added. Only if the renderer hot-sync itself fails does the Plugin Market fall
back to the restart prompt. One caveat: an already-imported plugin JS bundle cannot be unloaded
from the JS realm, so removed plugins leave their code resident in memory until the next
restart — behavior is fully reset, only the memory lingers.

The Settings → Plugin Market page reads the official registry and lets users add third-party registry JSON URLs. A registry can contain either `{ "plugins": [...] }` or one plugin object; each item needs an `artifact.url` (or `url`/`downloadUrl`) and an exact SHA-256 checksum. Catalog installs without a checksum are rejected. Third-party registries are explicitly acknowledged before their plugins can be installed because a plugin can execute native Renderer and Fork code.

Installing and updating plugins requires an active FlyEnv license. Without one, the
install/update buttons render in warning color with a lock icon and route to the license
page, and the main process independently verifies the license (RSA-signed machine id,
`@shared/license`) before any download starts. Plugins with a current install token keep
working without a license; version-1 records need an active license for their one-time
token migration.

## Publishing a catalog plugin

`yarn plugin:build <name>` automatically upserts the plugin's entry in the checked-in official
registry `plugins/registry.json` (the file the Plugin Market fetches from
`https://raw.githubusercontent.com/xpf0000/FlyEnv/master/plugins/registry.json`) and copies the
updated registry next to the archive (`dist/plugins/<plugin-folder>/registry.json`) for release
upload. Everything is
generated from `plugin.json` and the freshly built archive: id/name/version/description/author/
homepage/icon, `module`, `platforms`, `official: true`, and the archive's SHA-256 digest
(recomputed on every build, so a rebuilt archive never leaves a stale checksum behind).

The only manual field is `artifact.url` — the HTTPS URL of the uploaded release asset. The build
leaves it as an empty string (and preserves an already-filled URL on rebuilds). The market
client silently ignores entries with an empty `artifact.url`, so a draft entry in the registry
does not break the official market or advertise an unavailable download.

The release checklist is:

```bash
yarn plugin:build mailpit        # builds archive + upserts registry.json (sha256 included)
yarn plugin:runtime-smoke
# upload dist/plugins/mailpit/mailpit-example-<version>.flyenv-plugin as a release asset
# fill the asset URL into the entry's artifact.url in plugins/registry.json
# verify the URL is reachable over HTTPS, then commit
```

The registry must only be published after the artifact is reachable over HTTPS and serves bytes
whose SHA-256 matches the entry byte-for-byte. Rebuilding the archive with different bytes
requires re-uploading the asset; the next `plugin:build` updates the checksum automatically.

Renderer plugin bundles share FlyEnv's Vue, Pinia, and Vue Router runtime instances instead of bundling isolated copies. This is required for real FlyEnv components/stores to behave correctly.

The current MVP intentionally keeps built-in modules unchanged. Fork dispatch falls back to a plugin only when no built-in module matches the requested module id.
