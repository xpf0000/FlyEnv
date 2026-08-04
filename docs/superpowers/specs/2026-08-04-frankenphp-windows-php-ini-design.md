# FrankenPHP Windows PHP Configuration Design

## Goal

Ensure every Windows FrankenPHP version has a usable `php.ini` with its bundled PHP extensions enabled, whether it is newly installed, started directly, or opened from the service-list configuration action.

## Current State

Windows FrankenPHP installation only unpacks the release archive. Its bundled PHP therefore has no active `php.ini`, so the PHP extension directory and common extensions stay disabled. The PHP Windows module already has the required initialization behavior and its drawer editor provides the desired editing experience.

## Design

### One idempotent configuration initializer

Add a Windows-only PHP configuration initializer to the FrankenPHP fork module. Given a version directory, it will:

- Return the existing `php.ini` without changing it.
- Otherwise read `php.ini-development` and write the resulting content to `php.ini`; retain the PHP Windows module's production-template fallback only when the development template is unavailable.
- Enable `extension_dir = "ext"`.
- Add the PHP Windows module's common extension candidates only when the matching DLL exists in the version's `ext` directory. This preserves compatibility across FrankenPHP PHP builds and produces the reference configuration's enabled extensions for version 1.12.6.
- Write the same initialized content to `php.ini.default` so the editor's restore-default action has a stable baseline.

The initializer must be idempotent: it never overwrites an existing `php.ini`, including user edits.

### Lifecycle integration

Call the initializer in all paths that need a PHP configuration:

- After a Windows FrankenPHP archive has been unpacked, so a new installation is ready before its first start.
- At the start of `_startServer`, before the FrankenPHP command is launched, so old installed versions missing `php.ini` self-heal.
- From a public `getIniPath(version)` fork method used by the configuration editor, so editing an old installed version also self-heals through the exact same code path.

Initialization failures prevent startup and are returned through the existing fork error path. The editor receives no usable path if no PHP template is available, matching the PHP module's existing behavior.

### Service-list editor

Reuse the PHP `php.ini` drawer instead of creating a second editor implementation. Make the drawer accept the module type as a prop, defaulting to `php` to preserve its current callers. The prop drives both its `Conf` configuration type and its `getIniPath` IPC request.

Add a FrankenPHP-specific version action menu to the service list. On Windows it offers:

- Open the installed version directory.
- Edit `php.ini`, opening the reused drawer with `typeFlag: 'frankenphp'`.

The editor keeps the PHP drawer's raw editor, common PHP settings, load-default, custom import/export, and active-service restart behavior. The action is Windows-only because this configuration-initialization contract applies to Windows archive releases.

## Compatibility

- Existing FrankenPHP versions that already have a `php.ini` retain their exact configuration.
- Existing versions without one are initialized the next time they start or are edited.
- New Windows installations are initialized immediately after extraction.
- PHP's existing service-list configuration action remains unchanged because its editor's default module type is still `php`.
- Non-Windows FrankenPHP installation and startup behavior is unchanged.

## Verification

Add focused source-level regression coverage that checks the FrankenPHP initializer's template, extension-directory, extension-existence, installation, startup, and editor paths, plus the Windows service-list edit action and reusable PHP drawer routing. Run the focused script along with TypeScript/ESLint checks appropriate to the changed files.
