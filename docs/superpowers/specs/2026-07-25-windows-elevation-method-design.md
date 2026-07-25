# Windows Elevation Method Design

## Goal

Add a Windows-only General-settings choice between `UAC` and `Helper`. The default is `Helper`. If the helper executable is unavailable or helper installation fails, persist and display `UAC` automatically. UAC intentionally supports only the existing seven fallback operations.

## Scope

- Render the setting only when `window.Server.isWindows` is true.
- Match the existing tray-popup-style control: title, optional help popover, and two `el-radio-button` choices.
- Persist `setup.windowsElevationMethod` as `helper` or `uac`; missing values resolve to `helper`.
- Do not add UAC implementations for operations outside the current fallback allowlist.

## Existing Windows Behavior

`Helper.send()` normally uses the installed Go helper. The existing UAC fallback can execute only these operations:

1. `tools/writeFileByRoot`
2. `tools/writeBufferBase64ByRoot`
3. `tools/rm`
4. `tools/setSystemPath`
5. `tools/setSystemEnv`
6. `tools/setAutoStartWin`
7. `host/sslAddTrustedCert`

Today, `helper_binary_missing` is rejected rather than sent through that fallback. The design changes that branch only for the seven supported operations.

## Design

### Configuration and fork propagation

`ConfigManager` supplies `setup.windowsElevationMethod` with a default of `helper`. `ServerManager.updateGlobalConfig()` copies the resolved value to `global.Server.WindowsElevationMethod`.

The renderer saves the preference through the existing `application:save-preference` path. The application refreshes its global server configuration after saving. `ForkItem` already posts a fresh serialized `Server` object before each task, so each fork receives the latest method without a separate fork protocol.

### User selection

Selecting `uac` saves it immediately. Selecting `helper` calls the existing `APP-FlyEnv-Helper-Install` IPC, whose `AppHelper.initHelper()` implementation first performs the health check and only installs when needed.

- On success, save and display `helper`.
- On failure, save and display `uac`.
- The control remains disabled while this verification/install operation is pending.

The main process broadcasts a dedicated elevation-method-changed renderer event after either value is persisted, so the radio group reflects automatic fallback as well as direct user selection.

### Execution policy

`Helper.send()` reads `global.Server.WindowsElevationMethod` on Windows.

- With `uac`, a fallback-allowlisted operation calls `runWindowsHelperFallback()` immediately. It does not check, install, or invoke the persistent helper.
- With `helper`, normal helper behavior is unchanged except for `helper_binary_missing`: an allowlisted operation immediately runs the same UAC fallback and emits a fork-to-main fallback notification.
- The main process handles that notification by persisting `uac`, updating `global.Server`, and broadcasting the changed method to the renderer.
- A non-allowlisted operation in UAC mode returns `windows_fallback_not_supported`; it must not silently activate the helper.

### Installation failure

The existing `AppHelper` status callback already reports `installFaild` after an elevation cancellation, installer error, or failed post-install health check. On Windows, when the active method is `helper`, the application treats that status as a method fallback: it persists `uac`, updates the global server state, and broadcasts the renderer event before retaining the existing failure notice.

This applies to on-demand helper installation as well as the verification triggered by changing the setting back to `helper`.

## Error Handling

- UAC cancellation or command failure remains an error for that operation; it does not change a user-selected `uac` preference.
- Only a missing helper executable or failed helper installation changes a `helper` preference to `uac`.
- Unsupported operations in UAC mode remain unsupported by design and do not cause a helper install prompt.

## Verification

- Extend the Windows helper send test to prove UAC mode skips helper health checks for an allowlisted operation.
- Extend it to prove `helper_binary_missing` uses UAC for an allowlisted operation and emits the fallback notification.
- Extend the state/config tests to verify the default, persistence, and non-allowlisted UAC rejection.
- Run the existing helper fallback-plan, helper-state, helper-send, helper-install IPC, and TypeScript/lint checks relevant to the touched files.
