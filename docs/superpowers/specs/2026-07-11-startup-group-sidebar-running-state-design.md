# Startup Group Sidebar Running State Design

## Goal

The Startup Group item in the left navigation shows its running highlight whenever any member in any startup group is running.

## Scope

- Change only the Startup Group navigation item in `src/render/components/StartupGroup/aside.vue`.
- Keep the top global group start/stop control tied to the default startup group.
- Do not change individual group-card switch behavior.

## State Source

- Use the existing global `StartupGroupSetup` singleton.
- Read all groups from `appStore.config.setup.startupGroups` through `normalizeStartupGroupConfig`.
- Determine the navigation state from live member state:
  - service versions use their resolved installed target's `run` value;
  - project services use their resolved project's `state.isRun` value.
- Do not create a local running map, copied state, or polling timer.

## Source Loading

- The navigation component calls `StartupGroupSetup.ensureSources(groups)` when mounted.
- It calls the same method when the startup-group configuration changes.
- Source loading only ensures the global version/project objects exist; the navigation running state remains computed from those objects.

## UI Behavior

- Add the existing `run` CSS class to the Startup Group icon block when at least one member in any group is running.
- Remove the class when no startup-group member is running.
- A running member in a non-default group must still highlight the navigation item.

## Error Handling

- Source-loading failures do not create fallback state.
- The navigation remains based on the currently resolved global state and can update when sources become available later.

## Regression Coverage

- Verify the manager reports running when a member in any supplied group is running.
- Verify the navigation component uses all configured groups and the global manager.
- Verify no interval, polling state map, or duplicated run state is introduced.
