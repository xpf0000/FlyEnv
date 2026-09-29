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
- Task 1: complete
- Task 2: complete
- Task 3: complete
- Task 4: complete
- Task 5: complete
- Task 6: complete
- Task 7: complete with documented smoke-scope ruling
- Task 8: complete

Task 1: Ruling: add `render/lang.ts` and `fork/lang.ts` bindings — `plugins/README.md` requires each process to bind the side-agnostic dictionary to the live host locale bridge; cost if wrong: two unnecessary adapters, but omitting them would leave plugin-local translations disconnected from runtime locale changes.
Task 1: complete (commits 64282d8..176f7ad, tests: yarn plugin:test llamacpp → Done in 5.62s.)

Task 2: task-start — add deterministic official-release asset fixtures first, then implement only recognized runtime archive patterns and CUDA companion matching. Current `RuntimeBackend`/`RuntimeIdentity` scaffold is the shared contract; no host code changes expected.
Task 2: complete (commit pending; `yarn test:llamacpp-plugin`, `yarn plugin:test llamacpp`, and `yarn plugin:build llamacpp` passed. Red run failed as expected on missing parser; a later failing assertion exposed Linux ARM64 CUDA escaping the planned support matrix and was fixed.)

Task 3: task-start — runtime management will use a plugin-local installer with injected filesystem/download/extract/probe operations. The install transaction must never replace an existing target until the staged archive and any exact CUDA companion have extracted and passed executable probing; removal resolves strictly beneath the plugin runtime root.
Task 3: complete (commit pending; runtime contract tests cover SHA mismatch rollback, missing executable cleanup, matching CUDA companion extraction, and deletion containment. `yarn test:llamacpp-plugin`, `yarn plugin:test llamacpp`, `yarn plugin:build llamacpp`, and `git diff --check` passed.)

Task 4: task-start — implement anonymous Hub search/file metadata plus one-file GGUF transfer behind an injectable adapter; Fork owns AbortControllers and sends progress events only, while cancellation removes only the per-operation partial file.
Task 4: complete (commit pending; contract tests now cover anonymous paginated search and 429, GGUF file metadata, digest/size and atomic rename, partial cleanup, and model path/active-use protections. Hub requests use FlyEnv's Axios proxy settings. `yarn test:llamacpp-plugin` and `yarn plugin:test llamacpp` passed. Whole-project `npx tsc --noEmit` is currently blocked by unrelated existing errors in electron-builder config, DNS, image compression, Podman, BrewFormula, and Plugin.ts; no llama.cpp diagnostics remained after removing one unused test import.)

Task 5: task-start — profile validation, argv-only invocation and secret-file protection will be independently testable; service startup will use the existing Fork service spawn helper, then perform bounded `/health` checks and delegate timeout cleanup to the Base-owned process shutdown path.
Task 5: complete (commit pending; tests cover argv composition, backend/device and binding validation, private API-key file mode, secret redaction, and health-timeout cleanup. Fork start now uses the host service spawn helper, redacts launch details, waits for `/health`, and stops failed starts; stop discovery is scoped to llama-server. `yarn test:llamacpp-plugin`, `yarn plugin:test llamacpp`, `yarn plugin:build llamacpp`, and `git diff --check` passed.)

Task 6: task-start — keep long-running operations and saved module settings in plugin-local reactiveBind singletons; pages will own only transient inputs/selections. Renderer IPC listeners remain registered until their corresponding Fork terminal response and are cleaned there.
Task 6: complete (commit pending; module-local controller and Runtime/Models/Settings views are wired. State uses `reactiveBind` plus Storage APIs; controller tests cover duplicate rejection, retained progress/re-entry state, terminal retry, cancellation, and IPC listener cleanup. Renderer bundle passed Plugin Market checks and contains no host duplicate, route runtime, monaco, or xterm code. Targeted `npx tsc --noEmit` reported no llama.cpp/plugin-test diagnostics; `yarn test:llamacpp-plugin`, `yarn plugin:test llamacpp`, `yarn plugin:build llamacpp`, and `git diff --check` passed.)

Task 7: task-start — run the repository's isolated Electron install/relaunch/hot-update/disable/uninstall smoke. Ruling: keep this generic harness and its `Application.ts` hooks unchanged; its lifecycle checkpoints are plugin-system-wide and currently use a purpose-built synthetic Fork module. llama.cpp's public release/model hosts are deliberately not contacted by smoke; this plugin's download, staging, digest, cancellation, argv, health-timeout, and path-safety contracts are covered by deterministic local fakes in `test:llamacpp-plugin`. Extending Application with smoke-only network URL overrides would add test paths to the production plugin and risk weakening its fixed-origin security. Cost if this ruling is wrong: no end-to-end Electron test of the llama.cpp child-process itself; the service spawn/stop integration remains validated by shared host lifecycle and deterministic health-cleanup tests.
Task 7: complete (existing `yarn plugin:runtime-smoke` passed all 19 install/relaunch/route/Fork/start-stop/update/disable/re-enable/uninstall/data-preservation checkpoints.)
Task 7 follow-up: parser fixtures now match current official no-tag Windows names (`llama-bin-win-cpu-x64.zip`) and tagged Linux names; install validates exact official GitHub origin, release tag, CUDA companion pairing, expected archive size and optional digest. Hub downloads reconstruct the Resolver URL inside Fork, so renderer-supplied URLs cannot redirect model requests. `yarn test:llamacpp-plugin` and `yarn plugin:test llamacpp` passed.

Task 8: task-start — update plugin development docs, regenerate the registry from the final archive, verify the archive SHA/empty URL, then rerun all deterministic and Electron smoke checks before commit.

Task 8: complete (pending commit; plugin docs updated; final archive builds as `llama-cpp@0.1.0`, generated registry URL remains empty and its SHA-256 matches the archive byte-for-byte). Final deterministic contract tests, Plugin Market checks, renderer build, generic Electron runtime smoke, and diff checks passed. Whole-project tsc still reports existing errors outside this plugin; no llama.cpp diagnostics.

Review follow-up: implemented fixes for tagged/tagless CUDA companion pairing and omission of unmatched variants; active-runtime installation/removal now stops and verifies the process/PID state before mutation; cleanup failures remain visible; runtime removal is exposed in the page; launch model paths are canonicalized and confined beneath managed models. Added offline contract coverage for each case. Final contract tests, plugin checks/build, Electron runtime smoke, diff checks, and archive SHA verification passed. Full-project TypeScript check now reports only the existing unrelated errors in electron-builder config, DNS, Image, Podman, BrewFormula, and Plugin.ts.
