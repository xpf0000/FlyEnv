# Remove Exact Target Service Control

## Goal

Startup groups only orchestrate member order. Service versions must keep using the existing module-level start and stop behavior instead of a separate exact-target process-control path.

## Current Problem

Startup-group service starts pass `updateCurrent: false`, `stopOtherVersions: false`, and `exactTarget: true`. This bypasses the established module behavior that selects the requested version, stops other running versions when the module permits only one instance, and then starts the selected version.

The stop-side exact-target path is no longer called by production code, but its renderer types, IPC handlers, fork implementation, module-specific graceful-stop hooks, process helpers, and assertions remain.

Maintaining both paths creates different behavior between a normal module action and the same action initiated by a startup group. It also caused service-specific lifecycle problems for modules such as MySQL and PHP-FPM.

## Design

### Startup-group runtime

The service adapter will call the selected installed version directly:

- Start: `target.start()`
- Stop: `target.stop()`

The startup-group runner remains responsible only for forward sequential start and reverse sequential stop. It will continue to use each target's returned result to decide whether the member succeeded.

For modules where only one version may run, starting a later version in the group will stop the previously running version through the existing `Module.onItemStart` behavior. This is intentional and matches actions initiated from the module page.

### Renderer module API

Remove the startup-group-specific option APIs:

- `ModuleStartOptions`
- `ModuleStopOptions`
- `updateCurrent`
- `stopOtherVersions`
- `exactTarget`

`ModuleInstalledItem.start()` and `_onStart` return to their option-free API. `Module.onItemStart` always applies the module's native current-version update and stop-other-versions behavior.

`ModuleInstalledItem.stop()` returns to the normal module stop IPC path and keeps the existing public result contract.

### Fork service API

Remove the alternate exact-target IPC path:

- `startServiceExact`
- `stopServiceExact`
- `_stopServerExactGracefully`
- Module-specific `_stopServerExactGracefully` overrides

Normal `startService` and `stopService` remain the only service lifecycle entry points.

Process utilities introduced solely for exact-target stopping will be removed only when repository-wide search confirms they have no remaining callers. Shared utilities still used by normal process management will remain.

## Error and State Behavior

Startup groups will rely on the same renderer and fork result behavior as module-page actions. No startup-group timeout or alternate success inference will be introduced.

The selected version's existing `run` and `running` state remains the source of truth. Removing exact-target control also removes its separate state rollback branch.

## Testing

Update the startup-group regression script before production changes so it fails while exact-target APIs still exist. The tests will require:

- Startup-group version start calls `target.start()` without options.
- Startup-group version stop calls `target.stop()` without options.
- Renderer source no longer declares or dispatches exact-target lifecycle APIs.
- Fork source no longer exposes exact-target lifecycle APIs or graceful-stop hooks.
- Module-specific exact-target overrides are absent.
- Any exact-target-only process helpers are absent when unused.

After implementation, run the startup-group test script, targeted ESLint, TypeScript checking, and `git diff --check`.

## Scope

This change does not alter startup-group ordering, group configuration, project-service behavior, or individual module start/stop implementations. It removes only the parallel exact-target lifecycle path and restores normal module semantics for startup-group service versions.
