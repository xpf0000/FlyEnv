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
```

- `plugin:dev` builds an unminified plugin into `tmp/plugins/<id>` and launches FlyEnv with only that development plugin registered.
- `plugin:build` creates the distributable plugin in `dist/plugins/<id>`.
- `plugin:debug` launches FlyEnv against the already-built plugin artifact.

Installed plugins are discovered from `<FlyEnv Data Directory>/plugins/<plugin-id>`.

Renderer plugin bundles share FlyEnv's Vue, Pinia, and Vue Router runtime instances instead of bundling isolated copies. This is required for real FlyEnv components/stores to behave correctly.

The current MVP intentionally keeps built-in modules unchanged. Fork dispatch falls back to a plugin only when no built-in module matches the requested module id.
