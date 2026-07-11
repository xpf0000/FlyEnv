# Local Lifecycle Status Sync Protection

## Goal

Prevent delayed main-process service-status notifications from overwriting a renderer version object while that version is executing a local start or stop operation.

## Root Cause

`ModuleInstalledItem.start()` and `stop()` use `running=true` to mark a local lifecycle operation. The main process separately tracks registered service PIDs and broadcasts `service-status-changed` notifications.

During a stop, the renderer can set `run=false` before the main process removes the registered PID. A delayed notification still contains that PID, and `syncServiceStatusFromMcp()` currently overwrites the same object with `run=true`, `running=false`, and the old PID. The final stop response then restores `run=false`, producing the observed false-true-false sequence.

## Design

The fix has two layers:

1. `syncServiceStatusFromMcp()` skips any installed version whose `running` field is already `true`.
2. The main-process fork callback updates `ServiceProcessManager` and emits the resulting status notification before returning the lifecycle result to the renderer caller.

This keeps the local lifecycle operation authoritative for that version until its own renderer IPC callback completes. Versions that are not executing locally continue to accept main-process and MCP status updates normally.

The callback ordering is required because renderer completion changes `running` back to false. If a status notification created by the same lifecycle action is emitted after that completion response, the per-version guard can no longer identify it as an in-progress update.

The guard is per version rather than per module so a PHP module with multiple independently running PHP-FPM versions can still synchronize unaffected versions.

No state fields, timers, queues, or startup-group-specific exceptions will be added.

## Alternatives Considered

- Ignoring all status notifications while any version in a module is executing would prevent the race but unnecessarily blocks valid updates for other PHP-FPM versions.
- Delaying the renderer's `run=false` assignment until stop completion reduces one transition but does not stop status synchronization from clearing `running` or overwriting an in-progress start.
- Adding startup-group-local pending state would duplicate the global lifecycle state and would not fix the same race on module pages.
- Adding notification revisions could reject out-of-order messages, but it adds persistent ordering state when the lifecycle callback already has a natural causal order that can be corrected at its source.

## Error Behavior

If the local lifecycle operation fails, its existing callback remains responsible for the final `run`, `running`, and `pid` values. A later main-process notification can synchronize the version once `running` becomes false.

## Testing

Extend `scripts/mcp-render-status-sync-test.ts` with two regression cases:

- A locally stopping version with `running=true` must not be restored to `run=true` by a notification containing its old PID.
- A locally starting version with `running=true` must not have its execution state cleared by an empty notification.
- The main-process fork callback must update start/stop PID registration before sending the lifecycle result to the renderer.

Existing synchronization behavior for idle versions must remain unchanged.

Run the MCP renderer status test, startup-group regression, targeted ESLint, `vue-tsc --noEmit`, and `git diff --check`.

## Scope

The renderer synchronization function, the main-process fork callback ordering, and the dedicated test change. PID tracking data structures, module lifecycle implementations, and startup-group state ownership remain unchanged.
