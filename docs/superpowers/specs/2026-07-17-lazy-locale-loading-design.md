# Lazy Locale Loading Design

## Goal

Reduce FlyEnv's idle memory use by removing eager loading of every built-in locale from the Electron main process, renderer processes, and utility-process forks. FlyEnv must continue to support immediate language switching without restarting the application, including the main window, modern and classic tray UI, system dialogs, active forks, and custom locales.

The optimized runtime will keep only the English fallback, the active locale, and in-flight locale loads in memory. A successful switch must update all relevant processes while preserving the existing synchronous `I18nT()` call sites.

## Evidence and Baseline

The current `src/lang/index.ts` statically imports every built-in locale and combines them into one `messages` object before creating the Vue I18n instance. The same module is reachable from the main process, renderer, tray renderer, and fork entry point. `src/lang/render.ts` also statically imports every supported Element Plus locale.

A production-style Node/V8 microbenchmark compared an empty Vue I18n instance, one built-in locale, and all built-in locales. Each scenario ran in nine fresh processes with forced garbage collection; the median results were:

| Scenario | RSS | Heap used | Bundled locale code |
| --- | ---: | ---: | ---: |
| Vue I18n baseline | 61.31 MiB | 7.52 MiB | 397 B |
| Chinese only | 61.86 MiB | 8.04 MiB | 138 KiB |
| All built-in locales | 104.22 MiB | 18.62 MiB | 5.22 MiB |

Loading every locale therefore added about 42.36 MiB RSS compared with one locale in the isolated benchmark. Electron will not reproduce the exact number, but the result establishes eager locale loading as a material source of idle memory use.

## Compatibility Requirements

- Language changes take effect immediately without an application restart.
- Existing `I18nT()` consumers remain synchronous and do not require broad call-site rewrites.
- FlyEnv translations, Element Plus translations, tray UI, system menus and dialogs, and fork-generated messages use the same effective locale.
- English remains the fallback locale.
- Built-in and custom locales remain supported.
- A failed switch leaves the previous locale fully active and does not persist a partial change.
- Existing language keys and source JSON files remain the translation source of truth.

## Non-Goals

- Replacing Vue I18n.
- Redesigning translation keys or rewriting translated content.
- Optimizing unrelated Electron, Monaco, terminal, MCP, or Markdown memory use.
- Keeping an unbounded in-memory locale cache to make repeated switching marginally faster.
- Changing the visible language picker except for its loading and failure behavior.

## Considered Approaches

### Independent locale assets with a main-process coordinator

Generate one external JSON asset per built-in locale. The main process loads and validates the requested asset, applies it locally, and distributes the payload to renderer and fork runtimes. This keeps locale payloads out of the main and fork JavaScript entry bundles and avoids changing their current single-file esbuild layout.

This is the selected approach because it gives the strongest and most predictable memory reduction while keeping packaging changes narrow.

### Dynamic imports with esbuild code splitting

Use explicit loader functions such as `() => import('./zh')` in every process. Vite can split renderer locales naturally, but the main and fork builds currently use a single `outfile`. They would need separate `outdir`, `splitting`, and chunk-location rules, with additional electron-builder coverage for both entry graphs.

This approach is valid but introduces more build and release risk than the selected asset-based design.

### Lazy initialization inside the existing bundles

Keep all locale source in `main.mjs` and defer only object creation. This is the smallest code change, but V8 must still load and parse the large entry file, and the full locale payload remains bundled into every applicable process. It cannot reliably deliver the measured memory reduction and is rejected.

## Architecture

The design separates locale metadata, resource loading, runtime installation, and cross-process coordination.

```text
generated static/lang/<locale>.json
                 |
                 v
       Main LanguageRepository
                 |
                 v
       Main LanguageCoordinator
          /          |          \
         v           v           v
 Main runtime   Renderer/Tray   Fork runtimes
```

### Language catalog

`src/lang/catalog.ts` contains only lightweight metadata:

- supported built-in locale codes;
- display names used by the picker;
- the English fallback constant;
- manifest types and locale normalization helpers.

It does not import any translation payload. Existing `AppAllLang` consumers will receive the same metadata through a compatibility export.

### Language runtime

`src/lang/runtime.ts` owns the Vue I18n instance and synchronous translation API. It provides explicit operations to install messages, activate a previously installed locale, release an inactive locale's message payload, and inspect the active locale.

`I18nT()` remains synchronous. `AppI18n()` becomes a compatibility getter for the instance and no longer performs implicit loading when passed a locale. The small number of `AppI18n(locale)` initialization and switching call sites will move to the asynchronous language services.

Each runtime retains only:

- English;
- the active locale when it is not English;
- custom messages for the active custom locale;
- a shared Promise for each currently loading locale.

After a successful switch, the previous non-English locale is released by replacing its messages with an empty object through `setLocaleMessage(previousLocale, {})`. Vue I18n 11 does not expose a public locale-removal API; replacing the payload releases the large message graph while leaving only a negligible empty locale entry.

### Generated language assets

`scripts/build-language-assets.ts` aggregates each `src/lang/<locale>/*.json` directory into one JSON object and writes:

```text
dist/electron/static/lang/
├── manifest.json
├── en.json
├── zh.json
├── de.json
└── ...
```

The manifest includes the supported code, asset filename, and a format version. The generator validates every input file and fails the build for duplicate namespaces, invalid JSON, unsupported directory names, or a missing English fallback.

Development and production builds run the same generator. Locale assets are normal packaged resources and are not bundled into `main.mjs`, `fork.mjs`, or the initial renderer JavaScript.

### Main LanguageRepository

`src/main/core/LanguageRepository.ts` reads generated built-in assets and custom locale files. It:

- accepts only locale codes present in the generated manifest or validated custom-locale metadata;
- resolves custom paths beneath the configured custom-language root and rejects traversal;
- validates the loaded payload shape;
- deduplicates concurrent reads with an in-flight Promise map;
- caches only English and the active locale;
- exposes metadata without loading locale payloads.

The repository returns structured failures that distinguish an unsupported locale, missing asset, invalid JSON, invalid payload, and unsafe custom path.

### Main LanguageCoordinator

`src/main/core/LanguageCoordinator.ts` owns the language-switch transaction. It depends on the repository, configuration manager, main runtime, tray manager, window manager, and fork manager through narrow interfaces.

It supports two operations:

1. **Prepare** loads and validates the target FlyEnv messages without changing runtime state or configuration.
2. **Commit** installs the prepared messages, activates the locale, persists it, refreshes native UI, and distributes the change.

Prepared results receive a short-lived opaque token. Commit accepts only a current token for the requested locale. This prevents an older asynchronous request from overwriting a newer selection.

### Renderer language service

`src/render/core/LanguageService.ts` coordinates renderer work. During preparation it requests the FlyEnv payload from the main coordinator and dynamically imports only the selected Element Plus locale. Element Plus falls back to English when it has no matching locale.

The renderer does not update its visible locale until preparation and main-process commit succeed. Once committed, it installs the returned messages, activates the locale, updates the Element Plus locale, and replaces the previous non-English messages with an empty object.

### Tray and fork runtimes

The modern tray renderer receives the same locale-change protocol as the main renderer and installs the supplied English/current payload before switching. The classic native tray menu is rebuilt after the main runtime commits.

`ForkManager` broadcasts a typed locale-change message to every live utility process. The fork entry point installs the payload before acknowledging the update. A newly created or restarted fork receives the current locale and messages as part of its initialization message before `BaseManager.init()`.

An unresponsive fork does not roll back a successful UI switch. The coordinator records the failed acknowledgement, updates the authoritative `global.Server` state, and ensures the latest locale is sent again before the fork's next command.

## Startup Flow

The Electron main startup becomes explicitly asynchronous:

1. Create the configuration manager without language side effects.
2. Read and normalize `setup.lang`.
3. Load English and the configured locale through the repository.
4. If the configured locale fails, activate English and retain the original stored value for diagnostics.
5. Initialize the main runtime.
6. Construct menus, tray management, IPC handlers, windows, and remaining application services.

The renderer continues waiting for `APP-Ready-To-Show`, then:

1. Loads application configuration.
2. Receives or requests English and the effective current locale.
3. Dynamically loads the matching Element Plus locale.
4. Installs the messages.
5. Mounts Vue only after language setup completes.

This prevents untranslated-key flashes during initial rendering.

Forks install the messages included in their first `Server` initialization message before initializing their command manager.

## Immediate Switch Flow

1. The language picker disables itself and assigns a monotonically increasing request ID.
2. In parallel, the renderer requests a prepared FlyEnv payload and loads the Element Plus locale.
3. A stale request ID cannot proceed to commit.
4. The renderer sends the prepared token to the main coordinator.
5. The coordinator installs and activates the main messages, updates `global.Server.Lang`, persists `setup.lang`, and refreshes native menus.
6. The coordinator notifies the modern tray and live forks and returns the validated payload to the requesting renderer.
7. The renderer installs and activates the locale, updates Element Plus, and replaces the previous non-English messages with an empty object.
8. The picker re-enables after the transaction resolves.

Language switching is removed from `ConfigManager.setConfig()`. Saving proxy, theme, window position, license, or other preferences must not trigger i18n work.

## Custom Locales

Custom-locale discovery and payload loading are separated:

- Startup does not enumerate and parse every custom locale.
- Opening or refreshing the language picker reads only custom `index.json` metadata.
- Selecting a custom locale loads that locale's namespace JSON files on demand.
- If the configured startup locale is custom, only its metadata and payload are loaded.
- A custom locale cannot shadow a built-in locale code.
- Invalid custom content remains isolated and does not modify the active runtime.

The existing action that initializes editable custom-language files continues to use English or Chinese templates, but those template payloads are loaded only when the action is invoked.

## Failure Handling

- **Missing or corrupt startup locale:** Start in English, log the structured error, and show one notification after the renderer is ready. Do not overwrite the stored preference automatically.
- **Failed switch preparation:** Keep the previous locale active, do not persist or broadcast, and return a localized error to the picker.
- **Missing translation key:** Use the English fallback. If English also lacks the key, return the key and rate-limit diagnostic logging.
- **Rapid selection changes:** Only the latest request ID and unexpired preparation token can commit.
- **Duplicate requests:** Reuse the in-flight Promise for the locale.
- **Element Plus mismatch:** Use Element Plus English while still switching FlyEnv messages successfully.
- **Tray notification failure:** Re-send the authoritative locale when the tray renderer next synchronizes its store.
- **Fork acknowledgement failure:** Log the failure without rolling back the UI, and re-send the latest initialization state before the next command.
- **Unsafe custom path:** Reject it before filesystem access and retain the previous locale.

## File-Level Changes

New files:

- `src/lang/catalog.ts`
- `src/lang/runtime.ts`
- `src/shared/LanguageProtocol.ts`
- `src/main/core/LanguageRepository.ts`
- `src/main/core/LanguageCoordinator.ts`
- `src/render/core/LanguageService.ts`
- `src/fork/LanguageService.ts`
- `scripts/build-language-assets.ts`

Primary modified files:

- `src/lang/index.ts`
- `src/lang/render.ts`
- `src/main/Launcher.ts`
- `src/main/Application.ts`
- `src/main/core/ConfigManager.ts`
- `src/main/core/IPCHandler.ts`
- `src/main/core/ForkManager.ts`
- `src/main/core/CustomerLang.ts`
- `src/main/core/AppNodeFn.ts`
- `src/fork/index.ts`
- `src/render/main.ts`
- `src/render/tray.main.ts`
- `src/render/core/VueExtend.ts`
- `src/render/components/Setup/LangSet/index.vue`
- `src/render/util/NodeFn.ts`
- the development and production build orchestration that prepares static assets.

## Testing Strategy

### Asset generation

- Generate one asset for every built-in catalog locale.
- Verify that the manifest and source directories match exactly.
- Parse and validate every generated asset.
- Fail for missing English, malformed JSON, duplicate namespaces, or unsupported directory names.
- Confirm that generated assets retain the same namespace structure as the current imports.

### Repository and runtime

- Load only English and the selected locale at startup.
- Reuse one file read for concurrent requests for the same locale.
- Reject unsupported locale codes and path traversal attempts.
- Preserve the old active locale when loading or validation fails.
- Replace a previous non-English locale's messages with an empty object after a successful switch and verify that the old payload is no longer reachable.
- Fall back to English for a missing key.
- Keep synchronous `I18nT()` behavior after asynchronous initialization.

### Coordinator and protocol

- Preparation must not mutate configuration or runtime state.
- Commit must reject stale, expired, mismatched, or already-used tokens.
- A successful commit must update main, renderer, tray, and fork protocol state.
- Rapid requests must allow only the newest selection to commit.
- Saving unrelated preferences must not load or switch locales.
- A failed fork or tray acknowledgement must not corrupt the authoritative locale.
- A newly spawned fork must receive the latest locale before its first command.

### Custom locales

- Listing custom locales reads metadata only.
- Selecting a custom locale loads only that locale's payload.
- A missing or corrupt custom locale leaves the current locale active.
- Custom locale paths cannot escape their configured root.
- Custom locale codes cannot shadow built-in codes.

### Cross-platform behavior

On Windows, macOS, and Linux, verify:

- startup has no untranslated-key flash;
- built-in and custom switching works without restart;
- FlyEnv, Element Plus, modern tray, classic tray, native dialogs, and fork messages agree;
- restarting restores the last successfully committed locale;
- packaged builds can locate locale assets inside the application resources.

## Performance Acceptance

- The isolated English-plus-current-locale benchmark must not exceed 66 MiB median RSS in the current test environment, compared with 104.22 MiB for all locales; 63–66 MiB is expected.
- The locale microbenchmark must improve by at least 35 MiB RSS, with approximately 40 MiB expected.
- The complete idle Electron main process must improve by at least 25 MiB relative to the same-machine baseline, with 30–45 MiB expected from this change.
- Switching through ten locales and returning to the initial locale must leave settled RSS within 5 MiB of the first optimized startup measurement.
- Built-in locale switching must complete within 300 ms at the 95th percentile on local packaged assets.
- `main.mjs`, `fork.mjs`, and initial renderer entry chunks must not contain all built-in locale payloads.
- Initial display must not regress perceptibly because of locale loading; language installation completes before the first Vue mount.

All memory measurements use release builds, identical application state, the same machine and operating system, a fixed idle settling interval, multiple fresh runs, and median values. Process type and RSS/private-memory metric must be recorded with the result.

## Delivery Sequence

1. Preserve the current microbenchmark and add behavioral regression tests.
2. Generate and validate independent locale assets and the catalog manifest.
3. Introduce the lightweight runtime and main repository.
4. Make main startup asynchronous and confirm the main-process memory change.
5. Add renderer and Element Plus lazy loading.
6. Add tray, fork, and custom-locale coordination.
7. Remove eager locale imports and `ConfigManager` language side effects.
8. Run focused tests, production builds, cross-platform smoke tests, and final memory comparisons.
