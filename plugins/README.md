# FlyEnv Plugins

Plugins live in `plugins/<plugin-name>` while developing in the FlyEnv repository.

A plugin contains a `plugin.json` manifest and may provide both Renderer and Fork entries.

## Commands

```bash
yarn plugin:dev example
yarn plugin:build example
yarn plugin:debug example
```

- `plugin:dev` builds an unminified plugin into `tmp/plugins/<name>` and launches FlyEnv with only that plugin registered.
- `plugin:build` creates the distributable plugin in `dist/plugins/<id>`.
- `plugin:debug` launches FlyEnv against the already-built plugin artifact.

Installed plugins are discovered from `<FlyEnv Data Directory>/plugins/<plugin-id>`.

The current MVP intentionally keeps built-in modules unchanged. Fork dispatch falls back to a plugin only when no built-in module matches the requested module id.
