# Unix directory permission compatibility audit

The user requested a macOS/Linux-wide review and removal of flow interruptions
based on expected directory ownership, modes or ACLs. Existing pending macOS
installer changes are preserved. Protocol 49 is still an unreleased working-tree
change and remains the coordinated release version for the combined fixes.

## Findings and chosen scope

- The common Go `protectedDirectory` gate rejects non-root ownership, group/other
  write bits and Darwin allow ACLs. Its direct and indirect callers affect helper
  policy/key loading and installation, socket initialization, FTP startup, FTP
  state reads and Linux FTP account updates. Replace it with a structural-only
  directory open shared by both platforms; remove the narrower Darwin workaround.
- Linux installation separately rejects `/etc/flyenv-helper` ownership and mode.
  Retain only its real-directory/no-symlink condition.
- The Linux `/home -> /var/home` compatibility exception also requires root-owned
  non-writable ancestor/target directories. Remove those directory permission
  criteria and the alias-owner condition while retaining the exact fixed
  alias/target and real-directory/symlink types; arbitrary aliases stay rejected.
- Existing helper directory metadata is also reset unconditionally by both
  installers. Initialize missing directories only; leave existing metadata alone.
- Removing directory gates exposes path-following socket chown/chmod to symlink
  replacement. macOS does not support opening a bound filesystem socket with
  O_EVTONLY (confirmed in a disposable probe). Create/configure the socket in new
  private staging, publish with renameat through pinned directory descriptors,
  and clean up only its published inode when the listener closes. Staging is
  created with mkdirat on the destination filesystem (Linux /run may be a separate
  mount); stage cleanup is descriptor-relative and nonrecursive. Never apply
  root metadata operations to the public user-managed socket pathname.
- File ownership/modes/ACLs, client identity, executable format, path containment
  and real filesystem errors are distinct from directory permission assumptions.
  Preserve them. TS service-log checks apply to actual files after a failed write
  access check, not directory metadata; no renderer/fork directory-mode gates
  were found in the scoped source search.
- FTP database generation also chmods an existing runtime directory to 0711 and
  unconditionally restores 0700. Move generation to independent private scratch
  storage so user runtime permissions are neither modified nor a restore gate.
  Root creates/reads the fixed files through the pinned directory descriptor;
  cleanup removes only operation-owned fixed entries and the identity-matched
  empty directory, never recursively following a replaceable scratch pathname.
- New protected files can inherit allow ACLs from user-configured directories.
  Normalize only freshly created private file ACLs before publication, rather
  than rejecting or recursively changing the existing directory's ACL.

## Operation contract and failure boundaries

Existing AppHelper, fork service controllers and native helper operations keep
their lifetime, progress/terminal events, request snapshots and duplicate-call
behavior. No UI/store/config state or lifecycle owner changes are introduced. Native
socket publication keeps its listener and published-inode cleanup under Run's
existing listener lifetime; private staging is removed after publication/error.
Required writes, native file ACL setup, actual process stop, service registration
and inaccessible/invalid paths still fail their dependents. Parent metadata is
not a prerequisite. Private temporary resources remain private; completed side
effects are not replayed because of a supplementary failure. No new module
exceptions, retries, privilege prompts or user-system changes are authorized.

## Plan and review checklist

- [x] Reproduce rejection of user-owned/writeable/common and allow-ACL directories,
  Linux installer metadata and writable immutable-home alias directories.
- [x] Centralize structural-only Unix directory handling, adjust Linux installer
  and fixed-alias checks, normalize new protected-file ACLs, isolate FTP scratch, preserve existing installer directory metadata, and publish sockets from private staging.
- [x] Verify actual path/file errors still propagate, existing file checks remain,
  and no directory ownership/mode/ACL gate remains in active Unix callers.
- [x] Run native Go tests/vet, isolated shell regressions, contract/version checks,
  cross-platform compilation and an independent review.

The initial Mac-only verification used isolated shell/policy fixtures and
cross-compilation. The user subsequently authorized native acceptance on a
running Parallels Debian 12 ARM64 VM; see the
[Linux VM acceptance results](linux-helper-vm-acceptance.md). The VM's initially
uninstalled helper state was restored after temporary deployment.

## Verification results

- macOS native Go `test -count=1 ./...` and `vet ./...` pass. Targeted socket/FTP
  `test -race` passes (the native race linker retains its LC_DYSYMTAB warning).
- 12 macOS installer and 10 Linux directory/installer fixture checks pass.
  Required stop/write/bootstrap errors remain failures; bootstrap exit 5 remains
  exit 5. Existing directory metadata is preserved and new directories receive
  traversal permissions.
- Directory-owner/mode/ACL gates, Linux installer ownership/write bits and fixed
  home-alias metadata rejection were reproduced before the changes. New-file ACL
  inheritance was separately reproduced after removing the parent gate and then
  fixed without clearing the existing directory ACL.
- FTP fixtures reproduce the previous 0775-to-0700 runtime-mode mutation and
  verify preservation after success/failure, ordinary child credentials, original
  DB retention and actual scratch cleanup. A scratch-directory replacement
  fixture reproduced recursive deletion of unrelated contents; pinned file I/O
  and nonrecursive inode-aware cleanup preserve both the result and replacement.
- Socket fixtures cover connectability/privacy, symlink-target preservation,
  cleanup retaining replacement inodes, error cleanup and 25 concurrent public
  pathname replacements. The Linux separate-tmpfs fixture is skipped on macOS
  and subsequently passed natively under both root and an ordinary UID in the VM.
- Independent review findings about public socket-path metadata writes,
  unconditional existing-directory resets, cross-mount rename and recursive
  socket-stage cleanup were addressed. Private socket staging now shares the
  pinned destination filesystem and is removed nonrecursively by identity.
- Helper and test binaries compile for Darwin arm64/amd64, Linux amd64/arm64 and
  Windows amd64. Contract (39 methods), protocol-49 synchronization, changed-file
  ESLint, both shell syntax checks and git diff whitespace checks pass.
- Final source scans of src/static/scripts/plugins/configs/build found no further
  user-directory owner/mode/ACL prerequisite in the scoped Unix paths. Actual
  file integrity and filesystem access errors remain distinct and are retained.

The installed Mac helper/services, hosts and user databases were not changed.
Native Linux/systemd installation, upgrade and service acceptance subsequently
passed; temporary VM assets were removed and its initial state restored.
Rebuild the helper and app to deliver these source changes. Newly signed macOS
release installation and packaged Electron privilege prompts remain untested.
