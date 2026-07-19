# Main Process Resource Paths Design

## Goal

Fix the packaged screenshot window's `ERR_FILE_NOT_FOUND` failure and remove the same output-directory coupling from every main-process application resource path. Main-process code splitting must be free to move a module between `dist/electron/main.mjs` and `dist/electron/chunks/*.mjs` without changing which packaged resource that module opens.

## Confirmed Cause

The renderer build and Electron package are correct: the installed archive contains `dist/render/capturer/capturer.html`. The screenshot runtime nevertheless requests `dist/electron/render/capturer/capturer.html`.

`src/main/core/Capturer.ts` derives its renderer path from `dirname(fileURLToPath(import.meta.url))`. This worked while the source was bundled into `dist/electron/main.mjs`, because `../render` resolved to `dist/render`. After optional main-process runtimes became dynamic imports, esbuild emitted Capturer as `dist/electron/chunks/Capturer-*.mjs`; the same expression now resolves `../render` to `dist/electron/render`.

Both `configs/esbuild.config.ts` and `configs/esbuild.config.win.ts` use the same `chunks/[name]-[hash]` layout, so the defect applies to macOS, Linux, and Windows packages.

## Audit Result

The complete main-process source and generated chunks contain one currently broken resource lookup:

- `src/main/core/Capturer.ts`: packaged screenshot HTML.

They also contain one dormant lookup that would break if its module became a chunk:

- `src/main/core/UpdateManager.ts`: development `app-update.yml`. This module is currently not imported, but its resource lookup has the same output-location assumption.

The following lookups currently remain in the entry bundle and therefore still work, but are coupled to that placement:

- `src/main/configs/page.ts`: main and tray renderer HTML;
- `src/main/Application.ts`: `fork.mjs`;
- `src/main/index.ts`: `dist/electron/static`.

Other dynamically loaded main-process chunks were inspected. They use user-data paths, temporary paths, `global.Server` paths, or explicit input paths and do not derive packaged resources from their generated module directory.

## Stable Resource Path API

Add a small main-process resource-path utility rooted at Electron's `app.getAppPath()`. In development this is the project/package root; in a packaged application it is the application archive root. It is independent of the location of the calling JavaScript file.

Keep path composition testable without starting Electron: pure resolver functions accept an application root, while runtime wrappers supply `app.getAppPath()`. Call sites use the runtime wrappers and cannot substitute a module directory as the root.

The utility exposes explicit path families:

- application-root resources, such as `app-update.yml`;
- main-process resources under `dist/electron`, such as `fork.mjs` and `static`;
- renderer resources under `dist/render`, such as `index.html`, `tray.html`, and `capturer/capturer.html`.

Callers provide only path segments below the appropriate family. No caller reaches from one output tree to another with `../`, and no application resource is based on `import.meta.url` or a module-local `__dirname`.

Migrate all five audited locations to this API. Preserve the existing Windows normalization applied when assigning `global.__static`.

## Screenshot Window Loading

Development continues to load the Vite URL `/capturer/capturer.html`. Production loads the renderer path returned by the stable resource-path API.

Attach an actual rejection handler to both load operations. The current `.catch()` call has no callback, so it creates another rejected promise and produces `UnhandledPromiseRejectionWarning`. On a load failure, the handler will:

- mark the capture session as stopped;
- destroy and clear the failed screenshot window;
- display the existing localized screenshot failure dialog with the underlying load error;
- consume the rejection so the Electron main process does not report an unhandled promise.

The successful `ready-to-show` flow and screenshot behavior remain unchanged.

## Testing

Add a focused main-process resource-path regression test and include it in the existing `test:main-lazy` suite.

The test will verify:

- application, Electron-output, and renderer-output paths resolve from a supplied application root to the expected platform-normalized locations;
- Capturer remains in a dynamic chunk in the esbuild fixture, proving the test covers the layout that caused the failure;
- audited main-process application resources use the stable path API rather than module-local `import.meta.url` or `__dirname`;
- the screenshot renderer entry remains `capturer/capturer.html` in Vite's production input and all three Electron Builder configurations include `dist/render/**/*` and `dist/electron/**/*`;
- screenshot page loading has a real rejection handler and cleanup path rather than `.catch()` with no callback.

Run the focused test first in a failing state, implement the smallest resource-path change, then run the complete main lazy-loading suite. Finally build the main process and renderer and confirm that the generated Capturer chunk refers to the application-root renderer location while `dist/render/capturer/capturer.html` exists.

## Out of Scope

- Changing the esbuild chunk directory or disabling main-process splitting.
- Changing Vite's renderer entry layout.
- Refactoring user-data, server, temporary, or helper paths that already use stable explicit roots.
- Auditing unrelated fire-and-forget promises outside BrowserWindow page loading.
- Changing screenshot capture, selection, editing, or saving behavior.
