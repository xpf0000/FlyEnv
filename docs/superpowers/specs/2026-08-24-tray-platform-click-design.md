# Tray platform click behavior

## Goal

Restore the modern tray popup behavior on macOS and Linux without changing the established Windows interaction.

## Behavior

- Windows binds the modern tray popup to `right-click` only.
- macOS and Linux bind the modern tray popup to both `click` and `right-click`.
- `double-click` continues to emit the existing `double-click` application event on every platform.
- Classic tray behavior is unchanged.

## Design

`TrayManager.addModernStyleListener()` owns the platform-specific Electron `Tray` event registration. It will select its popup trigger registrations from `isWindows()` before registering the existing double-click listener. `Application` remains unchanged: it receives the same `click` and `double-click` events emitted by `TrayManager`.

## Validation

Extend `scripts/node-tray-issues-test.ts` to assert both registration branches. The regression test must fail against the current right-click-only implementation, then pass after the conditional listener registration is added.
