# Linux Immutable Home Path Design

## Goal

Allow FlyEnv services that require the privileged helper to start on immutable Fedora-family systems where `/home` is a system-managed symbolic link to `/var/home`, while preserving the helper's existing rejection of symbolic-link components in privileged paths.

## Confirmed Cause

On Linux, `DetermineRunPath()` derives FlyEnv's runtime data directory lexically from Electron's `userData` path. On Bazzite, Fedora Silverblue, Fedora Kinoite, and related Atomic desktops, Electron commonly reports a path below `/home/<user>` even though `/home` resolves to `/var/home`.

Apache creates `start-<version>.sh` below that lexical runtime directory and asks `flyenv-helper` to execute it as root. `ValidateRunScript()` calls the helper's generic read-path validation, which walks every path component with `os.Lstat`. The walk reaches `/home`, detects that it is a symbolic link, and rejects the script before Apache is launched.

The same path is used by other Linux modules that call `serviceStartExec()` with `root: true`, so the defect is not Apache-specific.

## Selected Approach

Canonicalize FlyEnv's Linux runtime directory in the Electron main process before any global service paths are created. The helper continues to receive paths without symbolic-link components and its current symlink protection remains unchanged.

Add a small Electron-independent Linux path resolver. Given Electron's `home` and `userData` paths, it computes FlyEnv's normal runtime path and canonicalizes only the operating-system-provided home prefix:

- compute the existing lexical FlyEnv runtime path from `userData`;
- when that runtime path is inside Electron's reported home directory, resolve only the home directory with `realpathSync`;
- append the unchanged path relative to the home directory to the resolved home directory;
- when the runtime path is outside the reported home, or home resolution fails, retain the existing lexical path.

For `/home/user/.config/FlyEnv`, this changes only the trusted `/home/user` prefix to `/var/home/user`. It deliberately does not call `realpath` on `.config`, `FlyEnv`, or any service directory below them. User-controlled symbolic links below the home directory therefore remain visible to the helper's existing component walk and continue to be rejected.

`DetermineRunPath()` uses this resolver only on Linux. macOS and Windows path selection remains unchanged.

## Helper Upgrade and Allowed Roots

Increase the Go helper version and the TypeScript client expectation from `16` to `17`.

The version mismatch prompts existing users to reinstall the packaged helper. During installation, `AppHelper.command()` receives the already canonicalized FlyEnv data path and writes it to `/usr/local/share/FlyEnv/flyenv.allowed-roots`. On an affected system, the stored root therefore becomes `/var/home/<user>/.config/FlyEnv` instead of `/home/<user>/.config/FlyEnv`.

The helper binary does not relax `PathHasSymlinkComponent`, `ValidatePathForRead`, or `ValidateRunScript`. A user-controlled symlink inside the FlyEnv data directory continues to be rejected.

## Data Flow

1. Electron reports the Linux `home` and `userData` directories using the `/home/<user>` alias.
2. The Linux path resolver resolves the reported home to `/var/home/<user>` and appends the unchanged FlyEnv-relative suffix.
3. `SetupGlobalPaths()` derives `BaseDir`, `ApacheDir`, and the other service directories from the canonical runtime directory.
4. Service startup creates `start-*.sh` under the canonical service directory.
5. Helper version `17` installation records the canonical data root.
6. `ValidateRunScript()` confirms the script is inside that allowed root and finds no symbolic-link component.
7. The helper executes the script with the existing privileged command path.

## Testing

Add a focused TypeScript regression test for the Electron-independent Linux resolver. It will create temporary real and symbolic-link directories and verify:

- a FlyEnv directory below a `/home`-style system alias uses the real home prefix;
- a symbolic link below the home directory remains present in the returned path rather than being resolved;
- a normal path without symlinks is preserved;
- a runtime path outside Electron's reported home is preserved;
- realpath failure falls back to the lexical FlyEnv path.

Run the test before implementation and confirm it fails because the resolver does not exist. After implementation, run the focused test again.

Run the existing helper version synchronization test to confirm the Go and TypeScript versions both equal `17`. Run the helper contract checks and the relevant TypeScript formatting/type checks available in the repository. The Go helper test suite requires Go 1.24.5 or newer; if the local toolchain remains older, report that limitation rather than treating the suite as passed.

## Security Properties

- The helper's symlink-component rejection is not weakened.
- No general-purpose `EvalSymlinks` bypass is added to privileged path validation.
- Only Electron's operating-system-provided Linux home prefix is canonicalized before paths reach the helper.
- The path suffix below the home directory is never passed through `realpath`, so user-controlled symlinks in `.config`, `FlyEnv`, or service directories remain subject to the existing helper rejection.
- macOS and Windows behavior is unchanged apart from the shared helper version increment required for version synchronization.

## Out of Scope

- Allowing arbitrary symbolic-link components in helper read, write, remove, or script paths.
- Redesigning helper path validation around file descriptors or Linux `openat2`.
- Changing Electron's `home` or `userData` paths globally.
- Moving existing FlyEnv data; `/home/...` and `/var/home/...` already reference the same filesystem objects on affected systems.
- Refactoring unrelated service startup behavior.
