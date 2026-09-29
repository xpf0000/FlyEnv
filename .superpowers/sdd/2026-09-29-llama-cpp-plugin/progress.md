# SDD ledger — plan: docs/superpowers/plans/2026-09-29-llama-cpp-plugin.md

Pre-flight shared interfaces:
- Task 1 produces plugin ID/type flag and Base-derived Fork export; Task 2/3 depend on stable plugin identity and module contract. Match: `llama-cpp`, dynamic Fork plugin loading, no built-in enum.
- Task 2 produces `RuntimeVariant`, `RuntimeHost`, and release parsing; Task 3 consumes variants for install/version records. Match: runtime identity includes tag/platform/arch/backend/CUDA runtime.
- Task 3 produces injectable `createLlamaCppModule(deps)` and runtime management; Task 4 adds Hub methods to the same module; Task 5 adds launch profile/lifecycle. Match: module factory is the seam for deterministic tests.
- Task 4 produces Hub/model types and IPC operation names; Task 6 consumes these in the renderer controller. Match: operation IDs are passed through IPC and cancellation is a Fork method, not a serialized AbortSignal.
- Task 5 produces `LaunchProfile`, validated invocation and server lifecycle; Task 6 consumes these for settings and service start extensions. Match: settings remain typed; Fork builds argv/env.
- Task 3–6 produce real plugin behavior; Task 7 consumes it in the Electron smoke path. Match: smoke uses local fixtures and a fake server, no public downloads.
- Task 1–7 produce the installable plugin; Task 8 documents/builds the catalog draft. Match: build leaves artifact URL empty pending publication.

Task status:
- Task 1: in progress
- Task 2: pending
- Task 3: pending
- Task 4: pending
- Task 5: pending
- Task 6: pending
- Task 7: pending
- Task 8: pending

Task 1: Ruling: add `render/lang.ts` and `fork/lang.ts` bindings — `plugins/README.md` requires each process to bind the side-agnostic dictionary to the live host locale bridge; cost if wrong: two unnecessary adapters, but omitting them would leave plugin-local translations disconnected from runtime locale changes.
Task 1: complete (commits 64282d8..176f7ad, tests: yarn plugin:test llamacpp → Done in 5.62s.)

Task 2: task-start — add deterministic official-release asset fixtures first, then implement only recognized runtime archive patterns and CUDA companion matching. Current `RuntimeBackend`/`RuntimeIdentity` scaffold is the shared contract; no host code changes expected.
Task 2: complete (commit pending; `yarn test:llamacpp-plugin`, `yarn plugin:test llamacpp`, and `yarn plugin:build llamacpp` passed. Red run failed as expected on missing parser; a later failing assertion exposed Linux ARM64 CUDA escaping the planned support matrix and was fixed.)

Task 3: task-start — runtime management will use a plugin-local installer with injected filesystem/download/extract/probe operations. The install transaction must never replace an existing target until the staged archive and any exact CUDA companion have extracted and passed executable probing; removal resolves strictly beneath the plugin runtime root.
Task 3: complete (commit pending; runtime contract tests cover SHA mismatch rollback, missing executable cleanup, matching CUDA companion extraction, and deletion containment. `yarn test:llamacpp-plugin`, `yarn plugin:test llamacpp`, `yarn plugin:build llamacpp`, and `git diff --check` passed.)

Task 4: task-start — implement anonymous Hub search/file metadata plus one-file GGUF transfer behind an injectable adapter; Fork owns AbortControllers and sends progress events only, while cancellation removes only the per-operation partial file.
Task 4: complete (commit pending; contract tests now cover anonymous paginated search and 429, GGUF file metadata, digest/size and atomic rename, partial cleanup, and model path/active-use protections. Hub requests use FlyEnv's Axios proxy settings. `yarn test:llamacpp-plugin` and `yarn plugin:test llamacpp` passed. Whole-project `npx tsc --noEmit` is currently blocked by unrelated existing errors in electron-builder config, DNS, image compression, Podman, BrewFormula, and Plugin.ts; no llama.cpp diagnostics remained after removing one unused test import.)
