# PR 913 path boundary follow-up

User requested verification of all platforms, slash direction, spaces and path edge cases after the merged model-folder changes.

## Contract

- No new module or lifecycle owners. The existing fork download owns canonical path containment, downloaded bytes and sidecars; LlamaCppController remains the singleton catalogue owner. No new shared config, Pinia or service methods.
- Download start/progress/success/failure and duplicate/cancellation behavior stay unchanged. Canonical root/directory resolution is a required prerequisite before downloading. Failure rejects only that operation; no new retries, prompts or process checks. A failed prerequisite must not leave a downloaded model.
- Catalogue paths returned by a download and the directory scanner must use the same canonical spelling, including through symlink/junction roots. Canonical containment must reject escaped targets before a network transfer or file removal.
- Path verification uses real macOS filesystem I/O and native child-process argv, with win32/POSIX path and filesystem boundary simulation for Windows drive/UNC and Linux-style roots. No Windows/Linux native runtime is available; simulation is not native OS acceptance.

## Work

- [x] Pin the symlink-root download/scanner mismatch with a real-filesystem regression and test escape rejection before download.
- [x] Canonicalize the download root and target directory before building final/temporary filenames and metadata; retain per-file cleanup and abort checks.
- [x] Run persistent portable path tests and the path matrix, all llama.cpp tests, plugin contract and changed-file checks. Review independently.
- Integration: commit/push and synchronize master under the user's existing merge-and-repair authorization.

## Initial evidence

- 56 scratch assertions passed for Windows drive/UNC, POSIX roots, forward/back/mixed/trailing separators, spaces, Chinese, quotes, `$()`/`&`, scan → managed identity → launch preflight → argv → containment → deletion.
- A separate macOS symlink-root download returned the link path instead of realpath; scanner always returns realpath, so merging by localPath can register the same downloaded file twice.

## Final verification

- Symlink/junction fixture failed before the fix and passed after it; directory creation and both canonical lookups are reused rather than adding new filesystem queries.
- 76/76 llama.cpp tests passed; plugin contract builds renderer/fork successfully; targeted ESLint and git diff --check pass. Independent review found no remaining actionable issue in this change.
- Expanded scratch matrix: 72 assertions passed for scan, managed identity/preflight, argv echo in a real macOS child process, download/sidecar/rescan identity, deletion and containment. Filesystem operations execute on macOS; Windows drive/UNC and Linux-style roots use path/fs adapters, so this is not native Windows/Linux acceptance.
- Windows tests use a junction for the linked-root regression to avoid requiring symlink privilege. That choice has not been executed on native Windows in this session.
- The existing 52 repository-wide type diagnostics from the previous verification remain outside this focused patch; the full type checker was not rerun for this path-only follow-up.
