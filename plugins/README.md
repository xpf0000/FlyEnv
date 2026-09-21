# FlyEnv Plugins

Plugins live in `plugins/<plugin-name>` while developing in the FlyEnv repository.

A plugin contains a `plugin.json` manifest and may provide both Renderer and Fork entries.

## Real example: Mailpit

`plugins/mailpit` is intentionally a real service plugin rather than a Hello World example.

Its Fork entry reuses FlyEnv's existing production Mailpit backend:

```ts
import MailPit from '@fork/module/MailPit'

export default MailPit
```

During `plugin:build`, the referenced FlyEnv backend sources are bundled into the standalone plugin artifact.

The Renderer is plugin-owned and exercises real Mailpit operations through the plugin Fork module:

- scan installed Mailpit versions
- fetch online static versions
- install a version
- start / stop Mailpit
- initialize the Mailpit config
- resolve the Mailpit log path
- open the Mailpit web UI

The example uses the module id `mailpit-plugin` so it can coexist with the current built-in `mailpit` module while the plugin system is being developed. Both manage the same Mailpit binaries/default ports, so they should not be started at the same time.

## Commands

```bash
yarn plugin:dev mailpit
yarn plugin:build mailpit
yarn plugin:debug mailpit
yarn plugin:test
yarn plugin:runtime-smoke
```

- `plugin:dev` builds an unminified plugin into `tmp/plugins/debug/<id>` and launches FlyEnv with only that development plugin registered. The debug directory is outside `dist`, so a normal development clean does not remove it.
- `plugin:build` creates the distributable plugin in `dist/plugins/<id>` and a `.flyenv-plugin` archive beside it.
- `plugin:debug` launches FlyEnv against the already-built plugin artifact.
- `plugin:test` builds the Mailpit example, inspects the archive, and checks the runtime wiring.
- `plugin:runtime-smoke` starts a real Electron process twice against an isolated data directory. It verifies install, relaunch, renderer route registration, Fork version discovery, start/stop, update, disable/re-enable, uninstall, deferred cleanup, and runtime data preservation.

Installed plugins are discovered from `<FlyEnv Data Directory>/plugins/<plugin-id>/<version>`. FlyEnv keeps active versions and enabled state in `<FlyEnv Data Directory>/plugins.json`.

The Settings → Plugin Market page reads the official registry and lets users add third-party registry JSON URLs. A registry can contain either `{ "plugins": [...] }` or one plugin object; each item needs an `artifact.url` (or `url`/`downloadUrl`) and an exact SHA-256 checksum. Catalog installs without a checksum are rejected. Third-party registries are explicitly acknowledged before their plugins can be installed because a plugin can execute native Renderer and Fork code.

## Publishing a catalog plugin

The checked-in official registry contains the Mailpit example as `mailpit-example`: `plugins/registry.json`. Before publishing that registry entry, upload the exact archive produced by `yarn plugin:build mailpit` to the release URL in the entry and verify its SHA-256 digest. Rebuilding the archive with different bytes requires updating both the release asset and the registry checksum together.

The release checklist is:

```bash
yarn plugin:build mailpit
node -e "const fs=require('fs'), crypto=require('crypto'); const p='dist/plugins/mailpit-example-0.1.0.flyenv-plugin'; console.log(crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'))"
yarn plugin:runtime-smoke
```

The registry must only be published after the artifact is reachable over HTTPS and the printed digest matches `plugins/registry.json` byte-for-byte.

Renderer plugin bundles share FlyEnv's Vue, Pinia, and Vue Router runtime instances instead of bundling isolated copies. This is required for real FlyEnv components/stores to behave correctly.

The current MVP intentionally keeps built-in modules unchanged. Fork dispatch falls back to a plugin only when no built-in module matches the requested module id.
