# Startup Group Async Storage Design

## Goal

Persist startup-group configuration independently from `AppStore` and Electron preferences. Startup-group data must be read with `StorageGetAsync` and written with `StorageSetAsync`.

No legacy migration is required because the feature has not been released.

## Storage Ownership

`src/render/components/StartupGroup/store.ts` will own the startup-group configuration as a module-level reactive singleton. The initial in-memory value is the normalized empty configuration:

```ts
{ groups: [] }
```

The store will use a dedicated, stable localForage key. It will expose the current configuration and groups, an idempotent asynchronous initializer, and the existing add, update, remove, default-selection, and lookup operations.

The initializer will:

1. Read the configuration with `StorageGetAsync`.
2. Normalize the returned value before exposing it.
3. Fall back to the normalized empty configuration when the key is missing, expired, or unreadable.
4. Reuse an in-flight initialization promise so concurrent callers do not perform duplicate reads.

Mutations will normalize their next value, persist a plain JSON-compatible copy through `StorageSetAsync`, and update the shared reactive state. Storage errors will remain visible to callers rather than being reported as successful saves.

## Application Initialization

The renderer bootstrap will initialize startup-group storage after the application preferences are loaded and before Vue mounts. This ensures that the sidebar, default-group execution route, automatic service startup, and startup-group page all observe the loaded data on their first render.

Consumers will continue to share one reactive configuration, but they will obtain it from the startup-group store instead of `AppStore.config.setup.startupGroups`.

## AppStore and Electron Preferences

The `startupGroups` field will be removed from the `AppStore` setup-state type and from `INIT_CONFIG`. Startup-group mutations will no longer call `appStore.saveConfig()`.

All direct startup-group reads and writes in these areas will be redirected to the dedicated store:

- Startup-group page and editor operations.
- Startup-group sidebar running indicator.
- Main sidebar default-group one-click control and automatic-start behavior.
- Startup-group module visibility guard.

Because startup-group data is absent from the AppStore setup object, `saveConfig()` will not send it to `application:save-preference`, and Electron's preference store will not persist it.

## Error Handling

A missing or invalid stored value produces an empty startup-group configuration. A write failure rejects the mutation promise so existing UI error handling can surface the failure or avoid claiming success.

No data will be read from or migrated out of Electron preferences.

## Testing

The existing `test:startup-groups` script will gain regression checks that verify:

- The startup-group store imports and uses `StorageGetAsync` and `StorageSetAsync`.
- Startup-group mutations no longer call `AppStore.saveConfig()`.
- `src/render/store/app.ts` no longer declares, initializes, reads, or writes `startupGroups`.
- Sidebar and module consumers read startup-group configuration from the dedicated store.
- Renderer bootstrap waits for startup-group initialization before mounting.

After the focused test passes, TypeScript/lint or the closest available project-level static verification will be run for the changed files.
