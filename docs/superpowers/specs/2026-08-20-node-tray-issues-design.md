# Windows NVM and Tray Interaction

## Goal

Prevent FlyEnv from invoking Windows NVM/FNM commands, and ensure the modern tray popup is opened only by right-click while left double-click continues to show the main window.

## Design

- Treat Windows NVM/FNM as unsupported: skip external-manager detection, local-version enumeration, installation, switching, and installed-version discovery in the Windows fork; hide both selectors and normalize stale persisted selections to FlyEnv's built-in manager.
- Keep NVM/FNM support unchanged on macOS/Linux.
- Register the modern tray popup handler only for `right-click`; retain the existing `double-click` event for showing the main window.

## Verification

- A source-level regression script checks the Windows NVM guards, hidden selector, and right-click-only tray listener.
- TypeScript compilation of the changed files is run after the patch.
