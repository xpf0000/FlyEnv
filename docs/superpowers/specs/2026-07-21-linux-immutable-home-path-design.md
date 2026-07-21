# Linux Immutable Home Path Design

## Goal

Allow FlyEnv services and helper-backed home-directory operations to work on immutable Fedora-family systems where `/home` is a system-managed symbolic link to `/var/home`, without changing FlyEnv's application-visible paths or allowing user-controlled symlink traversal in the privileged helper.

## Confirmed Cause

On Bazzite, Fedora Silverblue, Fedora Kinoite, and related Atomic desktops, `$HOME` commonly remains `/home/<user>` while the operating system defines `/home` as a symbolic link to `/var/home`.

Apache creates `start-<version>.sh` below FlyEnv's `/home/<user>/...` runtime directory and asks `flyenv-helper` to execute it as root. `ValidateRunScript()` calls the helper's generic read-path validation, which walks every path component with `os.Lstat`. The walk reaches `/home`, detects a symbolic link, and rejects the script before Apache is launched.

The same helper path guard is used by other privileged service starts and by helper-backed reads and writes of shell profile files. The defect is therefore caused by the helper treating a root-controlled operating-system alias as if it were a user-controlled symlink.

## Rejected Application-Path Canonicalization

The first design proposed changing FlyEnv's global Linux runtime root from `/home/<user>/...` to `/var/home/<user>/...`. A repository audit found that this would be unnecessarily invasive even though both paths reference the same files.

FlyEnv uses absolute paths as identities in several places:

- process discovery and shutdown test process command strings with `COMMAND.includes(global.Server.BaseDir)` and `COMMAND.includes(global.Server.AppDir)`;
- the renderer persists the selected service version and compares its `path` and `bin` fields with strict string equality;
- aliases and environment configuration use executable paths as object keys and regular-expression values;
- shell profile cleanup searches for the current FlyEnv data path as literal text.

Changing the global path spelling could temporarily miss services launched with the old spelling, reset persisted current-version selections, leave old PATH entries unmatched, or create duplicate alias/environment entries. It would also leave `global.Server.UserHome` unchanged, so helper operations on `/home/<user>/.bashrc` and similar files would still encounter the original error.

The application-path canonicalization approach is therefore rejected. FlyEnv will continue using the paths reported by Electron and the operating system.

## Selected Helper Approach

Keep the helper's default rule: any symbolic-link component causes privileged path validation to fail.

Add one Linux-only exception for the immutable-system home alias. When `PathHasSymlinkComponent()` reaches a symbolic-link component, it may continue walking only when all of the following are true:

- the component is exactly `/home`;
- `/home` is owned by UID 0;
- `/`, the directory containing the alias, is owned by UID 0 and is not writable by group or others;
- `filepath.EvalSymlinks("/home")` resolves exactly to `/var/home`;
- `/var/home` is a real directory rather than another symbolic link;
- `/var/home` is owned by UID 0 and is not writable by group or others;
- `/var`, the directory containing the resolved target, is owned by UID 0 and is not writable by group or others.

If any metadata lookup fails or any condition is not satisfied, the helper retains the current behavior and rejects the path.

The exception applies only to the `/home` component. The component walk still examines the complete requested path from the leaf upward. A symbolic link in `.config`, `FlyEnv`, `server`, `apache`, or any other user-controlled descendant is still detected and rejected before the trusted `/home` component is reached.

The helper executes the original `/home/<user>/...` path. Because the only tolerated alias is protected by root-owned, non-writable parent directories and has the expected immutable-system target, an unprivileged FlyEnv client cannot replace or redirect that alias between validation and execution.

## Platform Behavior

- Linux with a regular `/home` directory follows the existing no-symlink path and behaves unchanged.
- Linux with the verified `/home -> /var/home` system alias accepts that component.
- Linux with `/home` pointing anywhere else, with insecure ownership or permissions, or with an additional target symlink rejects the path.
- macOS and Windows never apply the exception and retain their current validation behavior.
- Other immutable-system aliases such as `/opt` or `/usr/local` are outside this fix and remain rejected if they occur in a validated business path.

## Helper Upgrade

Increase the Go helper version and the TypeScript client expectation from `16` to `17`.

Existing installations must reinstall the packaged helper to receive the new validation behavior. The allowed-roots file does not need migration: it continues storing FlyEnv's existing `/home/<user>/...` data root, so application paths, persisted configuration, and process command strings retain their current spelling.

The version is shared by all packaged helper builds, so macOS and Windows users will also see the normal helper upgrade flow even though the new trusted-alias behavior is Linux-only. This cross-platform reinstall was explicitly accepted for the release.

## Data Flow

1. FlyEnv keeps its existing `/home/<user>/...` runtime and home paths.
2. Helper installation records the same lexical FlyEnv allowed root.
3. A privileged service start sends `/home/<user>/.../start-<version>.sh` to `runScript`.
4. The helper validates the business scope and walks every path component.
5. User-controlled symbolic links are rejected normally.
6. The exact `/home` component is tolerated only after the Linux trusted-alias checks succeed.
7. The helper executes the original script path.

## Testing

Add focused Go tests around the helper path walker and trusted-alias policy:

- an ordinary temporary-directory symlink component remains rejected;
- a modeled trusted system alias may be skipped while the rest of the path is still inspected;
- a nested symlink below a modeled trusted alias remains rejected;
- the immutable-home policy accepts only `/home -> /var/home` with root ownership, secure parent permissions, and a real secure target directory;
- the policy rejects a wrong target, non-root ownership, writable parent directory, symlink target, insecure target directory, or missing metadata.

Keep filesystem metadata collection Linux-specific and the trust policy separately testable so the positive case does not require modifying the machine's real `/home` directory or running tests as root.

Update the existing helper version synchronization test to expect `17`, run it before changing production version declarations to confirm the red state, then update the Go and TypeScript versions together.

Run the focused helper tests, the complete helper test and vet commands with Go 1.24.5 or newer, the helper contract test, and the helper version synchronization test. If the local Go toolchain remains older, use the project-supported toolchain mechanism or report the unavailable verification explicitly.

## Security Properties

- User-controlled symlink components remain denied.
- The exception is Linux-only and exact-path-specific.
- Alias and target ownership and containing-directory permissions must establish that an unprivileged client cannot replace them.
- The resolved target must be the expected immutable Fedora location and may not itself be a symlink.
- Failure to prove trust fails closed.
- FlyEnv application paths and persisted path identities do not change.

## Out of Scope

- Allowing arbitrary root-owned or system-managed symlinks.
- Supporting immutable-system aliases other than `/home -> /var/home`.
- Redesigning helper path validation around file descriptors or Linux `openat2`.
- Changing Electron's `home`, `userData`, or FlyEnv runtime paths.
- Refactoring unrelated service startup, process discovery, alias, or environment behavior.
