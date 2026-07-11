# Startup Group Card Live Status Controls Design

## Goal

Redesign each Startup Group card so the group and its individual members can be controlled with switches, while all displayed runtime state comes directly from the existing global service-version and language-project objects.

## State Ownership

- Add an independent `StartupGroupManager` class outside the page component.
- Export one module-level singleton as `StartupGroupSetup = reactiveBind(new StartupGroupManager())`, following existing FlyEnv setup/store patterns.
- The manager must not maintain a second member-state map, running-count map, polling timer, or cached runtime status.
- A service-version member resolves to its live `ModuleInstalledItem` in `BrewStore` by normalized module and `versionPath`.
- A language-project member resolves to its live project object in `ProjectSetup` by module, project ID, and saved project path.
- Service-version state is derived directly from `target.run` and `target.running`.
- Language-project state is derived directly from `target.state.isRun` and `target.state.running`.
- A member that cannot resolve to its live target is invalid.
- The existing runner's `executing` value remains an operation/serialization lock. It is not treated as a copy of service runtime state.
- Because the resolved targets belong to global reactive stores, destroying and recreating the Startup Group page does not reset or stale their displayed state.

## Manager Responsibilities

The independent reactive class singleton provides a single adapter layer for Startup Group UI consumers:

- Ensure the global module-installed and language-project collections required by configured groups have been loaded through their existing fetch methods.
- Resolve a saved `StartupGroupItem` to its live global target.
- Produce derived member presentation data: key, type, title, optional path, running state, executing state, invalid state, and switch-disabled state.
- Derive group state from live members. The group is on when at least one valid member is running.
- Execute a full group start or stop through the existing runner.
- Execute one member by running the existing runner with a temporary one-member group payload.
- Expose the existing global runner busy state so all switches are disabled for the duration of any Startup Group operation.
- Preserve the existing result aggregation and error-message behavior.

The manager resolves and returns references to the existing reactive targets rather than snapshots of their status fields. The page component only obtains groups from the configuration store, asks `StartupGroupSetup` to ensure their global source collections are loaded, consumes derived live member data, and dispatches edit, delete, default-selection, and switch events. Loading the source collections does not copy their runtime state into the manager.

## Card Layout

### Header

- Keep the group color, name, and optional description on the left.
- Replace the status tag with an Element Plus switch on the right.
- The switch is on when any member's live state is running.
- Switching an on or partially running group off stops every member in the group.
- Switching a fully stopped group on starts every member in configured order.
- The switch is disabled while the runner is executing, including startup and shutdown operations.

### Member Area

- Replace the existing member tag summary with one compact card/row for every configured member.
- A service-version member displays its live version value, falling back to the saved binary name when necessary.
- A language-project member displays its live comment/remark as the primary label and its live path as secondary text. If no remark exists, use the existing no-remark translation.
- Each member row has an Element Plus switch on the right.
- A member switch is on only when that member's live global state is running.
- Turning a member switch on starts only that member; turning it off stops only that member.
- An unresolved/invalid member has a disabled switch.
- While the runner is executing, the group switch and every member switch are disabled.
- Remove the old Start and Stop text buttons.

### Footer

- Put an Element Plus checkbox with the `Default startup group` label on the left.
- Preserve the existing rule that an empty group cannot become the default group.
- Put Edit and Delete icon-only buttons on the right.
- Both buttons use Element Plus `small` size and tooltips. Delete keeps danger styling.
- Remove the old footer switch used for default selection.

## Data Flow

1. `GroupCard` receives the group and member descriptors containing references to the live reactive targets resolved by `StartupGroupSetup`.
2. Vue tracks the resolved global targets, so changes to `run`, `running`, `state.isRun`, or `state.running` update switches without page-owned polling.
3. A group-switch event is interpreted from live state: any running member means stop the group; otherwise start the group.
4. A member-switch event starts or stops only the selected saved item.
5. The runner serializes the action and updates the real global target objects through their existing `start` and `stop` methods.
6. Existing success and failure messages are generated from the runner result.

## Error and Edge-Case Handling

- Empty groups show the existing empty-members text, have an off and disabled group switch, and cannot be selected as default.
- Invalid members remain visible so the user can edit or delete the stale configuration, but their switches are disabled.
- A partially running group renders the group switch on; clicking it always requests a full-group stop.
- Repeated switch input is prevented by the runner-wide busy lock.
- If a live target disappears after the group was configured, derived resolution changes it to invalid instead of retaining stale cached state.
- Existing edit and delete behavior remains unchanged.

## Testing

- Add pure regression coverage for deriving member state from live target fields.
- Verify group-on logic is true when any member runs and false when none run.
- Verify partially running group input chooses full-group stop.
- Verify a stopped group input chooses full-group start.
- Verify a member input creates a one-member execution request with the correct action.
- Verify invalid members and runner-busy state disable the appropriate switches.
- Add source-contract checks for the header switch, member switches, footer checkbox, and small icon buttons where component mounting is not available.
- Run the Startup Group test, formatting, targeted lint/type checking, and `git diff --check` before completion.

## Out of Scope

- Changing the Startup Group persistence schema.
- Copying live service state into Startup Group configuration or a new status cache.
- Allowing concurrent Startup Group operations.
- Changing service-version or language-project start/stop implementations.
- Refactoring unrelated Startup Group editor changes already present in the worktree.
