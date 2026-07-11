# Startup Group Switch Stability

## Goal

Prevent startup-group header and member switches from visually changing state more than once while a service start or stop operation begins.

## Root Cause

The switches currently use Element Plus `change` events with a controlled `model-value` derived from global version or project state.

When a user clicks a running member switch to stop it:

1. Element Plus changes its internal checked state to stopped and emits `change`.
2. The startup-group runner immediately enters its executing state and triggers a Vue render.
3. The runner has not yet completed member resolution and called the target's `stop()`, so the global `run` state is still true.
4. The controlled `model-value` restores the switch to running.
5. The target begins stopping and updates its global state, so the switch changes to stopped again.

The same timing applies to the group header switch. This is a UI control synchronization problem; the service is not actually restarting.

## Design

Both startup-group switches will use Element Plus `before-change` instead of `change`.

The hook will:

- Derive the requested action by negating the current global running state.
- Emit the existing `group-change` or `member-change` event.
- Return `false` so Element Plus does not mutate its own internal checked state.

The existing parent handlers remain responsible for running the operation and displaying its result. The switch value continues to come only from `StartupGroupSetup.isGroupRunning` or `StartupGroupSetup.isMemberRunning`.

The existing `busy`, group-executing, and member-invalid conditions continue to disable switches while actions cannot be accepted.

## State Ownership

No local pending state, requested-value map, composable, or store field will be added. Version and project service objects remain the only source of running state, and the startup-group runner remains the only source of execution state.

## Error Behavior

Because Element Plus is prevented from changing its internal state, a rejected or failed operation leaves the switch showing the unchanged global state. Existing success and error messages remain unchanged.

## Testing

Update the startup-group regression script before the component change so it fails against the current `change` handlers. The source assertions will require:

- The group header switch uses `before-change`.
- Member switches use `before-change`.
- The component no longer binds `change` for these controls.
- Group and member hooks emit the inverse of the current global running state.
- Both hooks return `false` to prevent Element Plus internal mutation.

After implementation, run the startup-group regression script, targeted ESLint, `vue-tsc --noEmit`, and `git diff --check`.

## Scope

This change affects only the two switches in `GroupCard.vue`. It does not change startup-group ordering, service lifecycle implementations, global state structures, result messages, or configuration persistence.
