# Tray Startup Groups Design

## Goal

Show every saved startup group in both FlyEnv tray menu styles and allow each group to be started or stopped directly from the tray.

The existing top-level tray power control remains unchanged. It continues to use the same routing as the main window: when the Startup Group module is visible and has a valid default group, it toggles that default group; otherwise it uses the legacy all-services action.

## Scope

- Add every saved startup group to the modern Vue tray window and the classic Electron native menu.
- Place startup groups above individual services and separate the two sections visually.
- Toggle a startup group using the same state and execution rules as its main-window group card.
- Keep the top-level tray power control and all existing individual service controls.
- Do not move startup-group storage or runtime execution into the main process or tray renderer.

## Architecture

The main renderer remains the only owner of `StartupGroupManager`, saved startup-group data, resolved service/project targets, and execution state. It extends the existing tray state snapshot with a lightweight `startupGroups` collection.

Each tray startup-group item contains only presentation and routing state:

- `id`: stable startup-group identifier used by the command route.
- `name`: saved group name shown in the tray.
- `color`: saved group color for the modern tray indicator.
- `run`: true when at least one group member is running.
- `running`: true while the group is executing.
- `disabled`: true while startup-group sources or execution are busy, or when the group is empty.

All saved groups are included in persisted order. Empty groups remain visible to satisfy the all-saved-groups requirement, but their controls are disabled.

The snapshot continues through the existing `APP:Tray-Store-Sync` path. The classic menu reads it from `TrayManager.status`; the modern window receives the same object in its Pinia store. The tray does not read `flyenv-startup-groups` storage directly and does not construct a second startup-group runtime.

## Layout

Both tray styles use the same section order:

1. Existing top-level power control.
2. Saved startup groups.
3. A separator between startup groups and individual services when both sections are present.
4. Existing individual service controls.
5. Existing show-main-window and exit actions.

The existing separation around the top-level control and bottom actions remains. Conditional section separators avoid blank or duplicate separators when either startup groups or services are absent.

The modern tray displays the saved group color alongside its name and uses the existing switch behavior. The classic menu uses the existing running/stopped native icons and the group name. Startup groups are not merged into the service collection, so their command and disabled-state semantics remain explicit.

## Interaction and Command Flow

Selecting a startup group sends a new `startupGroupDo` tray command with the group ID.

For the classic tray:

1. `TrayManager` emits `action`, `startupGroupDo`, and the group ID.
2. `Application` forwards the command to the main renderer through `APP:Tray-Command`.

For the modern tray:

1. The group item sends `APP:Tray-Command`, `startupGroupDo`, and the group ID through the existing IPC handler.
2. The main process forwards the command unchanged to the main renderer.

The main renderer resolves the current group by ID at execution time. It does not trust copied tray state to decide the action. It uses the live `StartupGroupManager` state and applies the same main-card rule:

- If any group member is running, stop the group.
- Otherwise, start the group.

Execution reuses `StartupGroupManager.setGroupEnabled`, including the global busy guard, sequential start order, reverse stop order, invalid-member outcomes, and result reporting. A missing group ID is ignored safely because the group may have been deleted after the tray snapshot was produced.

## State Synchronization

The tray startup-group snapshot is derived from the reactive saved groups, resolved member state, manager loading state, runner execution state, and runner revision. Existing startup-group source loading and periodic state refresh remain responsible for keeping the resolved targets current.

When execution begins or ends, or a member state changes, the existing deep tray-state watcher sends a new snapshot. Both tray styles then show the current running, loading, and disabled state.

The application tray icon and top-level power state keep their current semantics. This feature does not redefine them as an aggregate of every saved startup group.

## Error Handling

- An empty startup group is visible but disabled.
- A deleted or unknown group ID produces no action.
- A stale click received while the manager is busy is rejected by the existing manager guard.
- Start and stop failures use the existing startup-group result formatting and main-renderer notifications.
- Source-loading or member-resolution failures preserve the existing invalid-member behavior.
- IPC forwarding remains fire-and-forget, matching current tray service and top-level actions.

## Testing

Focused regression coverage will verify:

- The tray snapshot includes all saved groups in saved order.
- Running, executing, busy, and empty-group states map to the expected tray flags.
- Startup groups remain a distinct section above services in modern and classic tray styles.
- Separators are conditional when a section is empty.
- Both tray styles send `startupGroupDo` with the selected group ID.
- The main renderer resolves the group by ID and applies the same toggle semantics as the group card.
- The existing top-level power control and individual service commands remain unchanged.

Verification will include the focused startup-group test suite, tray-related source-contract coverage, ESLint for changed files, and `vue-tsc --noEmit`.
