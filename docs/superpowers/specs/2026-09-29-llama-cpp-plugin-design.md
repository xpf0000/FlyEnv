# llama.cpp Service Plugin Design

**Date:** 2026-09-29
**Status:** Approved for implementation planning
**Decision:** Build llama.cpp as an installable FlyEnv service plugin, separate from Ollama.

## Goal

Provide an installable FlyEnv plugin that discovers and installs official llama.cpp release binaries, lets users select supported backend variants, finds and downloads GGUF models, and manages a local OpenAI-compatible llama-server lifecycle.

The plugin package contains only plugin code and UI. Runtime binaries, downloaded models, configuration, and logs live in FlyEnv-managed data directories and survive plugin disable, update, or uninstall.

## User outcome

After installing the plugin from Plugin Market, a user can select an official llama.cpp release and a build matching the current operating system, CPU architecture, and backend; install it; find public GGUF repositories on Hugging Face; download a selected model; start or stop a local server; view its health, endpoint, and logs; and adjust common inference/server options.

The first release targets ordinary local inference and text GGUF models. It does not aim to reproduce every llama.cpp CLI flag, every Hugging Face workflow, or all backend variants.

## Current project context

- The plugin system accepts a manifest with Renderer and Fork entries. `plugins/kafka` and `plugins/mailpit` demonstrate self-contained service plugins.
- Plugin module IDs are arbitrary strings and plugin routes are registered dynamically. The module uses `moduleType: 'ai'`, `isService: true`, and a distinct type flag; no new built-in enum entry is needed.
- Fork plugin code can bundle FlyEnv's `Base` service framework. `Base.startService()` dispatches `_startServer`/`_stopServer`, tracks the service process, and `Base.installSoft()` supports progress-aware runtime downloads and extraction.
- Existing `ModuleInstalledItem.start/stop/restart()` is the supported service lifecycle. Module-specific start inputs belong in `startExtParam`/`stopExtParam` registration in the plugin's aside component.
- Ollama has its own service, version, model and configuration pages, but its `OLLAMA_*` environment variables, model CLI, model catalog, and process behavior are not llama.cpp interfaces and will not be reused.
- llama.cpp's official Release assets are distinct by OS, architecture, backend, and sometimes CUDA runtime version. A CPU, CUDA, or Vulkan package for one release is a separate runtime variant, not an interchangeable archive.
- A single-model llama.cpp server is configured mainly with command-line arguments and `LLAMA_ARG_*` environment variables. Router model presets and Web UI JSON settings are specialized configuration files, not a universal service config format.

## Approaches considered

### A. Complete service plugin — selected

Ship a self-contained service plugin, fetch official runtime releases at install time, keep model and runtime data outside the plugin package, and use the existing service lifecycle. This serves users who want FlyEnv to install and operate llama.cpp while preserving the plugin system's separation from built-in modules.

### B. Connection-only plugin

Expose a form for an already-running llama-server URL and optional API key. This is small but does not provide the runtime, model, or lifecycle management requested by the research and duplicates the existing generic OpenAI-compatible connection workflow.

### C. Extend the built-in Ollama module

This would combine different binaries, model formats, API surfaces, and configuration contracts in one service module. It would make upgrades and failure handling harder and violates the requested plugin boundary.

## Scope

### Included in the first implementation

- An official installable plugin with a unique module ID and localized English/Chinese UI strings.
- Official GitHub Releases discovery and runtime variant filtering by OS, architecture, backend, and CUDA runtime where applicable.
- Runtime install, upgrade, local version discovery, selection, and removal of plugin-owned runtime versions. Removing a runtime version must never remove user models or config.
- Initial backend coverage, filtered against actual assets present for each release:
  - Windows x64: CPU, CUDA, Vulkan.
  - macOS Apple Silicon: official ARM64 build using the platform's Metal path.
  - Linux x64: CPU, Vulkan, CUDA when the official release provides the asset.
  - Linux ARM64: CPU and Vulkan when present in the selected release.
- Public Hugging Face GGUF repository search and metadata/file discovery via the public Hub API, without requiring the `hf` CLI.
- Download of a selected single-file text GGUF into the plugin's model directory through Hugging Face's public Hub/Resolver endpoints. This keeps download behavior available even for release assets that do not include the new unified `llama download` command. The downloaded file is loaded by local path; `LLAMA_CACHE` is reserved for any runtime-native cache use.
- Local model list, selection for launch, cache path, and deletion with an explicit confirmation. Initial model download support is for single-file text GGUFs; multi-shard and multimodal bundles requiring `mmproj` are deferred until their download/verification behavior is reliable for the chosen runtime versions.
- Server start/stop/restart, health status, endpoint display/copy, recent logs, and common settings: model, context size, CPU threads, GPU layers/device, host, port, and optional API key.
- OpenAI-compatible endpoint information so users can connect existing clients. The plugin displays/copies the Base URL and model ID; this work makes no changes to Hermes or a global Provider extension API.
- Plugin build/runtime-smoke coverage and focused contract checks for release asset selection, argument generation, persistence, and operation cleanup.

### Deferred

- ROCm, SYCL, OpenVINO, Adreno, Snapdragon, openEuler-specific builds, and other backend variants beyond the initial list.
- Automatic driver installation or driver compatibility guarantees. The plugin reports the selected backend and binary variant; platform GPU drivers remain user/platform managed.
- Multi-shard and multimodal model bundles, including automatic `mmproj` discovery/verification.
- Gated/private Hub repository access and persistent Hugging Face token storage. Public repositories work without a token. If gated access is added later, credentials must use a host secure-credential facility or an explicitly ephemeral input; never persist a token in plugin config, shared setup, or a model preset.
- llama.cpp MCP servers, built-in agent tools, remote RPC devices, and arbitrary custom command fragments.
- A general-purpose llama.cpp provider API or a generic backend abstraction shared with Ollama.

## Plugin identity and page structure

Use `plugins/llamacpp/` with plugin ID `llama-cpp`, module type `ai`, type flag `llama-cpp`, and display label `llama.cpp`. The manifest declares Windows, macOS, and Linux; runtime architecture/backend compatibility is checked against release assets and the current machine rather than encoded as a broad manifest claim.

The module page has four primary views:

1. **Service** — installed runtime/backend, selected model, common launch options, start/stop/restart, health, Base URL and copy action.
2. **Models** — public Hub search and detail/file selection; download progress; local models with size, source, and delete action.
3. **Runtime** — official release channel/tag, available platform variants, installation progress, installed versions, switch/remove actions.
4. **Logs and settings** — runtime/service logs and advanced supported server options. Model-specific Router INI presets are out of scope; persist supported settings as structured plugin-owned profile data and render them into CLI arguments/environment variables.

## Release discovery and runtime identity

Query the official `ggml-org/llama.cpp` GitHub Releases API. Default the list to stable releases and expose prereleases/nightly builds as an explicit opt-in. Parse the returned asset names and metadata rather than assuming every release has a fixed set of packages. A release entry is installable only when an exact asset matches the current OS, architecture, and selected backend. CUDA variants include their CUDA major/runtime identity, and any companion runtime archive must be installed as part of the same variant.

Use the following identity for installed/downloaded runtime records:

`release tag + OS + architecture + backend + CUDA runtime (when applicable)`

Before installation, reject unknown asset patterns and incompatible variants. Download over HTTPS, verify the GitHub-provided SHA-256 digest when available, unpack to a staging directory, confirm expected executable files exist, then activate the version. Failed download, digest check, extraction, or executable validation removes only staging files and leaves the active runtime untouched. Keep a previous installed version until the new one has passed executable/version probing.

No plugin archive contains llama.cpp binaries. Uninstalling or updating the plugin does not remove runtime binaries, model files, config, or logs.

## Model discovery and storage

Use Hugging Face Hub API to search public repositories and list repository files. Search results are third-party data, not a FlyEnv endorsement. Display repository ID, model card link, license metadata when present, quantization/file name and size; users choose the precise repository/file before download. `hf` is not required or bundled.

Download the selected public GGUF through the Hub Resolver URL into a unique temporary file in the plugin-owned model directory. Report streamed byte progress, verify the advertised size and Hub-provided SHA-256/LFS digest when available, and atomically move the validated file into its final path. Cancellation or failure removes only the temporary partial file. If metadata does not expose a digest, verify the advertised byte size and retain the repository/file/revision provenance in local metadata. Do not implement automatic selection of a random quantization. Multi-file manifests, resume-after-restart, and gated/private credentials remain future work.

Local models and Hub cache contents are user data. Deletion removes only the selected model/cache entry after confirmation; deleting the plugin never deletes these files.

## Configuration and security

Persist module-owned settings with `StorageSetAsync`/`StorageGetAsync`; do not write them to `config.setup` or create a Pinia store. Existing shared `BrewStore`/`ModuleInstalledItem` remains the source for installed runtime selection where the existing service framework requires it. Plugin-local domain state (model metadata, backend profile and defaults) lives in a normal plugin-local class/singleton exposed with `reactiveBind` if needed.

Launch `llama-server` using an argv array and explicit child-process environment. The profile supports only typed/validated fields; arbitrary argument strings and shell fragments are forbidden. Use `127.0.0.1` as the default bind address. If the user selects a non-loopback bind address, require API authentication and write the key to a private key file consumed with `--api-key-file`; do not expose it in process arguments, logs, or shared configuration. If the host does not offer a secure credential/file-permission path for an OS, keep non-loopback binding unavailable there until it does.

Do not enable llama.cpp's MCP servers, built-in tools, or agent mode in the first version. These features can execute tools or access files and need a separate permissions/product design.

## State ownership and operation contracts

| Operation/state | Owner and lifetime | Events and terminal behavior | Duplicate/re-entry behavior | Service interaction |
|---|---|---|---|---|
| Search Hub / inspect repository | Mounted Models view owns query, filters, selection; short read-only request goes through plugin Fork | Request/result/error; view may discard result on unmount | Debounce searches; latest query wins | None |
| Install/update runtime | Module-local renderer singleton controller owns request snapshot, progress, notice, error and cleanup; Fork performs download/extract/validation | Start → byte progress/status updates → one terminal success/failure; no progress callback clears controller state | One install per runtime identity; duplicate invocation is rejected/joins existing operation; page re-entry rebinds to singleton state | If updating active runtime, stop the service first; abort update if stop fails |
| Download model | Module-local renderer singleton controller owns operation UI state; Fork streams the Hub Resolver response and owns the request/partial file | Start → byte progress → verify digest/size → atomic finalization → terminal success/failure/cancel | One download per repo/revision/file; reject conflicting duplicate; cancellation aborts the request and removes only the partial file | Cannot change the active server's model in place; if cache mutation conflicts, stop that model or reject until stopped |
| Start/stop/restart server | Existing `ModuleInstalledItem` lifecycle; Fork module owns PID, port, child process, health startup and shutdown ordering | start request → spawn/log/health events → terminal ready/failure; stop request → child exit/cleanup → terminal stopped/failure | Reuse lifecycle guard; second start does not spawn a duplicate; restart serializes stop then start | `_startServer`/`_stopService` implement llama-specific args while using Base lifecycle; Fork is source of truth for liveness |
| Delete local model/runtime | Module-local controller owns request UI state; Fork validates path ownership and performs deletion | progress if needed → terminal result; never delete shared parent directories | Reject deletion while model/runtime is in active use | Stop service before deleting active runtime/model; abort on failed stop |

Page components own only transient form fields, dialogs, filters and selection. The module-level controller owns long operations that can outlive a page. The Fork module owns subprocesses, PID/port state, health, child cancellation, and companion shutdown. No renderer `running` flag is authoritative for process liveness.

## Fork and lifecycle design

The plugin Fork entry exports a module extending `Base`. It sets a unique type flag, provides release discovery and installation hooks, local version scanning, Hub search/download operations, `_startServer`, and `_stopService`. Service start inputs are passed through the module registration's `startExtParam`; settings are snapshotted when start begins so edits during startup do not mutate the in-flight request.

Reuse `Base.installSoft()` when its download/extract contract fits official release assets. Add plugin-local staging, companion CUDA runtime handling, digest validation and executable probing around the base behavior as needed; do not alter generic `Base` for llama.cpp-only asset conventions. Use the existing Fork IPC/plugin fallback path; do not add a built-in `AppModuleEnum` member or shared service type.

The renderer entry registers the service module and routes. Shared framework components are host-bridged according to `plugins/README.md`; heavy shared UI dependencies and host singleton state must not be bundled into the plugin. Plugin-only types, release policies, settings, API helpers and controllers remain under `plugins/llamacpp/`.

## File responsibilities (planned)

```text
plugins/llamacpp/
  plugin.json
  lang/{index.ts,en.ts,zh.ts}
  render/
    Module.ts
    Index.vue
    aside.vue
    controller.ts
    runtime/        # release/variant selection view
    models/         # Hub search, local model view
    settings/       # typed launch profile
  fork/
    index.ts
    LlamaCpp/index.ts
    release.ts      # GitHub release/asset normalization
    models.ts       # Hub metadata and model file transfer
```

Exact splitting may follow the code size, but all module-specific policy and state stays inside this plugin directory. No source file under `src/fork/module/Ollama` or `src/render/components/Ollama` is changed by this feature.

## Validation and acceptance criteria

- `yarn plugin:build llamacpp` creates a standalone plugin archive without embedding runtime/model payloads or duplicating host singletons/heavy UI components.
- `yarn plugin:test llamacpp` validates manifest, entry wiring, release asset parsing, supported platform filtering, launch argument generation, secret redaction, and model path ownership.
- `yarn plugin:runtime-smoke` verifies install/activate, renderer route, Fork runtime discovery, server start/health/stop, plugin update/disable/uninstall, and preservation of runtime/model data.
- Runtime selection never returns a mismatched OS/architecture/backend/CUDA companion combination; a release missing an asset presents that variant as unavailable.
- Public Hub search does not require `hf` or a token; HTTP 429 and network failures are shown with retry guidance and do not leave a stuck loading state.
- Duplicate runtime/model operations do not corrupt staging or produce multiple child processes. Failure, cancellation, page unmount/re-entry, and retry each reach a terminal controller state and clean listeners.
- Server failure during spawn or health startup is surfaced as a failed start, with the process and PID record cleaned. Stop failure prevents update/delete/uninstall of an active runtime or model.
- Default service binding is loopback; a non-loopback bind cannot start without an API key file.
- No new module-owned data is stored in `config.setup`, no new Pinia store is added, and module-specific contracts do not leak into shared service abstractions.

## Non-goals

- Change the built-in Ollama module or migrate it to the plugin system.
- Bundle llama.cpp binaries or model weights in the plugin archive.
- Add arbitrary shell command support, installer-managed GPU drivers, or a generic multi-backend abstraction.
- Extend the global Provider/plugin API in the first implementation.
- Remove user runtime/model/config/log data when disabling, updating, or uninstalling the plugin.

## Open operational limits

- Official Release asset naming and availability can change. The plugin must treat the API response as the source of truth, validate recognizable asset shapes, and keep variant parsing covered by representative fixtures from official releases.
- llama.cpp server flags evolve. The plugin binds supported launch settings to the selected runtime's `--help`/version capability and reports unsupported variants rather than guessing. Model file transfer is independent of the runtime's optional download subcommand.
- Runtime drivers are outside the plugin's management scope. A binary being listed means only that an official asset exists for that OS/architecture/backend, not that the user's machine can execute it successfully.
