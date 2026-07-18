# Main-Process Lazy Loading and Idle Memory Design

## Problem

FlyEnv's Electron main process uses roughly 160 MB RSS after the main window has been idle. The main-process production bundle is approximately 423 KB of FlyEnv code and has 104 statically reachable internal modules. Bundle size alone is not the main concern: the startup graph statically imports optional features whose external dependencies initialize native bindings, parsers, networking stacks, syntax highlighters, or SDKs before the user invokes those features.

The eager graph currently reaches dependencies including `node-pty`, `@xpf0000/node-window-manager`, Axios, Shiki and Markdown plugins, MCP SDK transports, `serve-handler`, `compressing`, `node-machine-id`, and platform-specific privilege helpers. Isolated fresh-process import measurements are not additive, but they show that several of these packages can each account for meaningful RSS and are useful prioritization evidence.

Local dynamic imports alone will not provide the intended boundary under the current esbuild configuration. Both main builds use one `outfile`, bundle all local modules, and do not enable code splitting. Optional local modules therefore need both explicit runtime loading boundaries and ESM code splitting so their external imports remain outside the startup chunk.

The primary success metric is the production main process's stable RSS after the main window has been idle for ten seconds, with no service tasks started. The optimization must preserve all existing features and cross-platform behavior. An additional 100–500 ms on the first use of an optional feature is acceptable. A main-process RSS at or below 50 MB is the desired outcome, but it is not treated as a guaranteed threshold because Electron and V8 contribute a platform-dependent baseline outside FlyEnv's module graph.

## Requirements

- Minimize the production main process's ten-second idle RSS without disabling features.
- Keep application configuration, locale bootstrap, the main window, menus, tray, base IPC routing, fork communication, and required path setup available during startup.
- Load optional main-process features only on their first command or when configuration explicitly requires them at startup.
- Preserve MCP automatic startup when `mcp.autoStart` is enabled.
- Move non-interactive GitHub user and license network work to the existing fork process.
- Keep browser-based GitHub OAuth in the main process, but load its implementation only when the user starts OAuth.
- Deduplicate concurrent first-use loads, report loading failures through the existing IPC response paths, and allow a failed load to be retried.
- Do not load an optional module only to run shutdown cleanup. Clean up only modules that were already loaded.
- Preserve `dist/electron/main.mjs` as the stable entry path expected by development and packaging.
- Package every generated main-process chunk and verify dynamic imports from packaged ASAR builds.
- Measure main-process memory separately from renderer, GPU/helper, and utility-process memory.

## Selected Approach

Use esbuild ESM code splitting together with explicit, cached lazy service loaders. Keep a small eager application shell and divide optional behavior into chunks at feature boundaries. Use the existing utility-process fork selectively for non-interactive OAuth and license requests, where the fork already owns Axios and machine-ID work.

This approach targets the main-process RSS directly without adding one utility process per feature. It retains existing ownership for Electron-only behavior such as opening the system browser and managing an OAuth callback server. It also makes startup requirements explicit: a feature is eager only if the application cannot display and accept basic IPC commands without it, or a persisted setting such as MCP automatic startup requires it.

## Alternatives Rejected

### Dynamically import only external packages

Changing selected package imports to `import('axios')`, `import('shiki')`, and similar calls would require fewer build changes, but local optional modules would remain bundled into the single main entry. The boundary would be incomplete, easy to regress, and would require package-specific loading logic throughout feature implementations.

### Move every optional feature to utility processes

This could minimize the main process more aggressively, but it would add process startup cost, IPC serialization, lifecycle management, and cross-platform failure modes. It may also increase total application memory even while reducing the main process. Electron-owned behavior and native callback-heavy features would require disproportionate migration work.

### Keep the current single-file bundle

Source-level dynamic imports without code splitting can defer some module initialization, but esbuild must still represent local modules and their external dependencies inside one output graph. This does not create a dependable startup-memory boundary and cannot be validated by inspecting separate optional chunks.

## Eager Application Shell

The following responsibilities remain available during startup:

- Electron application and single-instance lifecycle;
- global paths and the minimum `global.Server` snapshot;
- configuration persistence and proxy/config synchronization;
- selected locale loading and native menu/tray translations;
- main window, tray, and menu construction;
- base IPC command registration and routing;
- `ForkManager` creation and communication bridges;
- lightweight service-process/version state needed by the base UI;
- permission and shutdown orchestration.

An eager facade may retain types, command names, callbacks, and small state, but it must not statically import the optional implementation it represents.

## Lazy Feature Boundaries

### Interactive OAuth

Remove the static `OAuth` imports from `Application.ts` and `IPCHandler.ts`. A cached OAuth loader imports the interactive implementation only for `GitHub-OAuth-Start`. The implementation continues to:

- bind the loopback callback server on `127.0.0.1:32481`;
- open the GitHub authorization URL with Electron `shell.openExternal`;
- receive the authorization code;
- exchange it through the FlyEnv service;
- return the GitHub user and license list to the renderer.

`GitHub-OAuth-Cancel` checks whether the module is loaded. If no flow has started, it returns success without importing anything. Application shutdown follows the same rule.

### Non-interactive GitHub and License Requests

Move the following operations from `src/main/core/OAuth.ts` into the existing fork-side `App` module:

- fetch the persisted GitHub user and bindings;
- fetch the user's license list;
- add a machine/license binding;
- delete a machine/license binding.

The automatic persisted-user query uses the existing `app-fork:app` command route. Existing renderer command names for license fetch, add binding, and delete binding remain unchanged; their `IPCHandler` methods become thin forwarders to the same fork-side `App` module. `IPCHandler` updates `global.Server` from configuration, `ForkManager` sends the command to a reusable utility process, and `BaseManager` loads `module/App` on first use. Results return through the existing fork callback and renderer IPC key.

The automatic startup user query moves into `SetupStore.init()` alongside the existing `licensesInit` request. It runs asynchronously and does not delay renderer mounting or the existing license initialization result. Cached local GitHub data can still render immediately; the fork result refreshes it when available. `Application.showPage()` no longer imports OAuth or performs `OAuth.fetchUser()` during `ready-to-show`.

### Terminal Runtime

The eager side retains only terminal command routing and callback registration. The first `NodePty:create`, write, resize, clear, or stop operation loads the terminal runtime and `node-pty`. Callback registration made before loading is stored by the facade and applied when the implementation resolves. Shutdown calls `exitAllPty()` only when the runtime was loaded.

### Screen Capture

The first capture-related IPC command loads `Capturer` and `@xpf0000/node-window-manager`. Basic window/screen positioning that does not depend on the native window-manager package remains eager only if required by the main window. Capture-window teardown checks the loader's loaded state.

### SiteSucker

SiteSucker setup reads, crawling, Axios, and agent dependencies load on the first SiteSucker setup or run command. Application startup stores the result callback without importing the crawler. The loader applies that callback when it creates the manager. Shutdown destroys the manager only if loaded.

### Static HTTP Server

`HttpServer` and `serve-handler` load on the first HTTP-server command. The command's existing reply shape and stop behavior remain unchanged. Shutdown does not initialize the server merely to confirm that no server is running.

### Markdown and Syntax Highlighting

`AppNodeFn` currently mixes lightweight Electron/Node operations with Markdown rendering. Keep the lightweight facade eager because native-theme and general Node-function IPC require it, but move Markdown rendering into a separate runtime chunk. The first Markdown request loads Shiki, Markdown-It, and the Markdown plugin set. Theme watching must not import the Markdown runtime.

### MCP Runtime

Keep lightweight MCP configuration and command routing separate from the MCP SDK runtime. When `mcp.autoStart` is false, the MCP server SDK, HTTP transport, tools, context resolver, and audit implementation load on the first MCP start, tool, context, or audit command. When `mcp.autoStart` is true, application initialization explicitly calls the same loader and starts MCP, preserving current startup behavior.

MCP stop and application shutdown inspect the loaded state. They do not import the SDK when MCP never started.

### Archive Extraction

Nginx initialization remains behaviorally unchanged. `compressing` loads only inside the branch that detects a missing configuration and must extract the bundled default archive. A machine with an existing configuration does not load the package.

### Platform-Specific Privilege and Helper Code

Check the operating system and requested command before importing Windows helper fallback, macOS/Linux Sudo, or other platform implementations. Shared command routing must use type-only imports or lightweight interfaces so an implementation for one platform is absent from the other platforms' startup chunks.

## Lazy Loader Contract

Each optional service exposes a small loader with these semantics:

1. The first request creates and caches one dynamic-import promise.
2. Concurrent requests await the same promise and cannot create duplicate native instances or callback servers.
3. A successful import remains cached for the application's lifetime.
4. A rejected import clears the cached promise, logs feature and command context, and lets the next request retry.
5. A `peek` or `isLoaded` operation reports loaded state without importing the implementation.
6. Cleanup methods operate only on a successfully loaded instance.

Feature loaders should be focused rather than a global string-keyed service locator. Shared helper code may implement promise caching, but feature-specific loaders retain typed interfaces and own callback/setup details.

## Build Design

Change only the main-process dev and production esbuild targets from `outfile` to `outdir`. Use named entry points plus `outExtension: { '.js': '.mjs' }` so the entry remains `dist/electron/main.mjs`, enable `splitting: true`, retain `bundle: true`, `packages: 'external'`, `platform: 'node'`, and `format: 'esm'`, and emit `.mjs` optional chunks below `dist/electron/chunks/`.

Development output names should remain deterministic enough for the restart watcher, while production chunks may include content hashes. Both modes must clean obsolete outputs at the beginning of a fresh build/package run. The packaged application must include the entire `dist/electron` directory rather than only `main.mjs`.

The fork build is not broadly redesigned in this scope. Existing fork module routing is reused for OAuth/license network work. Fork-wide code splitting can be evaluated separately against total application memory and process startup cost; it is not required to achieve the main-process boundary.

## Data Flows

### Normal Startup Without Optional Features

```text
Launcher
  -> eager Application shell
  -> config + selected locale
  -> window/menu/tray + base IPC
  -> main window ready
  -> renderer SetupStore.init
  -> existing fork licensesInit + GitHub user refresh
  -> main process remains free of optional feature chunks
```

### First Optional Command

```text
renderer command
  -> base IPC route
  -> typed feature loader
  -> cached dynamic import of one chunk
  -> feature implementation
  -> existing IPC response
```

### MCP Automatic Startup

```text
config says mcp.autoStart=true
  -> MCP loader
  -> SDK/runtime chunk
  -> create and start server
  -> existing MCP notifications
```

### Interactive OAuth

```text
GitHub-OAuth-Start
  -> OAuth loader
  -> loopback server + system browser
  -> GitHub callback code
  -> FlyEnv auth exchange
  -> renderer stores user UUID and cached profile
```

## Error Handling and Lifecycle

- Dynamic-import failures use the same command-specific IPC error response expected by the renderer.
- A failed load is retryable and does not leave a permanently rejected cached promise.
- First-use commands received concurrently preserve their current response keys and ordering; singleton resources such as OAuth callback servers are created once.
- Fork request failures preserve the current `code` and `msg` response convention and must not crash the main process.
- Application shutdown awaits existing asynchronous stop operations but skips every never-loaded optional runtime.
- An optional module may register listeners only after loading and must unregister those listeners in its existing destroy/stop operation.
- MCP auto-start failures remain non-fatal to the main window and are logged with MCP context.

## Testing Strategy

Implementation will use focused tests before changing each boundary. Because the project has limited unit-test infrastructure, tests may combine pure loader tests, esbuild metafile audits, and production smoke checks.

### Loader Tests

- concurrent first-use calls invoke the importer once;
- a resolved module is reused;
- a rejected import clears the cache and a later call retries;
- `isLoaded` and cleanup checks do not invoke the importer;
- callbacks registered before loading are attached once after resolution.

### Build and Static-Graph Tests

- a production main build still emits `dist/electron/main.mjs`;
- the build emits separate chunks for the selected optional features;
- the entry chunk has no static reachability to the optional heavy packages;
- MCP remains reachable through a lazy chunk and through its conditional auto-start call;
- packaging configuration includes all generated chunks;
- no value import of an optional runtime is reintroduced into the eager shell.

### Functional Smoke Matrix

On macOS, Windows, and Linux where the feature is supported, verify:

- normal launch, window, menu, tray, locale, and basic IPC;
- terminal create/write/resize/stop;
- capture initialization and teardown;
- SiteSucker setup/run/stop;
- static HTTP server start/stop;
- Markdown rendering with syntax highlighting;
- MCP disabled launch, first manual start, stop, and enabled automatic startup;
- GitHub user refresh, login, cancel, license fetch, add binding, delete binding, and logout;
- Nginx initialization with both existing and missing default configuration;
- platform-specific helper and privileged commands;
- application shutdown before and after each optional feature's first use.

### Memory Measurement

Use the same production build, machine, Electron version, app configuration, and initial page for before/after measurements. Disable service-task startup, launch the main window, wait ten seconds after it becomes ready, and record only the main process RSS. Run each build three times and compare medians. Also record renderer, GPU/helper, and fork RSS separately so moving work between processes is visible rather than misreported as total-memory savings.

After the idle measurement, invoke optional features one at a time and record main-process RSS and first-use latency. This confirms that deferred memory appears only after the corresponding feature is used and that latency remains within the accepted range.

## Acceptance Criteria

- Production launch and ten-second idle behavior remain functionally identical.
- All selected optional packages are absent from the eager main entry's static dependency graph.
- The optimized production build's median idle main-process RSS is lower than the current approximately 160 MB baseline, with the achieved value and delta reported.
- The measurement report distinguishes main-process RSS from total Electron and utility-process RSS.
- No optional feature is removed; every functional smoke path returns the same success/error semantics as before.
- First optional use adds no more than approximately 500 ms under normal local conditions, excluding network response time and user-driven OAuth time.
- MCP still starts automatically when configured and stays unloaded at idle when disabled.
- Automatic GitHub user/license refresh runs in the existing fork, while interactive OAuth remains available through a lazy main-process chunk.
- Application shutdown does not load unused optional chunks and leaves no loaded PTY, HTTP server, capture listener, crawler, OAuth callback server, or MCP server behind.
- Development restart and packaged ASAR builds resolve all main-process chunks successfully on supported platforms.

## Non-goals

- Replacing Electron or removing Chromium helper processes.
- Guaranteeing total FlyEnv memory below 50 MB.
- Rewriting renderer features or further changing locale-loading behavior.
- Broadly redesigning the fork bundle or every service module.
- Moving every native or Electron-owned API to a utility process.
- Changing existing renderer IPC command names or renderer-visible response formats.
- Unrelated dependency upgrades or general main-process refactoring.
