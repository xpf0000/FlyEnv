# Startup Group Platform Module Lazy Resolution Design

## Goal

Ensure Startup Group resolves platform-specific modules only when candidate discovery runs, after the renderer has received the `window.Server` platform flags from the main process.

## Confirmed Root Cause

`src/render/components/Aside/Index.vue` statically imports the Startup Group runtime. That import is reached through the renderer entry dependency graph before the body of `src/render/main.ts` receives and assigns the `APP-Ready-To-Show` payload.

`src/render/components/StartupGroup/runtime.ts` currently calls `platformModules()` while constructing the singleton runtime. At that point `window.Server.isMacOS`, `window.Server.isWindows`, and `window.Server.isLinux` are not initialized, so the runtime permanently captures an empty module array even after `window.Server` becomes ready.

## Design

Change the Startup Group runtime dependency from an eagerly supplied `modules` array to a `getModules()` provider. `createStartupGroupRuntime()` will call this provider at the beginning of each `listCandidates()` invocation and use that returned array as a stable snapshot for the rest of the candidate scan.

`src/render/components/StartupGroup/runtime.ts` will pass `platformModules` as the provider instead of calling it during module evaluation. No platform fields will be read while importing or constructing the runtime singleton.

The runner adapters do not depend on the module list, so starting, stopping, and checking previously saved Startup Group entries will remain unchanged.

## Initialization and Data Flow

1. Renderer modules load and construct `startupGroupRuntime` without reading `window.Server` platform flags.
2. The main process sends `APP-Ready-To-Show`, and `src/render/main.ts` assigns the platform data to `window.Server` before mounting the Vue application.
3. Startup Group candidate discovery calls `listCandidates()`.
4. `listCandidates()` calls `getModules()`, which runs `platformModules()` against the initialized platform flags.
5. Candidate discovery filters and loads installed services and language projects from the platform-appropriate module snapshot.

## Error Handling and Compatibility

- If candidate discovery is deliberately called before any platform flag is available, `platformModules()` continues returning an empty array rather than guessing a platform.
- A later `listCandidates()` call re-evaluates the provider and can recover once `window.Server` is initialized.
- Existing installed-version and project-loading error behavior remains unchanged.
- No renderer-wide bootstrap or IPC lifecycle changes are included.

## Verification

- Add a regression test proving `createStartupGroupRuntime()` does not invoke the module provider during construction.
- Update the platform/module source regression check to require passing `platformModules` lazily instead of calling it eagerly.
- Run the Startup Group test script.
- Run TypeScript/Vue type checking and lint the changed files where supported by the project configuration.

## Out of Scope

- Refactoring the renderer entry to dynamically import the entire application after `APP-Ready-To-Show`.
- Detecting the operating system independently in the renderer.
- Changing the global `window.Server` initialization contract.
