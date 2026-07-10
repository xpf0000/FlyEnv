# Static HTTP Server Add and Windows Drag-and-Drop Fix Design

## Goal

Restore the Static HTTP Server add button and ensure that FlyEnv instances started through the Windows auto-launch setting run at normal user integrity, allowing Explorer folder drag-and-drop.

## Confirmed Root Causes

1. `src/render/components/HttpServe/Index.vue` lost the add button click handler during its conversion to `<script setup>`. The child list still provides `choosePath()`, but the parent no longer calls it.
2. Windows auto-launch creates the `FlyEnvStartup` scheduled task with `schtasks /rl highest`. Explorer normally runs at medium integrity, so Windows UIPI blocks drag-and-drop into the elevated FlyEnv process before renderer drag events can fire.

The existing folder recognition and multi-folder drop logic is not the cause and will remain unchanged.

## Design

### Add Button

Keep the existing folder picker and server creation flow in `HttpServe/List.vue`. Add a typed component ref and click handler in `HttpServe/Index.vue` so clicking Add calls the child component's existing `choosePath()` method.

### Windows Auto-Launch Privilege

Keep the scheduled-task auto-launch mechanism. When creating the user-facing `FlyEnvStartup` task, use the limited run level so FlyEnv starts with the same normal-user integrity level as Explorer.

Tasks intended for the privileged FlyEnv helper must retain the highest run level. The Go helper implementation and the TypeScript PowerShell fallback must make the same task-name-based run-level decision.

Existing scheduled tasks will not be migrated automatically at application startup. Users with an existing elevated `FlyEnvStartup` task can disable and re-enable auto-launch to recreate it with the corrected run level.

## Error Handling and Compatibility

- Keep the existing dialog cancellation, directory validation, duplicate prevention, persistence, and automatic server start behavior.
- Keep support for dropping multiple folders.
- Preserve privileged run levels for helper task names.
- Preserve the current error reporting when scheduled-task creation fails.

## Verification

- Add a regression check that the Static HTTP Server add button remains connected to `choosePath()`.
- Add Go coverage for scheduled-task run-level selection.
- Extend the Windows helper fallback test to require a limited run level for `FlyEnvStartup` and a highest run level for helper tasks.
- Run targeted regression checks, Go tests, TypeScript/Vue type checking, and linting for the changed files.

## Out of Scope

- Reworking the existing folder drop parsing.
- Replacing scheduled tasks with registry login items.
- Automatically rewriting existing `FlyEnvStartup` tasks during application startup.
