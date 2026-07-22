# Go GVM Version Management Design

## Goal

Add GVM as a first-class Go version-management option in FlyEnv. Users on macOS and Linux can install GVM, inspect available and installed Go versions, install or uninstall a Go version, and select the default GVM version without leaving the Go module.

## Existing Behavior

The Go module currently exposes project management, service management, FlyEnv's shared version manager, and project creation. The shared version manager can install static Go distributions or packages from Homebrew and MacPorts, but FlyEnv has no GVM integration.

Java exposes SDKMAN through the shared version-manager source selector. Rust adds a dedicated Rustup page because Rustup has toolchain-specific state and actions that do not fit the shared source model. GVM likewise owns installed versions and a default selection, so the Rustup pattern is the closer match.

## Selected Approach

Add a dedicated `GVM` tab to the Go module on macOS and Linux. Keep the existing four tabs and their indexes unchanged, then append GVM as the fifth tab. Do not render the GVM tab on Windows because the official GVM implementation does not support Windows.

The GVM integration consists of three focused pieces:

- a Go renderer component that displays installation state, version rows, and actions;
- a reactive renderer setup object that owns IPC, terminal, loading, and refresh state;
- GVM-specific methods on the existing GoLang fork module for discovery and version-list parsing.

This avoids adding GVM-only concepts to the shared Homebrew/MacPorts/Static version-source model. It also avoids a broader SDKMAN/Rustup/GVM abstraction refactor that is not required for this feature.

## GVM Discovery

The fork process resolves the GVM root from a non-empty `GVM_ROOT` environment variable when present and otherwise uses `~/.gvm`. GVM is installed when `<gvm-root>/scripts/gvm` exists.

The renderer does not infer paths. A `checkGvm` IPC call returns the resolved initialization script path or `null`. This value is retained by the renderer and used to initialize every terminal command with:

```sh
source "<gvm-root>/scripts/gvm"
```

Windows returns no GVM integration through the UI and is not expected to execute these methods.

## Version Data and Parsing

After discovery succeeds, a `gvmData` IPC call sources GVM in a fresh shell and collects:

- `gvm listall` for available versions;
- `gvm list` for installed versions and the active/default marker.

Parsing is implemented as pure helpers so representative CLI output can be tested without installing GVM. Header lines, blank lines, decoration, and marker prefixes such as `=>` are discarded. Only single-token version identifiers made from letters, digits, dots, underscores, and hyphens are accepted; this prevents terminal control text or shell metacharacters from becoming executable command arguments.

The returned row model contains:

- `name`: the GVM identifier used by commands, such as `go1.24.5`;
- `version`: a display value with the leading `go` removed when applicable;
- `installed`: whether the identifier appears in `gvm list`;
- `isDefault`: whether a freshly initialized GVM shell marks the installed version as active.

Installed versions missing from `gvm listall` remain visible by merging both sources. This preserves locally installed legacy versions even if the remote list changes.

## Renderer Behavior

Opening the GVM tab triggers discovery and, when installed, fetches version data. The page has three states:

1. GVM discovery is pending.
2. GVM is absent and the page offers an Install action.
3. GVM is installed and a table shows versions, installed state, default state, and actions.

The version table supports the same basic refresh and terminal-task interaction as Rustup. Each row offers:

- Install when it is not installed;
- Uninstall when it is installed and is not the default;
- Set Default when it is installed and is not already the default.

The UI does not offer uninstall for the default version, avoiding a preventable GVM error and an ambiguous post-uninstall state.

## Commands

The GVM installer uses the official installation script:

```sh
bash < <(curl -sSL https://raw.githubusercontent.com/moovweb/gvm/master/binscripts/gvm-installer)
```

Version operations use:

```sh
gvm install <identifier> -B
gvm uninstall <identifier>
gvm use <identifier> --default
```

Binary installation with `-B` is the default because it avoids GVM's source-compilation bootstrap dependency on an older Go toolchain. FlyEnv does not add a source-build toggle in this change.

Renderer commands source the initialization script and apply FlyEnv's configured proxy command before network operations. The selected identifier must come from the validated parsed data rather than arbitrary user input.

All operations run in FlyEnv's embedded terminal so progress and CLI errors remain visible. After the terminal command finishes, FlyEnv rechecks GVM data and refreshes the Go module's installed-version data.

## Installed-Version Integration

The existing GoLang installed-version scan is extended with each directory immediately below `<gvm-root>/gos`. The existing Go binary detection and version parsing remain authoritative, so invalid or partial GVM directories do not become enabled Go installations.

The GVM paths are merged with user-configured Go directories and deduplicated through the existing installed-version pipeline. Static, Homebrew, MacPorts, and custom-directory behavior does not change.

## Error Handling

- Missing initialization script resolves to the not-installed state rather than throwing.
- Failure to run or parse GVM commands resolves to an empty list, clears the loading state, and leaves Refresh available.
- Installation, uninstall, and default-selection failures remain visible in the embedded terminal.
- A terminal action always exits the busy state and rechecks actual GVM state instead of optimistically mutating rows.
- An unreadable or missing `<gvm-root>/gos` directory is ignored by installed-version discovery.

## Testing

Add focused regression coverage that proves:

- `gvm listall` parsing removes headings and decorations and accepts safe version identifiers;
- `gvm list` parsing recognizes installed and active/default versions;
- merging retains installed versions absent from the available list;
- unsafe or malformed identifiers are rejected;
- Go installed-version discovery includes `<gvm-root>/gos` on supported platforms;
- the Go renderer appends GVM only on non-Windows platforms and preserves existing tab indexes;
- renderer commands use the initialization script, binary installation flag, uninstall command, and default-selection command;
- renderer IPC calls map to `checkGvm` and `gvmData` on the GoLang fork module.

Follow the repository's script-based regression-test style. Run each new test in a red-green cycle, then run the focused tests, TypeScript checking for the affected renderer and fork code, formatting/lint checks, and the relevant build when practical.

## Out of Scope

- Windows support or integration with a separate Windows Go version manager.
- Building Go from source through GVM.
- Managing GVM package sets or overlays.
- Replacing FlyEnv's static, Homebrew, MacPorts, or custom Go installation flows.
- Refactoring SDKMAN, Rustup, and GVM into a shared version-manager framework.
- Changing the selected FlyEnv service version automatically when the GVM default changes.
