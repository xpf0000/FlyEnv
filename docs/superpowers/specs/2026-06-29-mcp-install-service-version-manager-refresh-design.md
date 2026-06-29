# MCP install_service Version Manager Refresh Design

## Summary

Fix the renderer-side state gap where AI CLI / MCP `install_service` updates the service list immediately, but the Version Manager online list still shows the installed version as not installed until the user clicks refresh.

## Current Behavior

1. MCP `install_service` installs a version successfully.
2. `MCPTools.installService()` refreshes `ServiceVersionManager` in the main process and emits `service-installed-need-update`.
3. The renderer receives the event and calls `module.applyInstalledVersions(versions)`.
4. `module.installed` is updated, so service-status-driven views reflect the new version.
5. `module.static[*].installed` is not recomputed, so Version Manager static rows keep stale install badges until `fetchStatic()` runs again.

## Root Cause

The renderer maintains two related but separate data sets for installable modules:

- `module.installed`: discovered installed versions
- `module.static`: online/downloadable versions with per-row `installed` flags

`applyInstalledVersions()` only updates `module.installed`. It does not synchronize the already-loaded `module.static` rows against the refreshed installed versions. As a result, MCP-triggered installs update one state source but not the other.

## Chosen Fix

Update `Module.applyInstalledVersions()` to synchronize online-list install flags immediately after `module.installed` is rebuilt.

Behavior:

- Build a fast lookup from refreshed installed versions.
- Recompute `item.installed` for each `module.static` row using the same version/bin matching rules used by the static installer flow.
- Leave fetch/caching behavior unchanged.
- Do not trigger a forced `fetchStatic()` on MCP events.

## Why This Approach

- Keeps the fix at the shared state boundary instead of adding another MCP-specific UI path.
- Updates all consumers that rely on `module.static` without extra network/disk work.
- Matches the existing user expectation from manual install flows: when installed versions change, online rows should reflect that change immediately.

## Non-Goals

- No refactor of MCP notification transport.
- No change to `fetchVerion()` caching behavior.
- No automatic refresh for brew/port/sdkman sources in this change.

## Testing

Add a renderer-level regression test that proves:

1. A module has a preloaded static online row for version `1.2.23` with `installed = false`.
2. MCP-style installed version refresh calls `applyInstalledVersions()` with `1.2.23` now installed.
3. The static row flips to `installed = true` without calling `fetchStatic()` or any manual refresh path.

Also run the existing MCP regression suite to ensure the install notification path still works end to end.
