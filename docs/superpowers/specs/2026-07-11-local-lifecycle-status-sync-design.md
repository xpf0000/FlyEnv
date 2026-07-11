# Versioned Service Status Synchronization

## Goal

Make renderer service state deterministic when lifecycle responses and service-status notifications arrive asynchronously or out of order from renderer, MCP, tray, or other main-process entry points.

## Problem

FlyEnv currently has two renderer state writers:

- A local lifecycle callback updates a version object's `run`, `running`, and `pid` fields.
- Main-process `service-status-changed` notifications update the same fields from `ServiceProcessManager`.

Changing the order in which the main process calls `sendCommandTo()` reduces one race but does not guarantee delivery order across asynchronous Electron IPC. A notification created by an earlier start can arrive after a later stop response and restore an obsolete PID.

The `running` guard is also insufficient. Once the local response sets `running=false`, a delayed older notification is indistinguishable from a current external update.

## Main-Process Status Revisions

`ServiceProcessManager` will maintain a monotonically increasing revision for each module flag.

Every mutation that can change visible service state increments the module revision and produces a complete snapshot:

```ts
type ServiceStatusItem = {
  flag: string
  revision: number
  running: boolean
  instances: RunningInstance[]
}
```

Affected mutations include:

- `addPid`
- `delPid`
- `delByBin`
- `delAll`

The mutation method returns the same snapshot that is broadcast to renderer listeners. The revision belongs to the module state, not to an individual IPC request.

## Lifecycle Responses

When renderer IPC starts or stops a service, `IPCHandler` will:

1. Apply the PID mutation to `ServiceProcessManager`.
2. Obtain the resulting versioned status snapshot.
3. Attach that snapshot to the lifecycle response sent to the renderer.

The normal `service-status-changed` broadcast remains enabled. The direct response and broadcast may arrive in any order, but they carry the same revision and snapshot.

MCP lifecycle methods continue calling `ServiceProcessManager` after fork success. Their mutations automatically produce versioned broadcasts; MCP protocol responses remain unchanged.

## Renderer Status Coordinator

Add a renderer-lifetime singleton coordinator. It stores, per module:

```ts
type PendingServiceStatus = {
  latestRevision: number
  latestSnapshot: ServiceStatusItem
}
```

This is ordering metadata, not a duplicate service-running state. It is not persisted and is independent of page component lifetime.

The coordinator follows these rules:

1. A snapshot with `revision` lower than or equal to the latest known revision is ignored.
2. A newer snapshot replaces the stored snapshot.
3. If the module has a locally executing installed version, the snapshot is retained but not applied yet.
4. When the local lifecycle callback completes, the coordinator stores the response snapshot, clears the local execution flag, and applies only the highest-revision snapshot.
5. If no local lifecycle operation is active, a new snapshot is applied immediately.

Snapshots update `run` and `pid`. External status synchronization must never set `running`; that field is owned exclusively by local lifecycle execution.

## Ordering Examples

### Late start notification after stop

```text
start snapshot revision 10: running instance PID 24528
stop snapshot revision 11: no instances

arrival: stop response 11 → start notification 10
result: apply 11, discard 10
```

### External MCP start during a local operation

```text
local stop response revision 11
MCP start notification revision 12

while local action is active: retain revision 12
after local completion: apply revision 12
```

The final UI state therefore follows the newest committed main-process state rather than the arrival order.

## Multi-Version Modules

Revisions are per module because each status notification is a complete module snapshot. For PHP/PHP-FPM, one revision can describe multiple running version instances. Applying a snapshot updates every idle installed version in that module consistently.

Local execution detection remains per installed version. A snapshot is deferred while any installed version in that module is performing a local lifecycle operation, then applied atomically after completion.

## Compatibility

Status payloads without a valid numeric revision are applied using the existing behavior for compatibility with initialization or older callers. Versioned lifecycle broadcasts and direct responses use the new coordinator path.

Services that do not return a trackable PID retain their existing direct lifecycle result behavior. The versioned snapshot path applies when `ServiceProcessManager` produces a committed status.

## Error Handling

If a local lifecycle request fails before a committed status snapshot exists, its existing error handling clears `running` and retains or restores the appropriate local state.

If a newer external snapshot was retained during the failed request, the coordinator applies that snapshot after local execution ends.

## Testing

Tests will cover:

- Per-module revisions increase on every PID mutation.
- Broadcast and direct lifecycle response use the same snapshot revision.
- Duplicate snapshots are idempotent.
- A lower revision arriving after a higher revision is ignored.
- A newer snapshot is deferred during local execution and applied afterward.
- Status synchronization never clears the local `running` flag.
- Renderer-originated start/stop and MCP-originated start/stop both update the UI.
- PHP multi-version snapshots update the correct installed versions.

Run dedicated status synchronization tests, startup-group regressions, main-process tests where available, targeted ESLint, `vue-tsc --noEmit`, and `git diff --check`.

## Scope

The change affects main-process service status metadata, renderer status coordination, lifecycle response metadata, and related tests. It does not change fork service commands, startup-group ordering, persisted module configuration, or MCP protocol response schemas.
