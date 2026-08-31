# PHP Project Directory Move Design

## Goal

Preserve every Composer-created project entry, including dotfiles, after PHP project creation on macOS, Linux, and Windows. The common path must move top-level directories with a native filesystem rename where possible, so large directories such as `vendor` are not traversed file by file.

## Scope

The active PHP project-creation path consists of the macOS/Linux dialog (`phpCreate.vue`), the Windows dialog (`phpCreate.win.vue`), and the Project fork module. All three active platform flows use the Project fork for final migration after the controller change. The remaining macOS/Linux static scripts are legacy, are not referenced by the current renderer or fork source, and will have their exact `mv ./* ../` command replaced. The unused `static/sh/Windows/project-new.cmd` artifact is removed; it was Bash syntax in a `.cmd` file and had no production caller.

No project directory is deleted. The selected document-root directory remains the destination and may already contain entries, matching the current workflow.

## Design

Composer continues to create a staging directory named `flyenv-create-project` directly inside the selected document root. Keeping staging inside the destination guarantees the source and destination are on the same filesystem. The Project fork then moves the staging directory's immediate children into the document root.

For each immediate child with no destination entry, the fork calls `fs.rename(sourceChild, destinationChild)`. This moves an entire non-conflicting directory as one filesystem operation, including all hidden descendants. If both the source and destination entries are real directories, the fork falls back to the existing recursive merge helper, then removes the now-empty source directory. Any other same-name collision, including files and symbolic links, rejects with `EEXIST`; it never delegates file replacement to the platform. This preserves existing directory merging while making file-collision behavior non-destructive and identical on macOS, Linux, and Windows.

The temporary staging directory is removed only after every child move succeeds. A failure rejects the fork command and leaves the remaining staging content for inspection; it never runs a blanket cleanup after a failed move.

## Platform Compatibility

Node `fs.rename` is used only by the fork, not by a shell command. It works on macOS, Linux, and Windows when source and destination are on the same filesystem. The staging directory is intentionally a child of the selected directory, so no `EXDEV` fallback is needed. The selected directory must not be concurrently modified while the project is being finalized; a conflict or a Windows lock/permission failure rejects without cleanup, leaving staging available for recovery.

The remaining static macOS and Linux project scripts are Bash scripts and are not active application paths. Both files will lose the exact `mv ./* ../` source pattern through the same Bash direct-child loop (`./*`, `./.[!.]*`, and `./..?*`). The loop runs `mv "$item" ../` for each existing or symbolic-link entry, including dotfiles and broken symbolic links, without macOS-incompatible `mv --` or BSD `find` extensions. Windows is covered by the active renderer-to-Fork path; the unused Windows-named `.cmd` artifact is deleted rather than treated as a compatibility path.

## Ownership And Operation Contract

| Item | Contract |
| --- | --- |
| Form values and dialog visibility | The mounted PHP create dialog owns them through the existing `ProjectSetup.form.PHP` fields. |
| Composer command and terminal lifecycle | A module-local `PhpProjectCreateController`, bound with `reactiveBind`, owns its `markRaw` terminal, immutable request snapshot, re-entry guard, cancellation flag, terminal completion, fork request, and terminal result. `running`, `created`, failure state, and terminal cleanup move out of `ProjectSetup`. |
| Filesystem migration and Laravel `.env` fallback | The Project fork owns it through `handleProjectDir`; renderer state is never accepted as proof that migration succeeded. |
| Start event | The dialog snapshots `dir`, PHP and Composer executables, selected framework/version, package, proxy values, and platform before calling `controller.start`. |
| Intermediate events | Existing XTerm output remains visible. The fork move emits no progress event because it is a short, single terminal phase. |
| Terminal success | The Composer terminal completes and, for non-WordPress projects, the fork successfully empties the staging directory; only then does the controller set `created = true` and clear `running`. |
| Terminal failure | Composer failure, cancellation, or fork failure clears `running`, leaves `created = false`, records the error, and does not remove untransferred staging content. |
| Duplicate invocation | `controller.start` returns its current in-flight promise while `running` is true. |
| Cancellation | `controller.stop` marks the operation cancelled before stopping XTerm. A stopped terminal completion must not invoke `handleProjectDir`. |

No new Pinia store, shared configuration field, persisted renderer state, generic lifecycle helper, or service lifecycle change is introduced.

## Verification

- A staging directory containing `.env`, `.gitignore`, a regular file, a symlink, and a nested `vendor` directory is moved into the destination, and staging is removed.
- A destination directory that already contains `vendor/existing.txt` merges with a staged `vendor/new.txt` without losing either file.
- A same-name `.env` file rejects with `EEXIST`, does not overwrite the destination value, and preserves the staged value for recovery.
- A failed destination move rejects and preserves the staging directory for recovery.
- The active macOS/Linux renderer uses `flyenv-create-project`, delegates only after terminal success, and contains no `mv ./* ../` command.
- The Windows renderer uses the same controller and fork command.
- Each remaining static project script contains no `mv ./* ../`, uses the Bash direct-child mover, and does not use `mv --` or `-maxdepth`.
- Run the focused assertion script on macOS, Linux, and Windows; manually create a Laravel project on each platform and inspect `.env`, `.gitignore`, `.gitattributes`, and `vendor`.
