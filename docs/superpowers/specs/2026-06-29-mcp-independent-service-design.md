# MCP Independent Service Design

## Summary

Add two MCP lifecycle preferences so FlyEnv can:

- auto-start the MCP server when the app launches
- optionally exclude MCP from group start/stop

MCP remains a service module in the UI, but its persistent lifecycle preferences are separated from its current runtime state.

## Problem

The current MCP wiring treats MCP like any other grouped service:

- [src/render/components/MCP/Module.ts](E:/Github/FlyEnv/src/render/components/MCP/Module.ts) marks MCP as `isService: true`
- [src/render/components/MCP/ASide.ts](E:/Github/FlyEnv/src/render/components/MCP/ASide.ts) always includes MCP in `groupDo()`
- [src/render/components/Aside/Index.vue](E:/Github/FlyEnv/src/render/components/Aside/Index.vue) computes group state by iterating all service modules

At the same time, [src/main/core/IPCHandler.ts](E:/Github/FlyEnv/src/main/core/IPCHandler.ts) currently mutates `mcp.enabled` inside `mcp:start` and `mcp:stop`, which conflates:

- "should start automatically next launch"
- "is currently running"

That coupling produces the wrong behavior for MCP. MCP may need to stay available for AI tools even when the user stops grouped local services.

## Goals

- Support two independent preferences: `autoStart` and `independentService`
- Keep all four preference combinations valid
- Start MCP automatically from the main process without requiring the MCP page to be opened
- Exclude independent MCP from all group start/stop behavior and group status calculations
- Preserve manual MCP control from the MCP page and side module toggle
- Avoid changing user preferences when the user manually starts or stops MCP

## Non-Goals

- No redesign of the tray service list or MCP module placement
- No changes to MCP tools, auth, transport, or audit behavior
- No changes to other services' group behavior
- No migration flow is required because this feature is not shipped yet

## Chosen Design

### 1. Configuration Model

Update [src/main/core/MCPConfigManager.ts](E:/Github/FlyEnv/src/main/core/MCPConfigManager.ts):

- remove `enabled` from the MCP preference model
- add `autoStart: boolean`
- add `independentService: boolean`
- default both to `false`

Runtime state remains separate:

- `MCPServer.running` remains the source of truth for whether the HTTP server is currently listening
- `mcp:start` and `mcp:stop` only change runtime state
- manual start/stop must not write back `autoStart` or `independentService`

This yields four explicit combinations:

1. `autoStart=false`, `independentService=false`
   MCP is manual at app launch and still participates in group start/stop.
2. `autoStart=true`, `independentService=false`
   MCP starts on app launch and still participates in group start/stop.
3. `autoStart=false`, `independentService=true`
   MCP stays manual and is skipped by group start/stop.
4. `autoStart=true`, `independentService=true`
   MCP starts on app launch and is skipped by group start/stop.

Any stale `enabled` field in a local dev `mcp.json` is ignored. No compatibility code is added.

### 2. App Startup Flow

Update [src/main/Application.ts](E:/Github/FlyEnv/src/main/Application.ts) after `mcpServer` is created in `initForkManager()`:

- read `mcpConfigManager.getConfig('autoStart', false)`
- if `true`, call `mcpServer.start()` directly from the main process
- do not route app-start auto-start through renderer IPC

This keeps MCP startup independent from:

- opening the MCP page
- renderer group auto-start
- side-module initialization order

Startup failure behavior:

- MCP auto-start failure must not block FlyEnv startup
- the error is logged in the main process
- MCP remains stopped and the MCP page reflects the stopped state through `mcp:status`

This design intentionally does not add a new global startup-failure toast in the first version.

### 3. Group Participation Model

Keep MCP as `isService: true` in [src/render/components/MCP/Module.ts](E:/Github/FlyEnv/src/render/components/MCP/Module.ts) so it still behaves like a service module for:

- side-module status
- single-module toggle behavior
- tray/service presentation

Add a runtime group-participation flag to [src/render/core/ASide.ts](E:/Github/FlyEnv/src/render/core/ASide.ts):

- extend `AppServiceModuleItem` with `participatesInGroup: boolean`

For ordinary services:

- default `participatesInGroup` to `true`

For MCP in [src/render/components/MCP/ASide.ts](E:/Github/FlyEnv/src/render/components/MCP/ASide.ts):

- set `participatesInGroup` to `!MCPSetup.config.independentService`

When `independentService === true`:

- MCP must be skipped by group start
- MCP must be skipped by group stop
- MCP must not make the group switch look "running"
- MCP must not make the group switch look disabled because MCP itself is starting/stopping

### 4. Group State and Group Actions

Update [src/render/components/Aside/Index.vue](E:/Github/FlyEnv/src/render/components/Aside/Index.vue) so every group-related calculation filters to service modules where `participatesInGroup !== false`.

This applies to:

- the list of modules used for `groupDo()`
- the list used for `groupIsRunning`
- the list used for `groupDisabled`
- the list used for `noGroupStart`
- any intermediate computed values that currently assume all `isService` modules are group-managed

This is required to avoid false group state. Example:

- if MCP is `independentService=true` and currently running
- and no grouped service is running
- then `groupIsRunning` must still be `false`

The tray's overall group state will remain correct automatically because it already derives from `groupIsRunning` and `groupDisabled`.

The tray's service list is unchanged; MCP can still appear there as an individual module.

### 5. MCP Page UI

Update [src/render/components/MCP/setup.ts](E:/Github/FlyEnv/src/render/components/MCP/setup.ts):

- remove `enabled` from `MCPConfig`
- add `autoStart`
- add `independentService`

Update [src/render/components/MCP/Service.vue](E:/Github/FlyEnv/src/render/components/MCP/Service.vue):

- add an `autoStart` switch
- add an `independentService` switch
- persist both immediately via `saveConfig()`

The new switches remain editable while MCP is running because they change future lifecycle policy, not the current bound host/port listener settings.

Existing host/port/allow-remote behavior remains unchanged:

- host/port still require MCP to be stopped before editing
- `allowRemote` still follows the existing warning flow

### 6. IPC Behavior

Update [src/main/core/IPCHandler.ts](E:/Github/FlyEnv/src/main/core/IPCHandler.ts):

- `handleMcpStart()` must stop setting any persistent lifecycle preference
- `handleMcpStop()` must stop setting any persistent lifecycle preference
- `handleMcpGetConfig()` and `handleMcpSetConfig()` continue to expose the full MCP config, now including `autoStart` and `independentService`

No new IPC commands are required.

### 7. i18n

Update MCP locale strings to add:

- `autoStart`
- `autoStartTip`
- `independentService`
- `independentServiceTip`

Minimum scope for this change:

- [src/lang/en/mcp.json](E:/Github/FlyEnv/src/lang/en/mcp.json)
- [src/lang/zh/mcp.json](E:/Github/FlyEnv/src/lang/zh/mcp.json)

The wording should communicate:

- `autoStart`: start MCP automatically when FlyEnv launches
- `independentService`: skip MCP during group start/stop

## File Impact

Expected implementation files:

- [src/main/core/MCPConfigManager.ts](E:/Github/FlyEnv/src/main/core/MCPConfigManager.ts)
- [src/main/Application.ts](E:/Github/FlyEnv/src/main/Application.ts)
- [src/main/core/IPCHandler.ts](E:/Github/FlyEnv/src/main/core/IPCHandler.ts)
- [src/render/core/ASide.ts](E:/Github/FlyEnv/src/render/core/ASide.ts)
- [src/render/components/MCP/ASide.ts](E:/Github/FlyEnv/src/render/components/MCP/ASide.ts)
- [src/render/components/Aside/Index.vue](E:/Github/FlyEnv/src/render/components/Aside/Index.vue)
- [src/render/components/MCP/setup.ts](E:/Github/FlyEnv/src/render/components/MCP/setup.ts)
- [src/render/components/MCP/Service.vue](E:/Github/FlyEnv/src/render/components/MCP/Service.vue)
- [src/lang/en/mcp.json](E:/Github/FlyEnv/src/lang/en/mcp.json)
- [src/lang/zh/mcp.json](E:/Github/FlyEnv/src/lang/zh/mcp.json)

## Testing

Implementation should verify the following behaviors:

1. `mcp:getConfig` and `mcp:setConfig` correctly round-trip `autoStart` and `independentService`.
2. When `autoStart=true`, FlyEnv launch starts MCP without opening the MCP page.
3. When `autoStart=false`, FlyEnv launch leaves MCP stopped.
4. When `independentService=true`, group start does not call MCP start and group stop does not call MCP stop.
5. When `independentService=false`, MCP still participates in group start/stop.
6. When `independentService=true` and MCP is running alone, group state still reports "not running".
7. MCP manual start/stop from the MCP page continues to work and does not mutate lifecycle preferences.

Manual verification is acceptable for UI behavior if no targeted automated harness exists yet, but preference and group-state logic should be covered by focused regression checks where practical.
