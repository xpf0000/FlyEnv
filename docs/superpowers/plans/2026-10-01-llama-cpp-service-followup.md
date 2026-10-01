# llama.cpp service follow-up

## Findings and scope

- `llama-server` receives the model as a launch argument; changing the persisted selection cannot affect an already running process. The shared `ModuleInstalledItem` exposes `stop()` and `start()` for the necessary restart.
- The module's `startExtParam` currently returns Vue-reactive `profile` and `selectedModel` objects. The shared service start passes those directly through Electron IPC, where structured cloning rejects proxies.
- Hugging Face requests already pass FlyEnv's `getAxiosProxy()` into Axios. It reads the enabled proxy in `global.Server.Proxy`; each Fork request receives the latest `Server` snapshot. The reported TLS disconnect does not alone establish whether the user's proxy was enabled or reachable. Preserve this network path and make its connection error identify the configured proxy state without revealing credentials.
- The Service header and Logs view can reuse existing card, radio-group, and log toolbar patterns.

## Ownership and operation contract

| Operation | Owner/lifetime | Start, intermediate, terminal | Duplicate behavior | Service interaction/tests |
|---|---|---|---|---|
| Switch current model | Module-local renderer controller; survives view unmount | Confirm in mounted view, controller snapshots target and current service, stops active service, persists selection, starts service; success or failure with rollback | Reject while switch is running | Reuse `ModuleInstalledItem.stop()`/`start()`; test stopped switch, running switch, stop failure, start failure and retry |
| Start service arguments | Module controller prepares module-owned values; shared `ModuleInstalledItem.start()` owns service operation | Validate model, persist profile, return plain cloneable arguments | Shared lifecycle guard | Test `structuredClone()` succeeds with reactive source objects |
| Model library fetch | Existing module controller/Fork | Existing request and terminal error | Existing cache and in-flight dedupe | Test proxy-state error context; no new download lifecycle |

UI-only popover, confirmation and log selection remain mounted component state. No new Pinia store, `config.setup` module data, public service fields, or new-module exception.

## Validation

1. Add failing focused tests for launch argument cloning, model switch lifecycle, and proxy error context.
2. Fix controller/aside, then Service and Logs views using existing components and translations.
3. Run llama.cpp contract tests, plugin build, focused lint and UI checks; review, merge to local `master`, and rerun tests there.
