# Vite Lazy-Locale Dependency Optimization Design

## Problem

FlyEnv's renderer now loads Element Plus locale modules on demand. During an existing Vite development session, the page initially loaded Vue and Pinia from dependency-optimizer browser hash `df9e442c`. Vite later discovered additional locale imports, rebuilt its optimized dependencies with hash `fb46f46f`, and served subsequently loaded async sidebar components against the new dependency graph.

The mounted application therefore used the old Vue runtime while lazy sidebar chunks used the new Pinia and Vue runtime. Pinia could not see the component injection context, producing `getActivePinia()` errors. The same runtime split caused the subsequent `resolveComponent`, virtual-DOM `el`, and setup errors. Reloading after dependency optimization completed made every runtime use `fb46f46f` and eliminated all four error classes.

This is a Vite development dependency-discovery problem. The production Rollup build and the application-level locale prepare/commit protocol are not the source of the failure.

## Requirements

- Vite must know every statically supported Element Plus locale module before the renderer starts loading application chunks.
- Built-in Element Plus locales must remain browser-runtime lazy; selecting one locale must not fetch or retain every locale.
- Production locale chunks and the main/fork locale payload separation must remain unchanged.
- Adding or removing an Element Plus locale loader without updating the Vite optimization list must fail an automated test.
- The fix must not modify component stores or add defensive `setActivePinia()` calls that mask the split-runtime root cause.

## Selected Approach

Create a small configuration-only module exporting the complete list of Element Plus locale module identifiers. Add that list to `optimizeDeps.include` in the shared Vite configuration used by development servers.

Vite will prebundle those modules to its development disk cache at server startup. This does not import them into the renderer or keep them in renderer memory: `src/lang/render.ts` retains its explicit dynamic imports, and the browser fetches only the selected locale. Production builds ignore dependency optimization and continue using the existing `element-plus-locale-*` manual chunks.

The module list is intentionally separate from `src/lang/render.ts`. Importing the renderer loader from Vite's Node-side configuration would execute browser-oriented Element Plus imports while loading the build configuration. Static dynamic-import specifiers also cannot be generated from a runtime string without weakening Vite's analysis. An automated parity test will keep the two declarative lists synchronized.

## Alternatives Rejected

### Clear the Vite cache only

Deleting `node_modules/.vite` or using a forced restart repairs the current session, but it provides no regression protection when locale loaders change again or a developer switches between branches with different dependency graphs.

### Exclude locale modules from dependency optimization

`optimizeDeps.exclude` would avoid optimizer hash changes for the locale modules, but every locale would be served as an unoptimized dependency graph in development. That adds requests and startup work and gives up the compatibility benefits of Vite's dependency optimizer.

### Restore an eager `AppStore()` call or force active Pinia

The removed `AppStore()` call is not the root cause. `app.use(pinia)` correctly installs Pinia, and a clean single-runtime reload works without the eager call. Forcing a global Pinia would conceal the duplicate Vue context while leaving `resolveComponent` and virtual-DOM failures intact.

## Files and Data Flow

- `configs/element-plus-locales.ts` exports an immutable array of supported bare module identifiers.
- `configs/vite.config.ts` assigns that array to `optimizeDeps.include`.
- `src/lang/render.ts` keeps the current static English import and explicit dynamic locale loaders.
- `scripts/language-vite-optimize-test.ts` extracts all Element Plus locale imports from `src/lang/render.ts`, compares the unique sorted identifiers with the configuration array, and verifies there are no missing or stale entries.
- `package.json` exposes the focused test and adds it to `test:language-lazy`.

At development startup, Vite prebundles the declared modules under one browser hash. The renderer loads Vue, Pinia, and the selected Element Plus locale from that stable dependency graph. Later async sidebar imports therefore retain the original application injection context.

## Testing

TDD will begin with the parity test. It must fail against the current configuration because no explicit locale optimization list exists. The smallest implementation will then add the configuration module and wire it into Vite.

Verification will include:

- the focused locale optimization parity test;
- the complete `test:language-lazy` suite;
- the locale memory benchmark, confirming runtime lazy-loading thresholds remain satisfied;
- `vue-tsc --noEmit` and focused ESLint;
- a production renderer build and bundle audit;
- a clean development reload with one Vue hash and one Pinia hash, a mounted main UI, and no captured `getActivePinia`, `resolveComponent`, virtual-DOM `el`, or component setup errors.

## Acceptance Criteria

- All Element Plus locale imports in `src/lang/render.ts` exactly match the Vite optimization list.
- Vite does not change its optimized-dependency browser hash when the active locale or an async sidebar component first loads.
- The development main window mounts successfully without the reported error chain.
- Production still emits independent `element-plus-locale-*` chunks and passes the language bundle audit.
- The optimized locale memory benchmark stays within its existing RSS and heap limits.

## Non-goals

- Refactoring FlyEnv's shared Pinia instance or store access conventions.
- Changing the renderer language-switch transaction.
- Loading every locale into renderer memory.
- Fixing unrelated pre-existing lint warnings.
