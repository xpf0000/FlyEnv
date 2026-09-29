# llama.cpp Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Ship an installable FlyEnv plugin that manages official llama.cpp runtime variants, public single-file GGUF downloads, typed server settings, and a local OpenAI-compatible server lifecycle.

**Architecture:** Implement a self-contained plugin under `plugins/llamacpp` with a renderer module/controller and a Fork module extending FlyEnv `Base`. Reuse Plugin Market, plugin bridges, `BrewStore`/`ModuleInstalledItem`, and the existing service lifecycle; keep runtime/model/config/log files outside the plugin archive and persist plugin-owned settings through `StorageSetAsync`/`StorageGetAsync`.

**Tech Stack:** TypeScript, Vue 3, ForkPromise, Axios/Node streams, GitHub Releases API, Hugging Face Hub/Resolver endpoints, existing plugin builder and Electron runtime-smoke harness.

**Spec:** [2026-09-29-llama-cpp-plugin-design.md](../specs/2026-09-29-llama-cpp-plugin-design.md)

## Global Constraints

- `moduleType` is `ai`; plugin ID and module type flag are `llama-cpp`; do not add a built-in `AppModuleEnum` entry.
- Plugin runtime/model/config/log data remains outside the plugin code directory and survives plugin disable, update, or uninstall.
- Use `ModuleInstalledItem.start/stop/restart()` and plugin `startExtParam`/`stopExtParam` when they express the lifecycle; keep Fork authoritative for PID, process, port, health, and shutdown.
- Store new module-owned settings through `StorageSetAsync`/`StorageGetAsync`; do not add `config.setup` fields or a Pinia store.
- Keep module-only types, policies, helpers, and controllers under `plugins/llamacpp/`; do not modify Ollama or generic service abstractions for llama-specific behavior.
- Use argument arrays, typed/validated options, loopback by default, and require an API key file for non-loopback binding.
- Do not enable MCP, agent tools, arbitrary shell arguments, driver installation, private/gated Hub access, or multi-file/multimodal downloads.

## Review Focus

- **Release asset mismatch or missing companion CUDA runtime:** fixture tests must show unavailable/mismatched variants are rejected and CUDA assets stay paired with the correct runtime.
- **Failed runtime install or cancelled model download:** tests must confirm partial/staging paths are removed while active versions and completed models remain intact.
- **Process startup failure or health timeout:** tests must confirm PID/process cleanup and a terminal failed state before retry.
- **Duplicate operation, page unmount, or re-entry:** tests must confirm one operation/process, retained controller progress, and listener cleanup at the terminal event.
- **Unsafe API exposure or path deletion:** tests must confirm non-loopback binding requires an API key file and deletion cannot escape the plugin-owned runtime/model roots.

---

## File Map

- `plugins/llamacpp/plugin.json` — plugin identity, module capabilities, and entries.
- `plugins/llamacpp/lang/` — side-agnostic dictionaries plus Renderer/Fork locale bindings.
- `plugins/llamacpp/render/lang.ts`, `fork/lang.ts` — bind the shared dictionaries to each process's live host locale runtime.
- `plugins/llamacpp/shared/types.ts` — module-local runtime, model, profile, and operation types (type-only imports across bundles).
- `plugins/llamacpp/fork/LlamaCpp/index.ts` — Base-derived service module, release/version hooks, runtime install/remove, and server lifecycle.
- `plugins/llamacpp/fork/release.ts` — GitHub release/asset normalization and host-variant matching.
- `plugins/llamacpp/fork/models.ts` — Hub search/file metadata and streamed single-file model downloads.
- `plugins/llamacpp/fork/config.ts` — typed server argument/environment construction, key-file handling, and path ownership checks.
- `plugins/llamacpp/fork/index.ts` — plugin Fork entry export.
- `plugins/llamacpp/render/Module.ts`, `Index.vue`, `aside.vue` — service module and page shell; `aside.vue` registers service start extensions.
- `plugins/llamacpp/render/controller.ts` — module-local reactive operation controller for runtime/model operations, progress, errors, duplicate guards, and cleanup.
- `plugins/llamacpp/render/runtime/`, `models/`, `settings/` — focused views for runtime variants, Hub/local models, and typed launch profiles.
- `scripts/llamacpp-plugin-contract-test.ts` — deterministic contract tests using fixtures and local fake HTTP/process dependencies.
- `scripts/plugin-runtime-smoke.ts` — extend existing plugin smoke coverage for service-plugin lifecycle and preservation of runtime/model data.
- `src/main/Application.ts` — add llama.cpp-only actions to the existing smoke-gated hooks; no production lifecycle behavior changes.
- `package.json` — add `test:llamacpp-plugin` script.
- `plugins/README.md` — document llama.cpp plugin development and module-specific runtime/model data behavior after implementation.
- `plugins/registry.json` — generated draft catalog metadata from `yarn plugin:build llamacpp`; keep `artifact.url` empty until the archive is uploaded.

## Task 1: Scaffold the self-contained service plugin

**Files:**
- Create: `plugins/llamacpp/plugin.json`
- Create: `plugins/llamacpp/shared/types.ts`
- Create: `plugins/llamacpp/lang/{index.ts,en.ts,zh.ts}`
- Create: `plugins/llamacpp/render/Module.ts`, `Index.vue`, `aside.vue`
- Create: `plugins/llamacpp/fork/index.ts`, `fork/LlamaCpp/index.ts`
- Test: existing `scripts/plugin-test.ts` contract through `yarn plugin:test llamacpp`

**Interfaces:**
- Produces plugin ID `llama-cpp`, type flag `llama-cpp`, module type `ai`, and a Fork export whose default module exposes `exec`, `_startServer`, and `stopService`.
- Initial `RuntimeBackend` union: `'cpu' | 'cuda' | 'vulkan' | 'metal'`; runtime identity includes `release`, `platform`, `arch`, `backend`, and optional `cudaVersion`.

- [x] **Step 1: Add the minimal manifest and entry modules** with the identity above, `isService: true`, localized label `llama.cpp`, and Windows/macOS/Linux platform declaration.
- [x] **Step 2: Run `yarn plugin:test llamacpp`**; verify the plugin builder catches missing entries or an invalid Fork export before implementation.
- [x] **Step 3: Add localized dictionaries and the renderer page shell**; render Service, Models, Runtime, and Logs/Settings navigation without adding an enum or host store.
- [x] **Step 4: Register `AsideSetup('llama-cpp')` plus `startExtParam`/`stopExtParam`** and bind the new page to `AppModuleSetup('llama-cpp')`.
- [x] **Step 5: Run `yarn plugin:test llamacpp` and `yarn plugin:build llamacpp`**; inspect the artifact to confirm host runtime/singleton bridges are used and no runtime/model payload is included.
- [x] **Step 6: Commit** the scaffold as `feat: scaffold llama.cpp service plugin`.

## Task 2: Normalize official Release assets into supported variants

**Files:**
- Create: `plugins/llamacpp/fork/release.ts`
- Modify: `plugins/llamacpp/shared/types.ts`
- Create: `scripts/llamacpp-plugin-contract-test.ts`
- Modify: `package.json`

**Interfaces:**
- `parseReleaseAssets(release: GitHubRelease, host: RuntimeHost): RuntimeVariant[]`
- `fetchRuntimeReleases(channel: 'stable' | 'prerelease', host: RuntimeHost): Promise<RuntimeVariant[]>`
- `RuntimeVariant` has `release`, `platform`, `arch`, `backend`, `assetUrl`, `assetName`, `size`, optional `sha256`, optional `cudaVersion`, and optional companion runtime asset.
- `RuntimeHost` normalizes the host OS/architecture to `windows | macos | linux` and `x64 | arm64`.

- [x] **Step 1: Add fixture tests** `testReleaseAssetParsing`, `testUnsupportedVariantFiltered`, `testCudaCompanionPairing`, and `testUnknownAssetRejected` using checked-in snapshots derived from official release asset names.
- [x] **Step 2: Run `yarn test:llamacpp-plugin`**; verify all four tests fail because the parser and script do not exist.
- [x] **Step 3: Implement the release API adapter and pure parser** in `release.ts`; recognize only documented asset patterns, derive CUDA version, pair companion archives, and omit unsupported combinations.
- [x] **Step 4: Add the `test:llamacpp-plugin` package script** to execute the deterministic test file via the repository's `tsx` runner.
- [x] **Step 5: Run `yarn test:llamacpp-plugin`**; expect asset fixtures to pass without network access.
- [x] **Step 6: Commit** as `feat: parse llama.cpp release variants`.

## Task 3: Install, discover, and safely remove runtime variants

**Files:**
- Modify: `plugins/llamacpp/fork/LlamaCpp/index.ts`
- Create: `plugins/llamacpp/fork/runtime.ts`
- Modify: `plugins/llamacpp/shared/types.ts`
- Test: `scripts/llamacpp-plugin-contract-test.ts`

**Interfaces:**
- Fork methods `fetchAllOnlineVersion(): ForkPromise<OnlineVersionItem[]>`, `allInstalledVersions(setup): ForkPromise<SoftInstalled[]>`, `installSoft(row)`, and `removeRuntime(identity)` follow the existing plugin/Base contracts.
- `installRuntime(variant: RuntimeVariant, paths: RuntimePaths, deps: RuntimeInstallDeps): Promise<SoftInstalled>` performs staging, download, digest check when available, extraction, executable/version probe, then activation.
- `RuntimePaths` contains only resolved plugin-owned `cacheDir`, `runtimeRoot`, and `stagingRoot`.
- Export `createLlamaCppModule(deps: LlamaCppDeps = productionDeps): LlamaCppModule` and use it for the default Fork export; `LlamaCppDeps` supplies HTTP, filesystem, spawn, and host-path adapters so tests can inject local fakes without production URL override flags.

- [x] **Step 1: Add tests** `testRuntimeInstallDigestFailurePreservesActiveVersion`, `testRuntimeInstallMissingExecutableCleansStaging`, `testRuntimeInstallSuccessPairsCudaRuntime`, and `testRuntimeDeleteRejectsOutsideRoot` with injected filesystem/downloader/probe dependencies.
- [x] **Step 2: Run `yarn test:llamacpp-plugin`**; verify the new tests fail on absent install/remove helpers.
- [x] **Step 3: Implement staging install and validation** in `runtime.ts`; use FlyEnv proxy settings, verify GitHub SHA-256 when supplied, preserve active version on failure, and install CUDA companion files atomically with the matching variant.
- [x] **Step 4: Implement Fork version hooks** by mapping normalized variants to `OnlineVersionItem`/`SoftInstalled`; clear `versionDirCache` before local scanning and keep records distinct by backend/runtime identity.
- [x] **Step 5: Add deletion ownership checks** so removing a runtime can only remove a fully resolved child of `runtimeRoot`, and never model/config/log directories.
- [x] **Step 6: Run `yarn test:llamacpp-plugin` and `yarn plugin:test llamacpp`**; expect runtime contract and plugin-export checks to pass.
- [x] **Step 7: Commit** as `feat: manage llama.cpp runtime variants`.

## Task 4: Add Hub search and streamed single-file GGUF downloads

**Files:**
- Create: `plugins/llamacpp/fork/models.ts`
- Modify: `plugins/llamacpp/fork/LlamaCpp/index.ts`
- Modify: `plugins/llamacpp/shared/types.ts`
- Test: `scripts/llamacpp-plugin-contract-test.ts`

**Interfaces:**
- `searchHubModels(query: string, page: number): Promise<HubModel[]>`
- `getHubModelFiles(repoId: string, revision: string): Promise<HubModelFile[]>`
- `downloadHubModelFile(operationId: string, file: HubModelFile): ForkPromise<LocalModel>` stores its AbortController in the Fork module and reports progress through ForkPromise.
- `cancelModelDownload(operationId: string): ForkPromise<boolean>` aborts the matching Fork-owned request; an AbortSignal is never sent over IPC.
- Fork `exec('searchHubModels' | 'getHubModelFiles' | 'downloadHubModelFile' | 'cancelModelDownload', ...)` exposes these methods.

- [x] **Step 1: Add local HTTP fixture tests** `testHubSearchAnonymousPaginationAnd429`, `testHubFileMetadata`, `testModelDownloadDigestAndAtomicRename`, `testModelDownloadCancelRemovesPartial`, and `testModelDeleteRejectsOutsideRoot`.
- [x] **Step 2: Run `yarn test:llamacpp-plugin`**; verify tests fail before the Hub/model functions exist.
- [x] **Step 3: Implement Hub search and tree metadata reads** using public endpoints, pagination, explicit query, timeout, and FlyEnv proxy settings; surface 429 status/retry metadata without hiding the error.
- [x] **Step 4: Implement single-file resolver streaming** into a unique partial path; enforce advertised size, verify SHA-256/LFS digest when supplied, atomically rename only after validation, and retain repo/revision/file/license provenance.
- [x] **Step 5: Implement cancellation and model deletion** with path containment checks; cancellation removes only the partial file and deletion rejects active models or paths outside `modelRoot`.
- [x] **Step 6: Run `yarn test:llamacpp-plugin`**; expect public anonymous search, progress, digest, cancellation, and ownership tests to pass.
- [x] **Step 7: Commit** as `feat: add llama.cpp Hub model workflow`.

## Task 5: Build validated server profiles and Fork lifecycle

**Files:**
- Create: `plugins/llamacpp/fork/config.ts`
- Modify: `plugins/llamacpp/fork/LlamaCpp/index.ts`
- Modify: `plugins/llamacpp/shared/types.ts`
- Test: `scripts/llamacpp-plugin-contract-test.ts`

**Interfaces:**
- `validateLaunchProfile(profile: LaunchProfile, variant: RuntimeVariant): ValidatedLaunchProfile`
- `buildServerInvocation(profile: ValidatedLaunchProfile, runtime: SoftInstalled, model: LocalModel): ServerInvocation` where `ServerInvocation` is `{ bin: string; args: string[]; env: Record<string, string>; cwd: string }`.
- `createApiKeyFile(key: string, secretRoot: string, platform: Platform): Promise<string>` writes a private key file and returns its path.
- `_startServer(version: SoftInstalled, profile: LaunchProfile, model: LocalModel): ForkPromise<StartResult>` and `_stopService(version: SoftInstalled): ForkPromise<StopResult>` use existing Base process ownership/cleanup.

- [x] **Step 1: Add tests** `testBuildServerInvocationUsesArgv`, `testLaunchProfileRejectsUnknownBackendDevice`, `testLoopbackDoesNotRequireApiKey`, `testNonLoopbackRequiresApiKeyFile`, `testApiKeyNeverAppearsInArgsOrLogs`, and `testHealthTimeoutCleansProcess`.
- [x] **Step 2: Run `yarn test:llamacpp-plugin`**; verify tests fail on missing profile/invocation/lifecycle implementation.
- [x] **Step 3: Implement typed profile validation and invocation generation** for model path, ctx, threads, GPU layers/device, host, port, UI state, and only flags supported by the selected runtime capability probe. Do not pass arbitrary strings or use shell interpolation.
- [x] **Step 4: Implement private API key file creation** and enforce a key for non-loopback hosts; fail closed if the platform cannot create/maintain the required private file.
- [x] **Step 5: Implement `_startServer`/`_stopService`** using Base service lifecycle and plugin `typeFlag`; wait for `/health` readiness with a bounded timeout, emit intermediate logs, and terminate/clean PID state on failed readiness.
- [x] **Step 6: Run `yarn test:llamacpp-plugin` and `yarn plugin:test llamacpp`**; expect invocation, security, health cleanup, and Fork export contracts to pass.
- [x] **Step 7: Commit** as `feat: run llama.cpp server from validated profiles`.

## Task 6: Add renderer operation controller and plugin pages

**Files:**
- Create/modify: `plugins/llamacpp/render/controller.ts`
- Create/modify: `plugins/llamacpp/render/runtime/Index.vue`
- Create/modify: `plugins/llamacpp/render/models/Index.vue`
- Create/modify: `plugins/llamacpp/render/settings/Index.vue`
- Modify: `plugins/llamacpp/render/Index.vue`, `aside.vue`, and translation dictionaries
- Test: `scripts/llamacpp-plugin-contract-test.ts`

**Interfaces:**
- `LlamaCppController` is a module-local singleton with reactive `runtimeOperation`, `modelOperation`, `error`, `installRuntime(variant)`, `downloadModel(file)`, `cancelModelDownload(id)`, and `clearError()` methods; it releases each operation's IPC listeners on its terminal event, not on page unmount.
- `LaunchProfile` and the `RuntimeVariant`, `HubModel`, `HubModelFile`, and `LocalModel` types come from Task 2–5; UI never constructs shell strings.

- [x] **Step 1: Add controller tests** `testControllerRejectsDuplicateRuntimeInstall`, `testControllerKeepsProgressUntilTerminalEvent`, `testControllerReentryRetainsOperation`, `testControllerCancelClearsListener`, and `testTerminalEventAllowsRetry` using mocked plugin IPC.
- [x] **Step 2: Run `yarn test:llamacpp-plugin`**; verify controller tests fail before its operation lifecycle exists.
- [x] **Step 3: Implement the module-local controller** to snapshot operation inputs, register/clean Fork progress listeners, retain state across page unmount, reject duplicate identities, and clear state only on a declared terminal event.
- [x] **Step 4: Implement Runtime and Models views** for release/backend selection, install progress, public Hub search/file selection, download/cancel, local model list, source/size, and confirmed deletion.
- [x] **Step 5: Implement service/settings/log views** using host-bridged `ServiceManager`, `VersionManager`, and `Log`; bind typed profiles through `StorageSetAsync`/`StorageGetAsync` and show Base URL/model ID copy actions.
- [x] **Step 6: Verify the renderer plugin artifact** with `yarn plugin:build llamacpp`; confirm no host singleton or heavyweight shared component is bundled and all English/Chinese keys resolve.
- [x] **Step 7: Run `yarn test:llamacpp-plugin` and `yarn plugin:test llamacpp`**; expect controller, renderer build, and manifest contracts to pass.
- [x] **Step 8: Commit** as `feat: add llama.cpp plugin management UI`.

## Task 7: Verify plugin lifecycle and isolate llama.cpp contracts

**Files:**
- Verify: existing `scripts/plugin-runtime-smoke.ts` and `src/main/Application.ts` smoke hooks.
- Test: `yarn plugin:runtime-smoke`

**Interfaces:**
- The existing Electron smoke validates the plugin-system install/route/Fork dispatch/start-stop/update/disable/re-enable/uninstall/data-preservation lifecycle with its synthetic plugin fixture.
- llama.cpp-specific release/model downloads, staging, integrity, path ownership, invocation, and health-timeout cleanup use deterministic local fakes in `test:llamacpp-plugin`; public weights and runtime binaries are never fetched by smoke.

- [x] **Step 1: Keep the smoke-gated Application hooks plugin-system generic**; a smoke-only network URL override would weaken fixed-origin runtime/model checks and duplicate deterministic fake dependencies.
- [x] **Step 2: Run `yarn plugin:runtime-smoke`**; verify the existing Electron install/relaunch/route/Fork/start-stop/update/disable/re-enable/uninstall/data-preservation checkpoints.
- [x] **Step 3: Add deterministic llama.cpp contract coverage** for release/model input validation, runtime/model staging, command invocation, API-key handling, and health-timeout cleanup.
- [x] **Step 4: Record the test boundary**: the existing Electron test does not launch a llama-server binary; that process path uses FlyEnv's existing `serviceStartSpawn`/Base lifecycle and is covered by bounded-health cleanup contracts.
- [x] **Step 5: Run `yarn test:llamacpp-plugin`, `yarn plugin:test llamacpp`, and `yarn plugin:runtime-smoke`**; all passed without public release/model downloads.
- [x] **Step 6: Commit** as `test: cover llama.cpp plugin runtime lifecycle`.

## Task 8: Document plugin operation and catalog draft

**Files:**
- Modify: `plugins/README.md`
- Modify: `plugins/registry.json` via `yarn plugin:build llamacpp`
- Verify: `dist/plugins/llamacpp/` output

- [x] **Step 1: Document** local development commands, runtime variant identity, model/cache/config locations, supported initial backends, and the fact that plugin uninstall preserves user data.
- [x] **Step 2: Build** with `yarn plugin:build llamacpp`; confirm the generated manifest/catalog uses plugin ID `llama-cpp`, includes the current archive SHA-256, and leaves `artifact.url` empty until release upload.
- [x] **Step 3: Run final checks** `yarn test:llamacpp-plugin`, `yarn plugin:test llamacpp`, and `yarn plugin:runtime-smoke`; expect all to pass.
- [x] **Step 4: Review `git diff --check` and generated registry changes**; do not publish/upload the plugin archive or fill `artifact.url` as part of implementation.
- [x] **Step 5: Commit** as `docs: document llama.cpp plugin development`.

## Verification Matrix

| Check | Required result |
|---|---|
| `yarn test:llamacpp-plugin` | Release matching, downloader, profile/security, controller, and deletion contract tests pass offline |
| `yarn plugin:test llamacpp` | Manifest/build/Fork entry contract passes |
| `yarn plugin:build llamacpp` | Plugin archive builds; runtime/models remain external; draft catalog entry has valid SHA and empty URL |
| `yarn plugin:runtime-smoke` | Generic Electron plugin install/route/Fork/lifecycle/update/uninstall/data-preservation pass; llama.cpp behavior is covered by local fake contract tests |
| `git diff --check` | No whitespace errors |

## Review follow-up: runtime safety and stop verification

- **Runtime install/removal owner:** the Fork `LlamaCppModule` owns each mutation for its asynchronous request lifetime. It emits install progress, returns one terminal success/error, and rejects duplicate mutations or mutations racing server startup. If the target runtime is active, Fork calls the existing Base stop lifecycle and aborts the mutation on stop or verification failure.
- **Service stop owner:** Fork calls Base shutdown, then verifies the returned PID set against a fresh process list and confirms the owned PID file is gone before clearing active runtime/model state or allowing replacement/deletion. Health-timeout cleanup preserves and reports shutdown failures without claiming the process stopped.
- **CUDA release pairing:** Fork parses runtime and companion names by platform, architecture, backend, and CUDA version. It omits CUDA variants without a matching companion; installation independently validates the pair and release URL.
- **Model launch boundary:** Fork resolves the model and managed model root through the filesystem, rejects non-files and symlink/path escapes, then launches using the canonical path.
- **Renderer removal flow:** the Runtime page exposes removal and refreshes installed versions after its terminal Fork response. The renderer controller owns request state and prevents re-entry while a runtime operation is active.
- **Lifecycle tests:** deterministic contracts cover no-tag CUDA companion pairing, omitted/mismatched companions, update/removal stop guards, failed stop propagation, PID/process stop verification, managed model path/symlink confinement, and health-timeout cleanup failure reporting.

## Review follow-up: browsable model catalog

- **User flow:** Models opens on a public GGUF library sorted by downloads; the optional search accepts a model name or `organization/repository`. The local-model list is a separate tab. Expanding one repository fetches its GGUF variants and shows each file's advertised size before download.
- **Operation ownership:** catalog and repository-file lookups are bounded, read-only page requests whose transient loading/results belong to the mounted Models view; duplicate search and stale file-list responses are guarded there. Downloads and cancellation remain owned by `LlamaCppController`/Fork and retain their existing progress, terminal-event, and retry behavior.
- **Verification:** the offline contract test confirms an empty-query request lists popular GGUF repositories with download sorting and pagination; existing metadata tests cover file size, and plugin build validates the updated tabbed renderer.
